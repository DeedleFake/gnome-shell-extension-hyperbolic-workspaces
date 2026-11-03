// Adapter from Mutter to Plane.sync. Reads GNOME; never writes workspace order (no reorder_workspace).
// Holds signal ids only; the Meta.Workspace -> seat map is the Plane's WeakMap.
/** @import {Snapshot} from '../core/types.js' */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class WorkspaceSource {
    /** @param {{workspaceManager: object, display: object}} config  global.workspace_manager, global.display */
    constructor(config) {
        this._cfg = config; this._ids = []; this._dpyIds = []; this._wsIds = []; this._idle = 0; this._onChange = null;
        this._mutter = null;
    }

    /**
     * Connect notify::n-workspaces, workspaces-reordered, active-workspace-changed, and per-workspace
     * window-added/window-removed (reconnected on n-workspaces). Each fires `onChange(this.snapshot())`
     * from one GLib idle, so a burst of signals is one sync. Calls onChange once now. Runs with the Overview closed too.
     * @param {(snap: Snapshot<object>) => void} onChange
     */
    start(onChange) {
        this._onChange = onChange;
        const wm = this._cfg.workspaceManager;
        const q = () => this._queue();
        this._ids = [
            wm.connect('notify::n-workspaces', () => { this._watchWorkspaces(); q(); }),
            wm.connect('workspaces-reordered', q),
            wm.connect('active-workspace-changed', q),
        ];
        const dpy = this._cfg.display;
        this._dpyIds = ['window-entered-monitor', 'window-left-monitor'].map(sig => dpy.connect(sig, q));
        this._mutter = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        this._mutterId = this._mutter.connect('changed::workspaces-only-on-primary', q);
        this._watchWorkspaces();
        onChange(this.snapshot());
    }

    /** Idempotent. */
    stop() {
        const wm = this._cfg.workspaceManager;
        for (const id of this._ids) wm.disconnect(id);
        this._ids = [];
        for (const id of this._dpyIds) this._cfg.display.disconnect(id);
        this._dpyIds = [];
        if (this._mutter) this._mutter.disconnect(this._mutterId);
        this._mutter = null;
        this._unwatch();
        if (this._idle) GLib.source_remove(this._idle);
        this._idle = 0;
        this._onChange = null;
    }

    /** @returns {Snapshot<object>} */
    snapshot() {
        const wm = this._cfg.workspaceManager;
        const order = [];
        for (let i = 0; i < wm.n_workspaces; i++) order.push(wm.get_workspace_by_index(i));
        // Workspaces on every monitor: a window on any of them keeps its workspace on the plane.
        const primary = this._mutter?.get_boolean('workspaces-only-on-primary') === false ? null
            : this._cfg.display.get_primary_monitor();
        const hasWindows = ws => ws.list_windows().some(w =>
            !w.skip_taskbar && !w.is_on_all_workspaces() && (primary === null || w.get_monitor() === primary));
        return Object.freeze({order: Object.freeze(order), hasWindows, active: wm.get_active_workspace()});
    }

    _queue() {
        if (this._idle) return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._idle = 0;
            this._onChange?.(this.snapshot());
            return GLib.SOURCE_REMOVE;
        });
    }

    _watchWorkspaces() {
        this._unwatch();
        const wm = this._cfg.workspaceManager;
        for (let i = 0; i < wm.n_workspaces; i++) {
            const ws = wm.get_workspace_by_index(i);
            for (const sig of ['window-added', 'window-removed'])
                this._wsIds.push([ws, ws.connect(sig, () => this._queue())]);
        }
    }

    _unwatch() {
        for (const [ws, id] of this._wsIds) ws.disconnect(id);
        this._wsIds = [];
    }
}
