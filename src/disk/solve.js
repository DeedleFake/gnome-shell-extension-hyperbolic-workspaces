// Pure homography solver shared by every model.
/** @import {H3} from '../core/types.js' */

/**
 * The homography taking a box's 4 corners to 4 stage points (DLT, 8x8 solve, h22 = 1).
 * @param {{w: number, h: number}} box @param {[number, number][]} corners  stage px, order TL, TR, BR, BL
 * @returns {H3}  row-major, maps the column vector (x, y, 1)
 */
export function boxToQuad(box, corners) {
    const src = [[0, 0], [box.w, 0], [box.w, box.h], [0, box.h]];
    const A = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = src[i], [u, v] = corners[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let c = 0; c < 8; c++) {
        let p = c;
        for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        [A[c], A[p]] = [A[p], A[c]];
        for (let r = 0; r < 8; r++) {
            if (r === c) continue;
            const f = A[r][c] / A[c][c];
            for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
        }
    }
    return Object.freeze([...A.map((row, i) => row[8] / A[i][i]), 1]);
}

/** Apply an H3 to a point. @param {H3} h @param {number} x @param {number} y @returns {[number, number]} */
export function applyH(h, x, y) {
    const w = h[6] * x + h[7] * y + h[8];
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}
