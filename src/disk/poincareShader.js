// (c) Klein transforms + one radial FRAGMENT snippet (vfunc_get_static_snippet, set_replace; lightbox.js:42 pattern)
// on the plane actor. Imports gi://, so createDiskModel loads it lazily.
import {kleinModel} from './klein.js';

/** @type {import('./index.js').DiskModel} */
export const poincareShaderModel = {
    place: kleinModel.place,
    toDisk(x, y, d) { throw new Error('not implemented'); },   // stage (Poincaré pixels) -> p directly
    decorate(container) { throw new Error('not implemented'); }, // add RadialEffect + hand-done picking proxy; return undo
};
