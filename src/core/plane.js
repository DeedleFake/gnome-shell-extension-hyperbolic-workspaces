// The domain: WHERE each workspace sits. One owner for seats, the tile graph and the center.
// Pure: no gi://, no signals, no timers. The shell pushes a Snapshot; the plane answers with a Change.
//
// Truth split (from candidate B's linear-order analysis):
//   sequence (who is older)     -> GNOME index order, passed in every Snapshot, never written back
//   membership (who has a tile) -> derived each sync: hasWindows || active
//   position + down edge        -> this module's WeakMap. Not derivable from order.
/** @import {TileId, Edge, Seat, Snapshot, Change, Motion} from './types.js' */
import * as G from './geometry.js';

/**
 * A geometry result as the plane applies it: the next placement state and the demo's per-id moves.
 * @typedef {{state: {anchor: TileId, ws: {id: number, tile: TileId, down: Edge}[], nextId: number},
 *            moves: {id: number, from: TileId|undefined, to: TileId, down: [Edge|undefined, Edge], via?: {root: TileId, from: TileId, G: object}}[]}} Placement
 */

/**
 * THE spot for the open question "does the active workspace's piece stay put when connect slides
 * pieces back?". Every geometry result passes through it before the plane commits it.
 * @callback ActivePiecePolicy
 * @param {Placement} proposed  what geometry.js computed
 * @param {{tiling: G.Tiling, before: Placement['state'], activeId: number|null}} ctx
 * @returns {Placement}
 */

/** Default: geometry.js decides, as in the demo. @type {ActivePiecePolicy} */
export const geometryDecides = proposed => proposed;

const EMPTY = Object.freeze({motions: Object.freeze([]), center: 0});

/** @template {object} K */
export class Plane {
    /** @param {{fillOrder?: 'distance'|'rings', activePiece?: ActivePiecePolicy}} [config] */
    constructor(config = {}) {
        this._fillOrder = config.fillOrder ?? 'distance';
        this._activePiece = config.activePiece ?? geometryDecides;
        /** THE side table. Only Plane writes it. @type {WeakMap<K, Seat>} */
        this._seats = new WeakMap();
        /** Placement id per key, for geometry.js, which speaks ids. @type {WeakMap<K, number>} */
        this._idOf = new WeakMap();
        this._T = new G.Tiling(4, 5);
        /** @type {Placement['state']} */
        this._state = G.emptyState(this._T.origin);
        /** Seated keys in GNOME order, rebuilt by every commit. @type {K[]} */
        this._seated = [];
        /** @type {K|null} */
        this._active = null;
        /** @type {Map<K, TileId>} one-shot landing hints from reserve() */
        this._hints = new Map();
        /** @type {Set<() => Iterable<[TileId, number]>>} */
        this._pinSources = new Set();
        this._generation = 0;
    }

    /**
     * Reconcile with GNOME. Idempotent: a second call with the same snapshot returns no motions.
     * Seated keys that are no longer live leave first (the plane leads GNOME's 1 s removal grace),
     * then live keys that have no seat open on their reserve() hint or the nearest free tile.
     * @param {Snapshot<K>} snap
     * @param {(tile: TileId) => Edge} screenDown  edge drawn nearest screen bottom now (ViewState)
     * @returns {Change<K>}
     */
    sync(snap, screenDown) {
        this._active = snap.active;
        const live = new Set(snap.order.filter(k => k === snap.active || snap.hasWindows(k)));
        const keyOf = this._keyMap();
        const log = [];
        let s = this._state;
        for (const k of this._seated) {
            if (live.has(k)) continue;
            const idx = s.ws.findIndex(w => w.id === this._idOf.get(k));
            s = this._apply(G.removeWorkspace(this._T, s, idx), s, log);
        }
        for (const k of snap.order) {
            if (!live.has(k) || this._seats.has(k)) continue;
            const hint = this._hints.get(k);
            this._hints.delete(k);
            const free = hint !== undefined && this._T.tiles[hint] && !s.ws.some(w => w.tile === hint);
            const tile = free ? hint : G.nearestFree(this._T, s, this._fillOrder);
            const r = G.openWorkspace(this._T, s, tile, screenDown(tile));
            this._idOf.set(k, r.added.id);
            keyOf.set(r.added.id, k);
            s = this._apply(r, s, log);
        }
        for (const k of this._hints.keys()) if (!snap.order.includes(k)) this._hints.delete(k);
        return this._commit(s, log, keyOf, snap.order);
    }

