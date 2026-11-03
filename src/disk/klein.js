// (a) Exact. Content frame -> its 4 tile corners in Klein coords (k = 2p/(1+|p|²)) -> boxToQuad.
// Every {4,5} tile is a projective image of the central square in Klein, so this is exact, picks included.
import {boxToQuad} from './solve.js';

/** @type {import('./index.js').DiskModel} */
export const kleinModel = {
    place(content, box, d) { throw new Error('not implemented'); },
    toDisk(x, y, d) { throw new Error('not implemented'); },   // stage -> Klein -> p = k/(1+sqrt(1-|k|²))
    decorate() { return () => {}; },
};
void boxToQuad;
