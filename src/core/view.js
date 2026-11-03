// Pure view model: how the plane is LOOKED AT. Camera (candidate A) + focus/reach/nav (candidate B), one owner.
// Ports app.js view, rebase, visible, screenDown, reach, neighborMove, listMove, goHome, goTo, slideSeg, rim.
// No actors, no timers: the shell samples frameOf(now) and calls step(now) from a frame clock.
/** @import {TileId, Edge, Frame, Focus, Nav, Change, FrameSet, Motion} from './types.js' */
/** @import {Plane} from './plane.js' */
import {C, M, wrapAngle, lerpFrame} from './geometry.js';

const DUR = 300;
const DRAW_DEPTH = 7;
const INSIDE = 0.997 * 0.997;
const QUARTER = Math.PI / 2;
const RIM_SHOW = 0.06, RIM_HIDE = 0.15, RIM_FADE_MS = 200;
const ARROW = {right: 0, up: QUARTER, left: Math.PI, down: -QUARTER};

const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const cq = down => M.rot(((down ?? 0) * Math.PI) / 2);
const nearestQ = alpha => ((Math.round(alpha / QUARTER) % 4) + 4) % 4;
const clamp = (z, r) => { const d = Math.sqrt(C.abs2(z)); return d > r ? C.scale(z, r / d) : z; };

/**
 * A running workspace motion: segments relative to `fromTile`'s frame (app.js applyMoves).
 * `t0` is null until the next step(now) or frameOf(now) starts the clock.
 * @template K @typedef {{key: K, segs: object[], t0: number|null, dur: number}} Anim
 */

/** @template {object} K */
export class ViewState {
    /** @param {{plane: Plane<K>}} config  Registers itself as a pin source on the plane. */
    constructor(config) {
        this._plane = config.plane;
        this._T = config.plane.tiling;
        const center = config.plane.center;
        /** Screen frame of tile `root` is R. */
        this._view = {root: center, R: M.id()};
        /** @type {Focus<K>} */
        this._focus = {kind: 'tile', tile: center};
        /** @type {{tile: TileId, phases: object[], t0: number|null}|null} */
        this._viewAnim = null;
        /** @type {Anim<K>[]} */
        this._anims = [];
        this._rim = {opacity: 0, angle: null, t: null};
        this._unpin = config.plane.addPinSource(() => this._pins());
    }

    /**
     * Take a Change into running segments (rigid via M.slidePow, settle otherwise) and fix focus:
     * if focus is a tile that a workspace slid into, focus that workspace. The aeeca52 fix, once, here.
     * @param {Change<K>} change
     */
    absorb(change) {
        for (const m of change.motions) {
            this._anims = this._anims.filter(a => a.key !== m.key);
            if (this._focus.kind === 'ws' && this._focus.key === m.key && !m.to)
                this._focus = {kind: 'tile', tile: m.from.tile};
            if (!m.from || !m.to) continue;
            const segs = [this._slideSeg(m.from, m.to, m.via, DUR * 1.2)];
            this._anims.push({key: m.key, segs, t0: null, dur: segs[0].dur});
        }
        if (this._focus.kind === 'tile') this._setFocusTile(this._focus.tile);
    }

    /**
     * Everything one frame draws. content.get(k) = tileFrame ∘ rot(seat.down·90°): the down rotation
     * lives here, so PlaneView and DiskModel never see `down` (fixes candidate A's PlaneView leak).
     * Tiles to 7 rings, centers inside |c| < 0.997; rim null while the group is drawn big enough.
     * @param {number} nowMs @returns {FrameSet<K>}
     */
    frameOf(nowMs) {
        this.step(nowMs);
        const tiles = new Map();
        for (const [id, {F}] of this._T.frames(this._view.root, DRAW_DEPTH)) {
            const S = M.compose(this._view.R, F);
            if (C.abs2(M.center(S)) < INSIDE) tiles.set(id, S);
        }
        const content = new Map();
        for (const k of this._plane.seated()) {
            const anim = this._anims.find(a => a.key === k);
            const seat = this._plane.seatOf(k);
            const F = anim ? this._animFrame(anim, nowMs) : this._content(seat.tile, seat.down);
            if (F && C.abs2(M.center(F)) < INSIDE) content.set(k, F);
        }
        return {tiles, content, rim: this._rimAt(content, nowMs)};
    }

