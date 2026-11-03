// Pure pointer state machine for the plane's empty space and workspace bodies (previews keep GNOME's DnD).
// Input is already in disk coords with the hit resolved, so this runs in node with a fake clock.
/** @import {TileId} from './types.js' */

/**
 * `xy` is the stage position in px, for the drag threshold. `p` is the same point in disk coords.
 * @template K
 * @typedef {{type: 'press'|'motion'|'release'|'cancel', p: [number, number]|null, xy: [number, number],
 *            tile: TileId|null, key: K|null, moveMod: boolean, onRim: boolean, timeMs: number}} PointerEvent
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

/**
 * @template K
 * @typedef {{kind: 'idle'}
 *   | {kind: 'pressed', mode: 'pan'|'carry'|'rim', start: PointerEvent<K>}
 *   | {kind: 'panning', last: [number, number]}
 *   | {kind: 'carrying', key: K, hover: TileId|null, from: TileId}} Phase
 */

/** @template K */
export class GestureMachine {
    /** @param {{dragThresholdPx?: number}} [config] */
    constructor(config = {}) {
        this._threshold = config.dragThresholdPx ?? 4;
        /** @type {Phase<K>} */
        this._phase = {kind: 'idle'};
    }

    /**
     * press on body/empty space -> moveMod && key ? arm carry : arm pan; motion past threshold starts it;
     * release without motion -> click (or rim); Escape/grab loss -> cancel.
     * @param {PointerEvent<K>} ev @returns {Intent<K>[]}
     */
    handle(ev) {
        const ph = this._phase;
        if (ev.type === 'press') {
            const mode = ev.onRim ? 'rim' : ev.moveMod && ev.key !== null ? 'carry' : 'pan';
            this._phase = {kind: 'pressed', mode, start: ev};
            return [];
        }
        if (ev.type === 'cancel') {
            this._phase = {kind: 'idle'};
            return ph.kind === 'carrying' ? [{kind: 'cancelCarry'}] : [];
        }
        if (ev.type === 'motion') return this._motion(ph, ev);
        this._phase = {kind: 'idle'};
        if (ph.kind === 'pressed') {
            if (ph.mode === 'rim') return ev.onRim ? [{kind: 'rim'}] : [];
            return ph.start.tile !== null ? [{kind: 'click', tile: ph.start.tile}] : [];
        }
        if (ph.kind === 'carrying')
            return ph.hover === null ? [{kind: 'cancelCarry'}] : [{kind: 'drop', key: ph.key, tile: ph.hover, from: ph.from}];
        return [];
    }

    /** @param {Phase<K>} ph @param {PointerEvent<K>} ev @returns {Intent<K>[]} */
    _motion(ph, ev) {
        if (ph.kind === 'pressed') {
            const [x0, y0] = ph.start.xy;
            if (Math.hypot(ev.xy[0] - x0, ev.xy[1] - y0) <= this._threshold || ph.mode === 'rim') return [];
            if (ph.mode === 'carry') {
                this._phase = {kind: 'carrying', key: ph.start.key, hover: ph.start.tile, from: ph.start.tile};
                return this._motion(this._phase, ev);
            }
            if (!ph.start.p) return [];
            this._phase = {kind: 'panning', last: ph.start.p};
            return this._motion(this._phase, ev);
        }
        if (ph.kind === 'panning') {
            if (!ev.p) return [];
            const last = ph.last;
            ph.last = ev.p;
            return [{kind: 'pan', last, p: ev.p}];
        }
        if (ph.kind === 'carrying' && ev.tile !== ph.hover) {
            if (ph.hover !== null) ph.from = ph.hover;
            ph.hover = ev.tile;
            return ev.tile === null ? [{kind: 'cancelCarry'}] : [{kind: 'carry', key: ph.key, tile: ev.tile, from: ph.from}];
        }
        return [];
    }
}
