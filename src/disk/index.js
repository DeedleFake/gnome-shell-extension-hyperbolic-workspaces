// THE BOUNDARY for the open disk-model question:
//   (a) 'klein'           exact homography per tile, straight edges
//   (b) 'fitted'          homography through the tile's 4 Poincaré corners, straight edges
//   (c) 'poincare-shader' Klein homographies + one whole-plane radial FRAGMENT snippet; pointer input remapped
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
 *   Inverse of what is painted: stage px -> Poincaré point; null outside the disk. All plane pointer
 *   input goes through this, which is why (c) needs no change elsewhere for pan/carry/click.
 * @property {(container: object) => (() => void)} decorate
 *   Model-specific effect on the plane actor; returns undo. (a)/(b): no-op.
 *   (c): radial ShaderEffect. KNOWN COST of (c): GNOME's own picking of previews (hover, close button,
 *   window DnD) follows the Klein transform, not the pixels; making them match needs hand-done
 *   picking inside decorate. Measured in ground/gnome51.md: effects never move picks.
 */

import {kleinModel} from './klein.js';
import {fittedModel} from './fitted.js';
import {poincareShaderModel} from './poincareShader.js';   // imports gi://: this file is shell-side only

/**
 * The single place a model is chosen. Node tests import klein.js / fitted.js / solve.js directly.
 * @param {'klein'|'fitted'|'poincare-shader'} name @returns {DiskModel}
 */
export function createDiskModel(name) {
    const m = {'klein': kleinModel, 'fitted': fittedModel, 'poincare-shader': poincareShaderModel}[name];
    if (!m) throw new Error(`unknown disk model ${name}`);
    return m;
}

