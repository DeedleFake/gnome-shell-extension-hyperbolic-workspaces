// The ONLY module that imports resource:///org/gnome/shell/ui/*. Every patch is on one InjectionManager,
// so stop() is clear() plus destroying the live PlaneView. Hook B + C of ground/gnome51.md.
//
// Patched (all exist in 51.1; re-check this list on every GNOME bump, test/verify.sh asserts each):
//   WorkspacesDisplay._updateWorkspacesViews  after orig: replace the PRIMARY view with PlaneView (probe A: clean)
//   WorkspacesDisplay._nextWorkspace / _prevWorkspace   -> view.nav('pageDown'|'pageUp'), keeping the
//                                                         WINDOW_PICKER + reactive guards of _moveToWorkspace
//   WorkspacesDisplay._moveToWorkspace        Home -> view.nav('home'); End -> unbound
//   WorkspacesDisplay._updateSwipeTracker     swipe tracker disabled (it assumes a line)
//   ControlsManagerLayout._computeWorkspacesBoxForState   WINDOW_PICKER: largest square; thumbnails hidden
// Not patched: WorkspacesView (never built on the primary monitor), Workspace, WindowPreview, search, Enter, Escape.
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
// import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
// import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
// import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
// import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class OverviewHook {
    /**
     * @param {{plane: import('../core/plane.js').Plane<object>, view: import('../core/view.js').ViewState<object>,
     *          disk: import('../disk/index.js').DiskModel, settings: import('./settings.js').Settings,
     *          windowMoves: import('./windowMoves.js').WindowMoves}} config
     */
    constructor(config) { this._cfg = config; this._inj = new InjectionManager(); this._view = null; }

    /**
     * Install every patch above. PlaneView gets GNOME's Workspace class and the overview adjustment
     * injected here, so planeView.js imports no ui module.
     */
    start() { throw new Error('not implemented'); }
    /** clear() patches, destroy the live PlaneView. Idempotent. */
    stop() { throw new Error('not implemented'); }
}
