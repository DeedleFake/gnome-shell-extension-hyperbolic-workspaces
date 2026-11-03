// The Klein model is the straight-edged model at the Klein size. Kept as a named model for the
// shader stub and the tests that pin exactness against the Klein formula.
import {SIZE, straightModel} from './fitted.js';

const klein = d => ({...d, size: SIZE.klein});

/** @type {import('./index.js').DiskModel} */
export const kleinModel = {
    place: (content, box, d) => straightModel.place(content, box, klein(d)),
    outline: (tile, d) => straightModel.outline(tile, klein(d)),
    toDisk: (x, y, d) => straightModel.toDisk(x, y, klein(d)),
    tileAt: (tiles, x, y, d) => straightModel.tileAt(tiles, x, y, klein(d)),
    decorate: straightModel.decorate,
};
