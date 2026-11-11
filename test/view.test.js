// ViewState through its public surface, fed by Plane.sync on FakeWm snapshots.
import {test, assert} from './harness.js';
import {Plane} from '../core/plane.js';
import {ViewState} from '../core/view.js';
import {M, C, wrapAngle} from '../core/geometry.js';
import {FakeWm, drive, fill} from './fakeWm.js';

const setup = n => {
    const plane = new Plane();
    const view = new ViewState({plane});
    const wm = new FakeWm();
    drive(plane, view, wm);
    fill(plane, view, wm, n);
    return {plane, view, wm};
};
const settle = view => { let t = 0; while (view.step(t)) t += 16; return t + 16; };
const focusedTile = (plane, view) => view.focus.kind === 'ws' ? plane.seatOf(view.focus.key).tile : view.focus.tile;

test('aeeca52: focus on an emptied tile moves to the workspace that slid into it', () => {
    // Close the focused workspace's last window until a neighbor slides into its tile.
    for (let n = 4; n < 14; n++) {
        const {plane, view, wm} = setup(n);
        for (const k of plane.seated()) {
            if (k === wm.active) continue;
            const tile = plane.seatOf(k).tile;
            view.click(tile);
            if (view.click(tile) !== 'enter') continue;
            while (k.w) wm.closeWindow(k);
            drive(plane, view, wm);
            const arrived = plane.at(tile);
            if (arrived === undefined) {
                assert.deepEqual(view.focus, {kind: 'tile', tile}, 'an emptied tile keeps the focus');
                continue;
            }
            assert.deepEqual(view.focus, {kind: 'ws', key: arrived});
            return;
        }
    }
    assert.fail('no sequence slid a workspace into the focused emptied tile');
});

test('FrameSet.content includes the down rotation: content(k) = tile frame ∘ rot(down·90°)', () => {
    const {plane, view} = setup(6);
    const t = settle(view);
    const fs = view.frameOf(t);
    for (const [k, F] of fs.content) {
        const seat = plane.seatOf(k);
        const want = M.compose(fs.tiles.get(seat.tile), M.rot((seat.down * Math.PI) / 2));
        assert.ok(C.abs2(C.add(M.center(F), C.scale(M.center(want), -1))) < 1e-18, 'same center');
        assert.ok(Math.abs(wrapAngle(M.split(F).alpha - M.split(want).alpha)) < 1e-9, 'same rotation');
    }
    assert.equal(fs.content.size, plane.seated().length);
});

test('a new workspace is drawn upright: its down edge faces the screen bottom', () => {
    const {plane, view, wm} = setup(1);
    view.panBy([0, 0], [0.3, 0.4]);
    view.panBy([0, 0], [-0.2, 0.3]);
    wm.openWindow(wm.list.at(-1));
    drive(plane, view, wm);
    const k = wm.list.at(-2);
    const F = view.frameOf(settle(view)).content.get(k);
    const a = wrapAngle(M.split(F).alpha);
    assert.ok(Math.abs(a) < Math.PI / 4 + 1e-9, `content frame is within 45° of upright (${a})`);
});

test('reach is the focused tile, its 4 edge neighbors and its 8 corner neighbors', () => {
    const {plane, view} = setup(1);
    const r = view.reach();
    assert.equal(r.size, 13);
    const f = focusedTile(plane, view);
    assert.ok(r.has(f));
    for (const n of plane.tiling.neighbors(f)) assert.ok(r.has(n));
});

test('click: first click focuses, a second enters, outside reach the first click focuses too', () => {
    const {plane, view} = setup(3);
    const f = focusedTile(plane, view);
    const n = plane.tiling.neighbors(f)[0];
    assert.equal(view.click(n), 'focus');
    assert.equal(focusedTile(plane, view), n);
    assert.equal(view.click(n), 'enter');
    const far = [...plane.tiling.rings(n, 3)].find(([, d]) => d === 3)[0];
    assert.ok(!view.reach().has(far));
    assert.equal(view.click(far), 'focus');
    assert.equal(focusedTile(plane, view), far);
    assert.equal(view.click(far), 'enter');
});