    /**
     * Modifier-drag of a whole workspace. Returns the would-be Change without committing,
     * so hover previews and the final drop are the same computation. Refuses (empty plan) for the active key.
     * @param {K} key @param {TileId} tile @param {TileId} from  entry neighbor the drag crossed (insert direction)
     * @returns {{change: Change<K>, commit: () => Change<K>}}
     */
    planDrag(key, tile, from) {
        const id = this._idOf.get(key);
        if (key === this._active || !this._seats.has(key) || !this._T.tiles[tile]) {
            const none = {...EMPTY, center: this.center};
            return {change: none, commit: () => none};
        }
        const gen = this._generation, base = this._state, log = [];
        const s = this._apply(G.dropWorkspace(this._T, base, id, tile, from), base, log);
        const change = this._change(s, log, this._keyMap(), this._seated);
        const commit = () => gen === this._generation
            ? this._commit(s, log, this._keyMap(), this._seated)
            : this.planDrag(key, tile, from).commit();
        return {change, commit};
    }

    /** The next sync that seats `key` puts it on `tile` (a window dropped on an empty tile). @param {K} key @param {TileId} tile */
    reserve(key, tile) { this._hints.set(key, tile); }

    /** @param {K} key @returns {Seat|undefined} undefined <=> no tile (the spare, or emptied and not active) */
    seatOf(key) { return this._seats.get(key); }
    /** @returns {readonly K[]} seated keys in GNOME order; PgUp/PgDn walk this */
    seated() { return this._seated; }
    /** @param {TileId} tile @returns {K|undefined} */
    at(tile) { return this._seated.find(k => this._seats.get(k).tile === tile); }
    /** @returns {TileId} the group's center (follows the group) */
    get center() { return this._state.anchor; }

    /**
     * Read-only geometry for ViewState and DiskModel: neighbors, frames(root, rings), relP, rings.
     * Never call a mutating Tiling method (prune) from outside; register pins instead.
     * @returns {Readonly<G.Tiling>}
     */
    get tiling() { return this._T; }
    /** Tile ids another owner still holds (view root, focus, running segments). Kept by every prune. @param {() => Iterable<[TileId, number]>} source @returns {() => void} unregister */
    addPinSource(source) {
        this._pinSources.add(source);
        return () => this._pinSources.delete(source);
    }

    /** @param {Placement} r @param {Placement['state']} before @param {Placement['moves'][]} log */
    _apply(r, before, log) {
        const activeId = this._active === null ? null : this._idOf.get(this._active) ?? null;
        const p = this._activePiece(r, {tiling: this._T, before, activeId});
        log.push(p.moves);
        return p.state;
    }

    _keyMap() { return new Map(this._seated.map(k => [this._idOf.get(k), k])); }

    /** Seat per key after `s`, and the motions from the current seats to them. */
    _change(s, log, keyOf, order) {
        const via = new Map(), times = new Map();
        for (const moves of log) for (const m of moves) {
            via.set(m.id, m.via ?? null);
            times.set(m.id, (times.get(m.id) ?? 0) + 1);
        }
        const next = new Map(s.ws.map(w => [keyOf.get(w.id), w]));
        /** @type {Motion<K>[]} */
        const motions = [];
        for (const k of new Set([...this._seated, ...order.filter(k => next.has(k))])) {
            const from = this._seats.get(k) ?? null, w = next.get(k);
            const to = w ? Object.freeze({tile: w.tile, down: w.down}) : null;
            if (from && to && from.tile === to.tile && from.down === to.down) continue;
            const v = times.get(this._idOf.get(k)) === 1 ? via.get(this._idOf.get(k)) : null;
            motions.push(Object.freeze({key: k, from, to, via: v && from && v.from === from.tile ? {root: v.root, G: v.G} : null}));
        }
        return Object.freeze({motions: Object.freeze(motions), center: s.anchor});
    }

    _commit(s, log, keyOf, order) {
        const change = this._change(s, log, keyOf, order);
        for (const m of change.motions) {
            if (m.to) this._seats.set(m.key, m.to);
            else this._seats.delete(m.key);
        }
        this._seated = order.filter(k => this._seats.has(k));
        const rank = new Map(this._seated.map((k, i) => [this._idOf.get(k), i]));
        this._state = {...s, ws: [...s.ws].sort((a, b) => rank.get(a.id) - rank.get(b.id))};
        const pins = [[s.anchor, 6], ...s.ws.map(w => [w.tile, 2])];
        for (const src of this._pinSources) for (const p of src()) if (this._T.tiles[p[0]]) pins.push(p);
        this._T.maybePrune(pins);
        if (change.motions.length) this._generation++;
        return change;
    }
}
