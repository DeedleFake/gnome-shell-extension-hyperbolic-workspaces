// The domain: WHERE each workspace sits. One owner for seats, the tile graph and the center.
// Pure: no gi://, no signals, no timers. The shell pushes a Snapshot; the plane answers with a Change.
//
// Truth split (from candidate B's linear-order analysis):
//   sequence (who is older)   -> GNOME index order, passed in every Snapshot, never written back
//   membership (who has a tile) -> derived each sync: hasWindows || active
//   position + down edge       -> this module's WeakMap. Not derivable from order.
/** @import {TileId, Edge, Seat, Snapshot, Change, Frame} from './types.js' */
import * as G from './geometry.js';

/** @template {object} K */
export class Plane {
    /** @param {{fillOrder?: 'distance'|'rings'}} [config] */
    constructor(config = {}) {
        this._config = config;
        /** THE side table. Only Plane writes it. @type {WeakMap<K, Seat>} */
        this._seats = new WeakMap();
        this._T = new G.Tiling(4, 5);
        /** Last snapshot's seated keys in GNOME order (a cache rebuilt by every sync, not a second list). @type {K[]} */
        this._seated = [];
        /** @type {Map<K, TileId>} one-shot landing hints from reserve() */
        this._hints = new Map();
        /** @type {Array<() => Iterable<[TileId, number]>>} */
        this._pinSources = [];
    }

    /**
     * Reconcile with GNOME. Idempotent: a second call with the same snapshot returns no motions.
     * Pseudocode:
     *   live = order.filter(k => hasWindows(k) || k === active)
     *   state.ws = seated-and-live keys, slot id = rank in `order` (connect's list-order tie-break = GNOME order)
     *   each seated-not-live key: G.removeWorkspace       (plane leads GNOME's 1 s removal grace; by design)
     *   each live-not-seated key: G.openWorkspace(hint ?? G.nearestFree, screenDown(tile))
     *   active's piece ranks first in connect (needs the prototype change in RATIONALE "Next step")
     *   write seats, clear used hints, prune with pins, diff -> Motion[]
     * @param {Snapshot<K>} snap
     * @param {(tile: TileId) => Edge} screenDown  edge drawn nearest screen bottom now (ViewState)
     * @returns {Change<K>}
     */
    sync(snap, screenDown) { throw new Error('not implemented'); }

    /**
     * Modifier-drag of a whole workspace. Returns the would-be Change without committing,
     * so hover previews and the final drop are the same computation. Refuses (empty plan) for the active key.
     * @param {K} key @param {TileId} tile @param {TileId} from  entry neighbor the drag crossed (insert direction)
     * @returns {{change: Change<K>, commit: () => Change<K>}}
     */
    planDrag(key, tile, from) { throw new Error('not implemented'); }

    /** The next sync that seats `key` puts it on `tile` (a window dropped on an empty tile). @param {K} key @param {TileId} tile */
    reserve(key, tile) { throw new Error('not implemented'); }

    /** @param {K} key @returns {Seat|undefined} undefined <=> no tile (the spare, or emptied and not active) */
    seatOf(key) { return this._seats.get(key); }
    /** @returns {readonly K[]} seated keys in GNOME order; PgUp/PgDn walk this */
    seated() { return this._seated; }
    /** @param {TileId} tile @returns {K|undefined} */
    at(tile) { throw new Error('not implemented'); }
    /** @returns {TileId} the group's center (follows the group) */
    get center() { throw new Error('not implemented'); }

    /**
     * Read-only geometry for ViewState and DiskModel: neighbors, frames(root, rings), relP, rings.
     * Never call a mutating Tiling method (prune) from outside; register pins instead.
     * @returns {Readonly<G.Tiling>}
     */
    get tiling() { return this._T; }
    /** Tile ids another owner still holds (view root, focus, running segments). Kept by every prune. @param {() => Iterable<[TileId, number]>} source @returns {() => void} unregister */
    addPinSource(source) { throw new Error('not implemented'); }
}
