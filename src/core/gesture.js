// Pure pointer state machine for the plane's empty space and workspace bodies (previews keep GNOME's DnD).
// Input is already in disk coords with the hit resolved, so this runs in node with a fake clock.
/** @import {TileId} from './types.js' */

/**
 * @template K
 * @typedef {{type: 'press'|'motion'|'release'|'cancel', p: [number, number]|null, tile: TileId|null,
 *            key: K|null, moveMod: boolean, onRim: boolean, timeMs: number}} PointerEvent
 */
/**
 * What the shell should do. Closed union; the shell maps each to one ViewState/Plane call.
 * @template K
 * @typedef {{kind: 'pan', last: [number, number], p: [number, number]}
 *   | {kind: 'click', tile: TileId}
 *   | {kind: 'rim'}
 *   | {kind: 'carry', key: K, tile: TileId, from: TileId}      hover changed: preview plane.planDrag
 *   | {kind: 'drop', key: K, tile: TileId, from: TileId}       commit the last plan
 *   | {kind: 'cancelCarry'}} Intent
 */

/** @template K */
export class GestureMachine {
    /** @param {{dragThresholdPx?: number}} [config] */
    constructor(config = {}) { throw new Error('not implemented'); }
    /**
     * press on body/empty space -> moveMod && key ? arm carry : arm pan; motion past threshold starts it;
     * release without motion -> click (or rim); Escape/grab loss -> cancel.
     * @param {PointerEvent<K>} ev @returns {Intent<K>[]}
     */
    handle(ev) { throw new Error('not implemented'); }
}
