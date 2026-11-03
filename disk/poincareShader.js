// Straight-edged transforms at the Klein size + one radial FRAGMENT snippet (vfunc_get_static_snippet, set_replace; lightbox.js:42 pattern)
// on the plane actor. Imports gi://, so createDiskModel loads it lazily.
import {SIZE, straightModel} from './fitted.js';

/** @type {import('./index.js').DiskModel} */
export const poincareShaderModel = {
    place: (content, box, d) => straightModel.place(content, box, {...d, size: SIZE.klein}),
    toDisk(x, y, d) { throw new Error('not implemented'); },   // stage (Poincaré pixels) -> p directly
    decorate(container) { throw new Error('not implemented'); }, // add RadialEffect + hand-done picking proxy; return undo
};
