// Pure homography solver shared by every model.
/** @import {H3} from '../core/types.js' */

/**
 * The homography taking a box's 4 corners to 4 stage points (DLT, 8x8 solve).
 * @param {{w: number, h: number}} box @param {[number, number][]} corners  stage px, order TL, TR, BR, BL
 * @returns {H3}
 */
export function boxToQuad(box, corners) { throw new Error('not implemented'); }