test('arrows move focus to the edge neighbor drawn in that direction and center it', () => {
    const {plane, view} = setup(1);
    for (const [nav, angle] of [['right', 0], ['up', Math.PI / 2], ['left', Math.PI], ['down', -Math.PI / 2]]) {
        const fs = view.frameOf(settle(view));
        const c0 = M.center(fs.tiles.get(focusedTile(plane, view)));
        view.nav(nav);
        const to = focusedTile(plane, view);
        const z = M.center(fs.tiles.get(to));
        assert.ok(Math.abs(wrapAngle(Math.atan2(z[1] - c0[1], z[0] - c0[0]) - angle)) < Math.PI / 4, nav);
        const after = view.frameOf(settle(view));
        assert.ok(C.abs2(M.center(after.tiles.get(to))) < 1e-12, `${nav}: the focused tile ends centered`);
    }
});

test('PgUp/PgDn walk seated workspaces in GNOME order; the rim arrow returns to the group', () => {
    const {plane, view, wm} = setup(4);
    const list = plane.seated();
    view.click(plane.seatOf(list[0]).tile);
    settle(view);
    view.nav('pageDown');
    assert.deepEqual(view.focus, {kind: 'ws', key: list[1]});
    view.nav('pageUp');
    view.nav('pageUp');
    assert.deepEqual(view.focus, {kind: 'ws', key: list[0]});
    wm.reorder(list[3], 0);
    drive(plane, view, wm);
    view.nav('pageUp');
    assert.deepEqual(view.focus, {kind: 'ws', key: wm.list[0]}, 'order follows GNOME after a reorder');
    view.panBy([0, 0], [0.5, 0.2]);
    view.recenter();
    assert.equal(focusedTile(plane, view), plane.center);
    const fs = view.frameOf(settle(view));
    const F = fs.content.get(plane.at(plane.center));
    assert.ok(C.abs2(M.center(F)) < 1e-12 && Math.abs(wrapAngle(M.split(F).alpha)) < 1e-9, 'center workspace is centered and upright');
});

test('End focuses the last seated workspace in GNOME order', () => {
    const {plane, view, wm} = setup(4);
    view.nav('end');
    assert.deepEqual(view.focus, {kind: 'ws', key: plane.seated().at(-1)});
    wm.reorder(plane.seated().at(-1), 0);
    drive(plane, view, wm);
    view.nav('end');
    assert.deepEqual(view.focus, {kind: 'ws', key: plane.seated().at(-1)}, 'End follows GNOME order after a reorder');
    view.nav('pageDown');
    assert.deepEqual(view.focus, {kind: 'ws', key: plane.seated().at(-1)}, 'PgDn past the last stays on it');
});

test('Home focuses the first seated workspace in GNOME order', () => {
    const {plane, view, wm} = setup(4);
    view.nav('end');
    view.nav('home');
    assert.deepEqual(view.focus, {kind: 'ws', key: plane.seated()[0]});
    wm.reorder(plane.seated()[2], 0);
    drive(plane, view, wm);
    view.nav('home');
    assert.deepEqual(view.focus, {kind: 'ws', key: wm.list[0]}, 'Home follows GNOME order after a reorder');
});

test('pan moves the drawn plane and keeps the focus', () => {
    const {plane, view} = setup(2);
    const t = settle(view), before = view.focus;
    const c = M.center(view.frameOf(t).tiles.get(plane.center));
    view.panBy([0, 0], [0.2, 0]);
    const d = M.center(view.frameOf(t).tiles.get(plane.center));
    assert.ok(d[0] > c[0] + 0.1);
    assert.deepEqual(view.focus, before);
});

test('step reports idle once motions finish, and the rim shows when the group is far', () => {
    const {view} = setup(2);
    const t = settle(view);
    assert.equal(view.step(t), false);
    assert.equal(view.frameOf(t).rim, null);
    for (let i = 0; i < 6; i++) view.panBy([0, 0], [0.9, 0]);
    let fs;
    for (let s = t; s < t + 1000; s += 16) fs = view.frameOf(s);
    assert.ok(fs.rim && fs.rim.opacity === 1, 'rim at full opacity');
    assert.ok(Math.abs(wrapAngle(fs.rim.angle)) < 0.5, `rim points toward the group, which the pan moved to +x (${fs.rim.angle})`);
});

