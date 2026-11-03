// The plane actor on the primary monitor. Built per Overview open (like GNOME's views), destroyed on hide.
// Holds no domain state: frames come from ViewState, seats from Plane, model from DiskModel.
/** @import {Change} from '../core/types.js' */

/**
 * GObject.registerClass(class PlaneView extends St.Widget {...}) in the real file; reactive, can_focus.
 *
 * GNOME contract (what WorkspacesDisplay/ControlsManager call on the primary view; workspacesView.js:972-1112).
 * Probe A implemented exactly these and ran open/switch/hide with no JS error:
 *   getActiveWorkspace(), prepareToLeaveOverview(), syncStacking(stackIndices),
 *   startTouchGesture(), endTouchGesture(), navigate_focus (St), visible, opacity (bound by the display).
 */
export class PlaneView {
    /**
     * @param {{plane, view, disk, gesture, windowMoves, settings, monitorIndex: number,
     *          overviewAdjustment: object, WorkspaceClass: Function}} config
     */
    constructor(config) { throw new Error('not implemented'); }

    /**
     * Allocation and every frame-clock tick:
     *   fs = view.frameOf(now); d = disk rect of our box
     *   for [k, F] of fs.content:
     *     h = disk.place(F, workAreaSize, d); if (!h) hide actor
     *     ws = actors.get(k) ?? new WorkspaceClass(k, mon, overviewAdjustment)  // k is the Meta.Workspace
     *     ws.allocate(work-area box at 0,0); ws.set_pivot_point(0, 0); ws.set_transform(toMatrix(h))
     *     ws.stateAdjustment.value = spread progress; ws.reactive = view.reach().has(plane.seatOf(k).tile)
     *   destroy actors whose key left fs.content; child order = draw order (focus last), owned here only
     *   backdrop (St.DrawingArea) draws fs.tiles outlines + fs.rim
     * @param {Clutter.ActorBox} box
     */
    vfunc_allocate(box) { throw new Error('not implemented'); }

    /** Arrows/PgUp/PgDn/Home -> view.nav; everything else EVENT_PROPAGATE (type-to-search, Enter, Escape stay GNOME's). */
    vfunc_key_press_event(event) { throw new Error('not implemented'); }

    /** Captured pointer events -> disk.toDisk -> gesture.handle -> one ViewState/Plane/windowMoves call per Intent.
     * Swallows Workspace's own empty-space click (workspace.js:1075) so "click focuses, click again enters" holds. */
    vfunc_captured_event(event) { throw new Error('not implemented'); }

    getActiveWorkspace() { throw new Error('not implemented'); }
    prepareToLeaveOverview() { throw new Error('not implemented'); }
    /** @param {number[]} stackIndices */
    syncStacking(stackIndices) { throw new Error('not implemented'); }
    startTouchGesture() {}
    endTouchGesture() {}
}

/**
 * H3 -> Graphene.Matrix, row-vector order: [h00,h10,0,h20, h01,h11,0,h21, 0,0,1,0, h02,h12,0,h22]
 * (perspective in elements 3 and 7; verified by the probe matrices). Only this file knows the layout.
 * @param {import('../core/types.js').H3} h
 */
export function toMatrix(h) { throw new Error('not implemented'); }
