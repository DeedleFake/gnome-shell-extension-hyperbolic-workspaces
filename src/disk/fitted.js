// (b) Approximate. Content frame -> its 4 Poincaré corners -> boxToQuad. Straight edges, exact picks,
// shape off the true arcs (report the max deviation as a number in the disk test).
import {boxToQuad} from './solve.js';

/** @type {import('./index.js').DiskModel} */
export const fittedModel = {
    place(content, box, d) { throw new Error('not implemented'); },
    toDisk(x, y, d) { throw new Error('not implemented'); },   // stage -> Poincaré, plain scale
    decorate() { return () => {}; },
};
void boxToQuad;
