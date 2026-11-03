// Pure view model: how the plane is LOOKED AT. Camera (candidate A) + focus/reach/nav (candidate B), one owner.
// Ports app.js view, rebase, visible, screenDown, reach, neighborMove, listMove, goHome, goTo, slideSeg, rim.
// No actors, no timers: the shell samples frameOf(now) and calls step(now) from a frame clock.
/** @import {TileId, Edge, Frame, Focus, Nav, Change, FrameSet} from './types.js' */
/** @import {Plane} from './plane.js' */

/** @template {object} K */
export class ViewState {
    /** @param {{plane: Plane<K>}} config  Registers itself as a pin source on the plane. */
    constructor(config) { throw new Error('not implemented'); }

    /**
     * Take a Change into running segments (rigid via M.slidePow, settle otherwise) and fix focus:
     * if focus is a tile that a workspace slid into, focus that workspace. The aeeca52 fix, once, here.
     * @param {Change<K>} change
     */
    absorb(change) { throw new Error('not implemented'); }

    /**
     * Everything one frame draws. content.get(k) = tileFrame ∘ rot(seat.down·90°): the down rotation
     * lives here, so PlaneView and DiskModel never see `down` (fixes candidate A's PlaneView leak).
     * Tiles to 7 rings, centers inside |c| < 0.997; rim null while the group is drawn big enough.
     * @param {number} nowMs @returns {FrameSet<K>}
     */
    frameOf(nowMs) { throw new Error('not implemented'); }

    /** Focused tile + edge + corner neighbors (corner match 1e-9). The interactable set. @returns {ReadonlySet<TileId>} */
    reach() { throw new Error('not implemented'); }
    /** @returns {Focus<K>} */
    get focus() { throw new Error('not implemented'); }

    /**
     * A key we own. Arrows: drawn edge neighbor nearest the arrow angle. PgUp/PgDn: plane.seated() order.
     * Home: fly to center, upright. Moves focus only; never activates (demo default; open question).
     * @param {Nav} nav
     */
    nav(nav) { throw new Error('not implemented'); }

    /**
     * Click on a tile in reach. First click focuses; a click on the already focused tile returns 'enter'.
     * @param {TileId} tile @returns {'focus'|'enter'|'ignored'}
     */
    click(tile) { throw new Error('not implemented'); }

    /** Plain drag: view <- M.to(p) ∘ M.to(last)^-1 ∘ view, then rebase. Disk coords. @param {[number, number]} last @param {[number, number]} p */
    panBy(last, p) { throw new Error('not implemented'); }
    /** Advance animations. @param {number} nowMs @returns {boolean} false when idle (stop the frame clock) */
    step(nowMs) { throw new Error('not implemented'); }
    /** Edge of `tile` drawn nearest screen bottom now (app.js screenDown). New workspaces take this down. @param {TileId} tile @returns {Edge} */
    screenDown(tile) { throw new Error('not implemented'); }
}
