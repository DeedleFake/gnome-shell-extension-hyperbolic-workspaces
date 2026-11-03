// THE BOUNDARY for how the disk is drawn:
//   'straight'        homography per tile through its remapped Poincaré corners (fitted.js). The one the shell uses.
//   'poincare-shader' curved edges via a whole-plane radial FRAGMENT snippet (poincareShader.js). Not built:
//                     a shader moves pixels but not Clutter picks, so it needs hand-done picking first.
// The focused tile size travels in DiskRect.size and applies to every model.
// Callers speak Poincaré disk coordinates and content frames only. Nothing outside src/disk/ branches on the model.
/** @import {Frame, DiskRect, H3} from '../core/types.js' */

/**
 * @typedef {object} DiskModel
 * @property {(content: Frame, box: {w: number, h: number}, d: DiskRect) => H3 | null} place
 *   Homography from a workspace's flat box (work-area aspect, origin top-left) onto its tile.
 *   `content` already carries the down rotation. null <=> drawn under 25 px (app.js:349 rule). Pure.
 * @property {(tile: Frame, d: DiskRect) => [number, number][]} outline
 *   A tile's 4 corners (TL, TR, BR, BL) on screen, for the backdrop's tile edges. Pure.
 * @property {(stageX: number, stageY: number, d: DiskRect) => [number, number] | null} toDisk
 *   Stage px -> Poincaré point with the size remap undone; null outside the disk. Pans and carries
 *   use it. Which tile a point is on comes from `outline`, the drawn quads, so clicks follow the pixels.
 * @property {(tiles: ReadonlyMap<number, Frame>, stageX: number, stageY: number, d: DiskRect) => number | null} tileAt
 *   The tile whose drawn outline holds the stage point, or null. The shell's hit test for tiles.
 * @property {(container: object) => (() => void)} decorate
 *   Model-specific effect on the plane actor; returns undo. straight: no-op.
 *   poincare-shader: radial ShaderEffect. KNOWN COST: GNOME's own picking of previews (hover, close button,
 *   window DnD) follows the Klein transform, not the pixels; making them match needs hand-done
 *   picking inside decorate. Measured in ground/gnome51.md: effects never move picks.
 */

import {straightModel} from './fitted.js';
import {poincareShaderModel} from './poincareShader.js';   // imports gi://: this file is shell-side only

export {SIZE, CLICK_CUTOFF} from './fitted.js';

/**
 * The single place a model is chosen. Node tests import fitted.js / klein.js / solve.js directly.
 * @param {'straight'|'poincare-shader'} name @returns {DiskModel}
 */
export function createDiskModel(name) {
    const m = {'straight': straightModel, 'poincare-shader': poincareShaderModel}[name];
    if (!m) throw new Error(`unknown disk model ${name}`);
    return m;
}

