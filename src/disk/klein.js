// (a) Exact. Content frame -> its corners in Klein coords (k = 2p/(1+|p|²)) -> boxToQuad.
// Every {4,5} tile is a projective image of the central square in Klein, so this is exact, picks included.
//
// STAND-IN: the shell runs on this model only to be tested. Which model ships is the user's open
// question (Klein, fitted Poincaré corners, or shader Poincaré); the disk-model default is a placeholder.
import {M, Tiling} from '../core/geometry.js';
import {boxToQuad} from './solve.js';

const KH = new Tiling(4, 5).kleinHalf;
/** Half-width of a workspace inside its tile, in tile units (app.js screenPoly). */
const INSET = 0.96;
const MIN_PX = 25;

/** Content coords (u, v) in [-1, 1]², v up, through frame F onto the screen disk d. */
function toStage(F, u, v, d) {
    const k = [u * KH, v * KH], s = 1 + Math.sqrt(1 - (k[0] * k[0] + k[1] * k[1]));
    const z = M.apply(F, [k[0] / s, k[1] / s]);
    const n = 1 + z[0] * z[0] + z[1] * z[1];
    return [d.cx + d.r * (2 * z[0]) / n, d.cy - d.r * (2 * z[1]) / n];
}

/** @type {import('./index.js').DiskModel} */
export const kleinModel = {
    place(content, box, d) {
        const a = INSET * Math.min(1, box.h / box.w), b = a * box.w / box.h;
        const q = [[-b, a], [b, a], [b, -a], [-b, -a]].map(([u, v]) => toStage(content, u, v, d));
        if (Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]) < MIN_PX) return null;
        return boxToQuad(box, q);
    },
    outline(tile, d) {
        return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([u, v]) => toStage(tile, u, v, d));
    },
    toDisk(x, y, d) {
        const k = [(x - d.cx) / d.r, -(y - d.cy) / d.r], k2 = k[0] * k[0] + k[1] * k[1];
        if (k2 >= 1) return null;
        const s = 1 + Math.sqrt(1 - k2);
        return [k[0] / s, k[1] / s];
    },
    decorate() { return () => {}; },
};
