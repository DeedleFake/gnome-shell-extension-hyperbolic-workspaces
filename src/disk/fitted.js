// Straight edges. A tile's 4 Poincaré corners are pushed out by the focused tile size remap, joined
// by straight edges, and the workspace box is filled by the perspective map through them. At size 1
// this is the demo's Fitted drawing; at size 2 the remap is the Klein radius 2r/(1+r²) and the
// drawing is exactly the Klein model. Every tile is one homography, so Clutter picks match the pixels.
import {M, Tiling} from '../core/geometry.js';
import {applyH, boxToQuad} from './solve.js';

/** Focused tile size: 1 is the plain drawing, 2 is Klein. Mirrors the schema's range and default. */
export const SIZE = Object.freeze({min: 1, max: 2.5, default: 1, klein: 2});
/** From this size up the neighbor tiles are too small to read: only the focused workspace's windows take clicks. */
export const CLICK_CUTOFF = 1.8;

const KH = new Tiling(4, 5).kleinHalf;
/** Half-width of a workspace inside its tile, in tile units (app.js screenPoly). */
const INSET = 0.96;
const MIN_PX = 25;
const UNIT = {w: 1, h: 1};
// Unit-box corners TL, TR, BR, BL are the square's (u, v) = (-1, -1), (1, -1), (1, 1), (-1, 1),
// as in the demo's homography: s = (u + 1) / 2, t = (v + 1) / 2.
const SQUARE = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Radius r drawn at tanh(size * atanh r): monotonic, continuous, the rim stays the rim. Size 1 is the identity.
 * @param {[number, number]} z @param {number} size @returns {[number, number]}
 */
export function remap(z, size) {
    const r = Math.hypot(z[0], z[1]);
    if (size === 1 || r === 0 || r >= 1) return z;
    const s = Math.tanh(size * Math.atanh(r)) / r;
    return [z[0] * s, z[1] * s];
}

const sizeOf = d => d.size ?? SIZE.default;

/** Square point (u, v), Klein coords over KH, through frame F to its drawn stage point. */
function corner(F, u, v, d) {
    const k = [u * KH, v * KH], s = 1 + Math.sqrt(1 - (k[0] * k[0] + k[1] * k[1]));
    const z = remap(M.apply(F, [k[0] / s, k[1] / s]), sizeOf(d));
    return [d.cx + d.r * z[0], d.cy - d.r * z[1]];
}

/** Homography from the unit box (s, t) onto frame F's drawn quad. */
const squareMap = (F, d) => boxToQuad(UNIT, SQUARE.map(([u, v]) => corner(F, u, v, d)));

/** @type {import('./index.js').DiskModel} */
export const straightModel = {
    place(content, box, d) {
        const a = INSET * Math.min(1, box.h / box.w), b = a * box.w / box.h;
        const S = squareMap(content, d);
        const q = [[-b, a], [b, a], [b, -a], [-b, -a]].map(([u, v]) => applyH(S, (u + 1) / 2, (v + 1) / 2));
        if (Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]) < MIN_PX) return null;
        return boxToQuad(box, q);
    },
    outline(tile, d) {
        return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([u, v]) => corner(tile, u, v, d));
    },
    toDisk(x, y, d) {
        const k = [(x - d.cx) / d.r, -(y - d.cy) / d.r];
        if (k[0] * k[0] + k[1] * k[1] >= 1) return null;
        return remap(k, 1 / sizeOf(d));
    },
    tileAt(tiles, x, y, d) {
        for (const [id, F] of tiles) if (insidePoly(this.outline(F, d), x, y)) return id;
        return null;
    },
    decorate() { return () => {}; },
};

/** Even-odd test of stage point (x, y) against polygon q. */
function insidePoly(q, x, y) {
    let inside = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++)
        if ((q[i][1] > y) !== (q[j][1] > y) && x < (q[j][0] - q[i][0]) * (y - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) inside = !inside;
    return inside;
}
