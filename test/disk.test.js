// DiskModel 'klein' (the stand-in the shell is tested on): place lands on the tile, toDisk inverts it.
import {test, assert} from './harness.js';
import {kleinModel} from '../src/disk/klein.js';
import {applyH} from '../src/disk/solve.js';
import {M, Tiling} from '../src/core/geometry.js';

const d = {cx: 640, cy: 400, r: 380};
const box = {w: 1280, h: 768};
const frames = [M.id(), M.compose(M.to([0.3, -0.2]), M.rot(0.7)), M.compose(M.to([-0.5, 0.4]), M.rot(-2))];

test('klein place: box corners land on the content rectangle in the tile, straight-edged and exact', () => {
    const kh = new Tiling(4, 5).kleinHalf;
    for (const F of frames) {
        const h = kleinModel.place(F, box, d);
        const a = 0.96 * box.h / box.w;
        const want = [[-0.96, a], [0.96, a], [0.96, -a], [-0.96, -a]];
        [[0, 0], [box.w, 0], [box.w, box.h], [0, box.h]].forEach(([x, y], i) => {
            const z = M.apply(M.inv(F), kleinModel.toDisk(...applyH(h, x, y), d));
            const n = 1 + z[0] * z[0] + z[1] * z[1];
            const k = [2 * z[0] / n / kh, 2 * z[1] / n / kh];
            assert.ok(Math.hypot(k[0] - want[i][0], k[1] - want[i][1]) < 1e-6, `corner ${i}: ${k} vs ${want[i]}`);
        });
    }
});

test('klein toDisk inverts place: box points map to the same disk point as the frame does', () => {
    for (const F of frames) {
        const h = kleinModel.place(F, box, d);
        const [x, y] = applyH(h, box.w / 2, box.h / 2);
        const p = kleinModel.toDisk(x, y, d);
        const want = M.apply(F, [0, 0]);
        assert.ok(Math.hypot(p[0] - want[0], p[1] - want[1]) < 1e-9, 'the box center is the frame center');
    }
    assert.equal(kleinModel.toDisk(d.cx + d.r + 1, d.cy, d), null, 'outside the disk is null');
});

test('klein place culls tiles drawn under 25 px', () => {
    assert.equal(kleinModel.place(M.to([0.999, 0]), box, d), null);
});
