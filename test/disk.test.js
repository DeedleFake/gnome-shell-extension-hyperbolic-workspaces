// The straight-edged DiskModel and its focused tile size remap. At size 2 it is the Klein model.
import {test, assert} from './harness.js';
import {straightModel, remap, SIZE, CLICK_CUTOFF} from '../disk/fitted.js';
import {Plane} from '../core/plane.js';
import {ViewState} from '../core/view.js';
import {FakeWm, drive, fill} from './fakeWm.js';
import {applyH} from '../disk/solve.js';
import {M, Tiling} from '../core/geometry.js';

const d = {cx: 640, cy: 400, r: 380};
const dk = {...d, size: 2};
const box = {w: 1280, h: 768};
const frames = [M.id(), M.compose(M.to([0.3, -0.2]), M.rot(0.7)), M.compose(M.to([-0.5, 0.4]), M.rot(-2))];

test('size 2 place: box corners land on the content rectangle in the tile, straight-edged and exact', () => {
    const kh = new Tiling(4, 5).kleinHalf;
    for (const F of frames) {
        const h = straightModel.place(F, box, dk);
        const a = 0.96 * box.h / box.w;
        const want = [[-0.96, a], [0.96, a], [0.96, -a], [-0.96, -a]];
        [[0, 0], [box.w, 0], [box.w, box.h], [0, box.h]].forEach(([x, y], i) => {
            const z = M.apply(M.inv(F), straightModel.toDisk(...applyH(h, x, y), dk));
            const n = 1 + z[0] * z[0] + z[1] * z[1];
            const k = [2 * z[0] / n / kh, 2 * z[1] / n / kh];
            assert.ok(Math.hypot(k[0] - want[i][0], k[1] - want[i][1]) < 1e-6, `corner ${i}: ${k} vs ${want[i]}`);
        });
    }
});

test('size 2 toDisk inverts place: box points map to the same disk point as the frame does', () => {
    for (const F of frames) {
        const h = straightModel.place(F, box, dk);
        const [x, y] = applyH(h, box.w / 2, box.h / 2);
        const p = straightModel.toDisk(x, y, dk);
        const want = M.apply(F, [0, 0]);
        assert.ok(Math.hypot(p[0] - want[0], p[1] - want[1]) < 1e-9, 'the box center is the frame center');
    }
    assert.equal(straightModel.toDisk(d.cx + d.r + 1, d.cy, dk), null, 'outside the disk is null');
});

test('size 2 place culls tiles drawn under 25 px', () => {
    assert.equal(straightModel.place(M.to([0.999, 0]), box, dk), null);
});

test('remap: identity at 1, the Klein radius at 2, monotonic, rim stays the rim', () => {
    for (let r = 0; r < 1; r += 0.01) {
        assert.ok(Math.abs(remap([r, 0], 1)[0] - r) < 1e-15, `identity at ${r}`);
        assert.ok(Math.abs(remap([r, 0], SIZE.klein)[0] - 2 * r / (1 + r * r)) < 1e-12, `Klein at ${r}`);
        for (const s of [1, 1.5, 2, 2.5]) {
            assert.ok(remap([r + 0.01, 0], s)[0] >= remap([r, 0], s)[0], `monotonic at ${r}, size ${s}`);
            assert.ok(Math.abs(remap(remap([0, r], s), 1 / s)[1] - r) < 1e-9, `invertible at ${r}, size ${s}`);
        }
    }
    for (const s of [1, 1.5, 2, 2.5]) assert.equal(remap([1, 0], s)[0], 1, `rim at size ${s}`);
    assert.ok(SIZE.min <= SIZE.default && SIZE.default < CLICK_CUTOFF && CLICK_CUTOFF < SIZE.klein && SIZE.klein < SIZE.max);
});

test('straight at size 1 puts tile corners where Poincaré has them (the demo\'s Fitted)', () => {
    const T = new Tiling(4, 5);
    for (const F of frames) {
        const q = straightModel.outline(F, {...d, size: 1});
        [[-1, 1], [1, 1], [1, -1], [-1, -1]].forEach(([u, v], i) => {
            const z = M.apply(F, T.local(u, v));
            assert.ok(Math.hypot(q[i][0] - (d.cx + d.r * z[0]), q[i][1] - (d.cy - d.r * z[1])) < 1e-6, `corner ${i}`);
        });
    }
});

test('straight at size 2 is the Klein model: tile corners sit at 2z/(1+|z|²) of their Poincaré points', () => {
    const T = new Tiling(4, 5);
    for (const F of frames) {
        const q = straightModel.outline(F, dk);
        [[-1, 1], [1, 1], [1, -1], [-1, -1]].forEach(([u, v], i) => {
            const z = M.apply(F, T.local(u, v)), n = 1 + z[0] * z[0] + z[1] * z[1];
            assert.ok(Math.hypot(q[i][0] - (d.cx + d.r * 2 * z[0] / n), q[i][1] - (d.cy - d.r * 2 * z[1] / n)) < 1e-6, `corner ${i}`);
        });
    }
});

test('tileAt follows the drawing at every size: each drawn tile\'s and workspace\'s center hits its own tile', () => {
    const plane = new Plane(), view = new ViewState({plane}), wm = new FakeWm();
    drive(plane, view, wm);
    fill(plane, view, wm, 8);
    let t = 0;
    while (view.step(t)) t += 16;
    const fs = view.frameOf(t + 16);
    for (const size of [1, 1.5, CLICK_CUTOFF, 2, 2.5]) {
        const dd = {...d, size};
        let n = 0;
        for (const [id, F] of fs.tiles) {
            const q = straightModel.outline(F, dd);
            if (Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]) < 25) continue;
            const c = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
            assert.equal(straightModel.tileAt(fs.tiles, c[0], c[1], dd), id, `size ${size}: tile ${id}`);
            n++;
        }
        for (const [k, F] of fs.content) {
            const h = straightModel.place(F, box, dd);
            if (!h) continue;
            const [x, y] = applyH(h, box.w / 2, box.h / 2);
            assert.equal(straightModel.tileAt(fs.tiles, x, y, dd), plane.seatOf(k).tile, `size ${size}: workspace box center`);
        }
        assert.ok(n > 5, `size ${size}: checked ${n} tiles`);
    }
    assert.equal(straightModel.tileAt(fs.tiles, d.cx + d.r * 1.01, d.cy, d), null, 'outside the disk is null');
});