const near = (a, b, eps = 1e-6) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;
const movable = (plane, wm) => plane.seated().find(k => k !== wm.active);
const ringTile = (plane, k, d) => [...plane.tiling.rings(plane.seatOf(k).tile, d)].find(([t, n]) => n === d && plane.at(t) === undefined)[0];

test('the view follows a focused workspace that moves: it stays put on screen while the plane slides', () => {
    const {plane, view, wm} = setup(5);
    const k = movable(plane, wm);
    view.click(plane.seatOf(k).tile);
    let t = settle(view);
    const c0 = M.center(view.frameOf(t).content.get(k));
    const tile = ringTile(plane, k, 2);
    view.absorb(plane.planDrag(k, tile, plane.tiling.neighbors(tile)[0]).commit());
    let moved = false; // 170 ms: inside the first leg (a push is 180 ms), which is all the demo follows
    for (let s = t; s < t + 170; s += 16) {
        const F = view.frameOf(s).content.get(k);
        assert.ok(near(M.center(F), c0, 1e-6), `focused workspace holds still at ${s - t} ms`);
        moved ||= !near(M.center(view.frameOf(s).tiles.get(plane.center)), [0, 0], 1e-3);
    }
    assert.ok(moved, 'the plane moved under it');
});

test('a dropped workspace settles from the pointer frame onto its seat', () => {
    const {plane, view, wm} = setup(5);
    const k = movable(plane, wm);
    const t = settle(view);
    const tile = ringTile(plane, k, 2), from = plane.tiling.neighbors(tile)[0];
    const plan = plane.planDrag(k, tile, from);
    const p = C.add(M.center(view.frameOf(t).tiles.get(tile)), [0.02, -0.01]);
    view.carry({key: k, p, tile, plan: plan.change});
    const held = view.frameOf(t).content.get(k);
    assert.ok(near(M.center(held), p, 1e-9), 'while carried it is drawn centered on the pointer');
    view.drop(plan.commit());
    const first = view.frameOf(t + 1).content.get(k);
    assert.ok(near(M.center(first), M.center(held), 1e-3), 'the settle starts where it was let go');
    const end = view.frameOf(settle(view)).content.get(k);
    const seat = plane.seatOf(k);
    const want = M.compose(view.frameOf(settle(view)).tiles.get(seat.tile), M.rot((seat.down * Math.PI) / 2));
    assert.ok(near(M.center(end), M.center(want), 1e-9), 'it ends on its seat');
});

test('carry(null) cancels: everything is drawn on its seat again', () => {
    const {plane, view, wm} = setup(4);
    const k = movable(plane, wm);
    const t = settle(view);
    const before = M.center(view.frameOf(t).content.get(k));
    view.carry({key: k, p: [0.5, 0.5], tile: null, plan: null});
    assert.ok(!near(M.center(view.frameOf(t).content.get(k)), before, 1e-3));
    view.carry(null);
    assert.ok(near(M.center(view.frameOf(t).content.get(k)), before, 1e-12));
});

test('panEnd snaps the tile nearest the center to the center, upright', () => {
    const {plane, view} = setup(3);
    settle(view);
    view.panBy([0, 0], [0.12, 0.05]);
    view.panEnd();
    const fs = view.frameOf(settle(view));
    const centered = [...fs.tiles.values()].filter(F => C.abs2(M.center(F)) < 1e-12);
    assert.equal(centered.length, 1, 'one tile sits at the center');
    const q = M.split(centered[0]).alpha / (Math.PI / 2);
    assert.ok(Math.abs(q - Math.round(q)) < 1e-6, 'it is square to the screen');
    void plane;
});


test('focusKey focuses a seated workspace switched to outside the plane, and ignores an unseated one', () => {
    const {plane, view, wm} = setup(5);
    const other = plane.seated().find(k => k !== wm.active);
    view.focusKey(other);
    assert.deepEqual(view.focus, {kind: 'ws', key: other});
    settle(view);
    const before = view.focus;
    view.focusKey({});
    assert.deepEqual(view.focus, before, 'a key with no tile leaves the focus');
});
