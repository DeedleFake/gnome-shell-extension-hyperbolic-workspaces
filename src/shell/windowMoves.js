// SEAM for moving windows between workspaces. The one place that changes window -> workspace.
// Occupied tiles keep GNOME's Workspace.acceptDrop (works through transforms: picks are transform-aware).

/**
 * @typedef {object} WindowMoves
 * @property {(metaWindow: object, tile: import('../core/types.js').TileId) => boolean} dropOnEmpty
 *   Pick GNOME's trailing empty workspace as the target (append_new_workspace if the active one IS the
 *   trailing spare — open question), plane.reserve(target, tile), then Main.moveWindowToMonitorAndWorkspace.
 *   The next sync seats `target` on `tile`.
 */

/** @param {{plane: object, workspaceManager: object, moveWindow: Function}} deps @returns {WindowMoves} */
export function createWindowMoves(deps) { throw new Error('not implemented'); }