    /** Focused tile + edge + corner neighbors (corner match 1e-9). The interactable set. @returns {ReadonlySet<TileId>} */
    reach() {
        const f = this._focusTile();
        const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([u, v]) => this._T.local(u, v));
        const near = (a, b) => C.abs2(C.add(a, C.scale(b, -1))) < 1e-9;
        const out = new Set();
        for (const [t, {F}] of this._T.frames(f, 2))
            if (corners.some(c => corners.some(d => near(M.apply(F, d), c)))) out.add(t);
        return out;
    }

    /** @returns {Focus<K>} */
    get focus() { return this._focus; }

    /**
     * A key we own. Arrows: drawn edge neighbor nearest the arrow angle. PgUp/PgDn: plane.seated() order.
     * Home: fly to center, upright. Moves focus only; never activates (demo default; open question).
     * @param {Nav} nav
     */
    nav(nav) {
        if (nav === 'home') { this._goTo(this._plane.center, true); return; }
        if (nav === 'pageUp' || nav === 'pageDown') {
            const list = this._plane.seated();
            if (!list.length) return;
            const i = this._focus.kind === 'ws' ? list.indexOf(this._focus.key) : -1;
            const j = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + (nav === 'pageDown' ? 1 : -1)));
            this._goTo(this._plane.seatOf(list[j]).tile);
            return;
        }
        const from = this._focusTile();
        const base = this._screenFrame(from) ?? M.id();
        const c = M.center(base), tt = this._T.tiles[from], nb = this._T.neighbors(from);
        let best = nb[0], err = Infinity;
        for (let k = 0; k < 4; k++) {
            const z = M.center(M.compose(base, this._T.rel[k][tt.tw[k]]));
            const e = Math.abs(wrapAngle(Math.atan2(z[1] - c[1], z[0] - c[0]) - ARROW[nav]));
            if (e < err) { err = e; best = nb[k]; }
        }
        this._goTo(best);
    }

    /**
     * Click on a tile in reach. First click focuses; a click on the already focused tile returns 'enter'.
     * @param {TileId} tile @returns {'focus'|'enter'|'ignored'}
     */
    click(tile) {
        if (!this.reach().has(tile)) return 'ignored';
        if (tile === this._focusTile()) return 'enter';
        this._goTo(tile);
        return 'focus';
    }

    /** Plain drag: view <- M.to(p) ∘ M.to(last)^-1 ∘ view, then rebase. Disk coords. @param {[number, number]} last @param {[number, number]} p */
    panBy(last, p) {
        this._viewAnim = null;
        this._view.R = M.compose(M.compose(M.to(clamp(p, 0.95)), M.inv(M.to(clamp(last, 0.95)))), this._view.R);
        this._rebase();
    }

    /** Advance animations. @param {number} nowMs @returns {boolean} false when idle (stop the frame clock) */
    step(nowMs) {
        const va = this._viewAnim;
        if (va) {
            va.t0 ??= nowMs;
            let t = nowMs - va.t0, done = true;
            this._view.root = va.tile;
            for (const ph of va.phases) {
                if (t <= ph.dur) {
                    const p = ease(t / ph.dur);
                    this._view.R = lerpFrame(ph.from, ph.to, p, ph.rot ? p : 0);
                    done = false;
                    break;
                }
                t -= ph.dur;
            }
            if (done) { this._view.R = va.phases.at(-1).to; this._viewAnim = null; }
        }
        for (const a of this._anims) a.t0 ??= nowMs;
        this._anims = this._anims.filter(a => nowMs - a.t0 < a.dur);
        const rimMoving = this._rim.t !== null && this._rim.opacity !== this._rim.target && nowMs - this._rim.t < RIM_FADE_MS;
        return this._viewAnim !== null || this._anims.length > 0 || rimMoving;
    }

    /** Edge of `tile` drawn nearest screen bottom now (app.js screenDown). New workspaces take this down. @param {TileId} tile @returns {Edge} */
    screenDown(tile) {
        const F = this._screenFrame(tile);
        return F ? nearestQ(-M.split(F).alpha) : 0;
    }

    /** Stop pinning tiles on the plane. */
    destroy() { this._unpin(); }

    _focusTile() {
        return this._focus.kind === 'ws' ? this._plane.seatOf(this._focus.key)?.tile ?? this._plane.center : this._focus.tile;
    }

    _setFocusTile(tile) {
        const k = this._plane.at(tile);
        this._focus = k === undefined ? {kind: 'tile', tile} : {kind: 'ws', key: k};
    }

    _pins() {
        const out = [[this._view.root, DRAW_DEPTH + 1], [this._focusTile(), 2]];
        if (this._viewAnim) out.push([this._viewAnim.tile, 2]);
        for (const a of this._anims) for (const s of a.segs) {
            out.push([s.fromTile, 2]);
            if (s.rigid) out.push([s.rigid.root, 2]);
        }
        return out;
    }

    _rebase() {
        const T = this._T, v = this._view;
        for (let guard = 0; guard < 64; guard++) {
            const t = T.tiles[v.root], nb = T.neighbors(v.root);
            let best = -1, bd = C.abs2(M.center(v.R));
            for (let k = 0; k < 4; k++) {
                const d = C.abs2(M.center(M.compose(v.R, T.rel[k][t.tw[k]])));
                if (d < bd - 1e-12) { bd = d; best = k; }
            }
            if (best === -1) break;
            v.R = M.norm(M.compose(v.R, T.rel[best][t.tw[best]]));
            v.root = nb[best];
        }
    }

    _screenFrame(tile) {
        const F = this._T.relFrame(this._view.root, tile, DRAW_DEPTH);
        return F ? M.compose(this._view.R, F) : null;
    }

    _content(tile, down) {
        const F = this._screenFrame(tile);
        return F && M.compose(F, cq(down));
    }

    /** Screen angle of any tile, however far (app.js screenAngle). */
    _screenAngle(tile) {
        const T = this._T;
        let F = this._screenFrame(tile);
        if (!F) {
            const step = t => T.rel[T.tiles[t].pk][T.tiles[T.tiles[t].parent].tw[T.tiles[t].pk]];
            const up = new Set();
            for (let t = this._view.root; t !== -1; t = T.tiles[t].parent) up.add(t);
            const down = [];
            let lca = tile;
            for (; !up.has(lca); lca = T.tiles[lca].parent) down.push(lca);
            const mul = (f, g) => {
                const a = C.add(C.mul(f.a, g.a), C.mul(f.b, C.conj(g.b))), b = C.add(C.mul(f.a, g.b), C.mul(f.b, C.conj(g.a)));
                const k = 1 / Math.sqrt(C.abs2(a));
                return {a: C.scale(a, k), b: C.scale(b, k)};
            };
            F = this._view.R;
            for (let t = this._view.root; t !== lca; t = T.tiles[t].parent) F = mul(F, M.inv(step(t)));
            for (let i = down.length - 1; i >= 0; i--) F = mul(F, step(down[i]));
        }
        const z = M.center(F);
        return Math.atan2(z[1], z[0]);
    }

    /** Animate the view so `tile` ends at the center ("upright after move"; Home blends). */
    _goTo(tile, upright = false) {
        let F0 = this._screenFrame(tile);
        if (!F0) {
            const a = this._screenAngle(tile);
            F0 = M.to([0.97 * Math.cos(a), 0.97 * Math.sin(a)]);
        }
        const drift = M.compose(M.inv(M.to(M.center(F0))), F0);
        const dur = DUR * Math.min(2, 0.75 + 0.25 * M.dist0(F0) / (2 * this._T.rE));
        const k = this._plane.at(tile);
        const up = M.inv(cq(k === undefined ? 0 : this._plane.seatOf(k).down));
        const phases = upright
            ? [{from: F0, to: up, dur, rot: true}]
            : [{from: F0, to: drift, dur, rot: false}, {from: drift, to: up, dur: DUR * 0.7, rot: true}];
        this._viewAnim = {tile, phases, t0: null};
        this._view.root = tile;
        this._view.R = F0;
        this._setFocusTile(tile);
    }

    /** app.js slideSeg: rigid along the piece's slide when `via` is set, else straight between centers. */
    _slideSeg(from, to, via, dur) {
        const T = this._T, off = cq(from.down);
        const rel = M.compose(T.relFrame(from.tile, to.tile, DRAW_DEPTH) ?? M.id(), cq(to.down));
        const Fu = via && T.relFrame(via.root, from.tile, DRAW_DEPTH);
        if (!Fu) return {fromTile: from.tile, off, rel, dur};
        const D = M.compose(M.compose(M.inv(Fu), M.compose(via.G, Fu)), off);
        return {fromTile: from.tile, off, rel, dur,
            rigid: {root: via.root, Fu, G: via.G, turn: wrapAngle(M.split(M.compose(M.inv(D), rel)).alpha)}};
    }

    _animFrame(a, nowMs) {
        let el = nowMs - (a.t0 ?? nowMs), seg = a.segs.at(-1), p = 1;
        for (const sg of a.segs) { if (el <= sg.dur) { seg = sg; p = el / sg.dur; break; } el -= sg.dur; }
        const base = this._screenFrame(seg.fromTile);
        if (!base) return null;
        const e = ease(p);
        if (!seg.rigid) return M.compose(base, lerpFrame(seg.off, seg.rel, e));
        const {Fu, G, turn} = seg.rigid;
        return M.compose(base, M.compose(M.compose(M.inv(Fu), M.slidePow(G, e)), M.compose(Fu, M.compose(seg.off, M.rot(turn * e)))));
    }

    /** Rim arrow toward the center: full at scale 0.06, none at 0.15, eased over 200 ms. */
    _rimAt(content, nowMs) {
        let s = 0;
        for (const F of content.values()) s = Math.max(s, 1 - C.abs2(M.center(F)));
        const n = this._plane.seated().length;
        const target = n ? Math.max(0, Math.min(1, (RIM_HIDE - s) / (RIM_HIDE - RIM_SHOW))) : 0;
        const prev = this._rim, k = prev.t === null ? 0 : Math.min(1, (nowMs - prev.t) / RIM_FADE_MS);
        const opacity = target > prev.opacity ? Math.min(target, prev.opacity + k) : Math.max(target, prev.opacity - k);
        const angle = opacity > 0 && n ? this._screenAngle(this._plane.center) : prev.angle;
        this._rim = {opacity, angle, t: nowMs, target};
        return opacity > 0 ? {angle, opacity} : null;
    }
}
