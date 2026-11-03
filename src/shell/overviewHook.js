// The ONLY module that imports resource:///org/gnome/shell/ui/*. Every patch is on one InjectionManager,
// so stop() is clear() plus rebuilding GNOME's own views if the Overview is open.
//
// Patched (all exist in 51.1; re-check this list on every GNOME bump):
//   WorkspacesDisplay._updateWorkspacesViews   after orig: replace the PRIMARY view with PlaneView (probe A)
//   WorkspacesDisplay._updateSwipeTracker      after orig: swipe tracker disabled (it assumes a line)
//   ThumbnailsBox._updateShouldShow            after orig: never shown (the minimap is a line too)
// Not patched: WorkspacesView (never built on the primary monitor), Workspace, WindowPreview, search, Enter,
// Escape. PgUp/PgDn/Home/End never reach WorkspacesDisplay's binding pool: PlaneView stops them in the display's
// captured-event, which runs before the bindings.
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';
import GObject from 'gi://GObject';
import {PlaneView} from './planeView.js';

/** GNOME's mover, for createWindowMoves (planeView.js and windowMoves.js import no ui module). */
export const moveWindow = (...args) => Main.moveWindowToMonitorAndWorkspace(...args);

export class OverviewHook {
    /** @param {{plane, view, disk, settings, windowMoves}} config */
    constructor(config) { this._cfg = config; this._inj = null; this._view = null; this._display = null; }

    start() {
        if (this._inj) return;
        this._inj = new InjectionManager();
        const hook = this;
        this._inj.overrideMethod(WorkspacesView.WorkspacesDisplay.prototype, '_updateWorkspacesViews', orig => function () {
            orig.call(this);
            hook._display = this;
            const i = this._primaryIndex, old = this._workspacesViews[i];
            if (!old) return;
            old.destroy();
            const view = hook._view = new PlaneView({
                ...hook._cfg,
                monitorIndex: i,
                overviewAdjustment: this._overviewAdjustment,
                WorkspaceClass: Workspace.Workspace,
                workArea: () => Main.layoutManager.getWorkAreaForMonitor(i),
                hideOverview: () => Main.overview.hide(),
                dragResult: DND.DragMotionResult,
            });
            view.connect('destroy', () => { if (hook._view === view) hook._view = null; });
            // GNOME focuses the display, so its PgUp/PgDn/Home/End bindings would fire before ours.
            this.connectObject('captured-event', (_a, e) => view.handleKey(e), view);
            // Leaving search drops key focus to nothing, where our keys would reach no one.
            Main.overview._overview.controls._searchController.connectObject('notify::search-active', c => {
                if (!c.searchActive && !global.stage.key_focus) view.grab_key_focus();
            }, view);
            view.visible = this._primaryVisible;
            this.bind_property('opacity', view, 'opacity', GObject.BindingFlags.SYNC_CREATE);
            this.add_child(view);
            this._workspacesViews[i] = view;
        });
        this._inj.overrideMethod(WorkspacesView.WorkspacesDisplay.prototype, '_updateSwipeTracker', orig => function () {
            orig.call(this);
            this._swipeTracker.enabled = false;
        });
        this._inj.overrideMethod(WorkspaceThumbnail.ThumbnailsBox.prototype, '_updateShouldShow', orig => function () {
            orig.call(this);
            if (!this._shouldShow) return;
            this._shouldShow = false;
            this.notify('should-show');
        });
        this._rebuild();
    }

    /** The plane changed outside a PlaneView intent (a sync): redraw the live view. */
    refresh() { this._view?.kick(); }

    /** clear() patches and rebuild GNOME's own views. Idempotent. */
    stop() {
        if (!this._inj) return;
        this._inj.clear();
        this._inj = null;
        this._rebuild();
        this._view = null;
        this._display = null;
    }

    /** Apply the current patch set to whatever GNOME has built now. */
    _rebuild() {
        const display = Main.overview._overview?.controls?._workspacesDisplay;
        const thumbs = Main.overview._overview?.controls?._thumbnailsBox;
        if (thumbs) { thumbs._shouldShow = null; thumbs._updateShouldShow(); }
        if (!display) return;
        display._updateSwipeTracker();
        if (Main.overview.visible) display._updateWorkspacesViews();
    }
}
