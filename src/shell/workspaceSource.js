// Adapter from Mutter to Plane.sync. Reads GNOME; never writes workspace order (no reorder_workspace).
// Holds signal ids only; the Meta.Workspace -> seat map is the Plane's WeakMap.
/** @import {Snapshot} from '../core/types.js' */

export class WorkspaceSource {
    /** @param {{workspaceManager: object, display: object}} config  global.workspace_manager, global.display */
    constructor(config) { this._cfg = config; this._ids = []; }

    /**
     * Connect notify::n-workspaces, workspaces-reordered, active-workspace-changed, and per-workspace
     * window-added/window-removed (reconnected on n-workspaces). Each fires `onChange(this.snapshot())`
     * from one GLib idle, so a burst of signals is one sync. Runs with the Overview closed too.
     * @param {(snap: Snapshot<object>) => void} onChange
     */
    start(onChange) { throw new Error('not implemented'); }
    /** Idempotent. */
    stop() { throw new Error('not implemented'); }

    /**
     * Fresh read: order = get_workspace_by_index(0..n), hasWindows = list_windows() has a
     * non-skip-taskbar normal window on the primary monitor (same rule as WorkspaceTracker), active.
     * @returns {Snapshot<object>}
     */
    snapshot() { throw new Error('not implemented'); }
}
