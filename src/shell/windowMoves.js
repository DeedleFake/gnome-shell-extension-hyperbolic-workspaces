// SEAM for putting a window on a tile, or the user on an empty one.

/**
 * @typedef {object} WindowMoves
 * @property {(metaWindow: object, tile: import('../core/types.js').TileId) => boolean} dropOn
 *   Move the window to the workspace on `tile`, or to a fresh workspace that the next sync seats there.
 *   False when the window is already on that workspace.
 * @property {(tile: import('../core/types.js').TileId) => object} openOn
 *   A fresh workspace that the next sync seats on `tile` (entering an empty tile activates it).
 */

/**
 * @param {{plane: object, workspaceManager: object, monitorIndex: () => number,
 *          moveWindow: (w: object, monitor: number, index: number, append: boolean) => void}} deps
 * @returns {WindowMoves}
 */
export function createWindowMoves(deps) {
    const {plane, workspaceManager: wm} = deps;
    /** GNOME's trailing spare when it has no seat (it is not active), else a new one appended. */
    const fresh = () => {
        const last = wm.get_workspace_by_index(wm.n_workspaces - 1);
        if (last && !plane.seatOf(last) && last.n_windows === 0) return {ws: last, append: false};
        return {ws: null, append: true};
    };
    return {
        dropOn(metaWindow, tile) {
            const target = plane.at(tile);
            if (target === metaWindow.get_workspace()) return false;
            if (target !== undefined) {
                deps.moveWindow(metaWindow, deps.monitorIndex(), target.index(), false);
                return true;
            }
            const f = fresh();
            const index = f.append ? wm.n_workspaces : f.ws.index();
            deps.moveWindow(metaWindow, deps.monitorIndex(), index, f.append);
            plane.reserve(f.ws ?? wm.get_workspace_by_index(index), tile);
            return true;
        },
        openOn(tile) {
            const f = fresh();
            const ws = f.ws ?? wm.append_new_workspace(false, global.get_current_time());
            plane.reserve(ws, tile);
            return ws;
        },
    };
}
