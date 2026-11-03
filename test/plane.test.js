// Plane and ViewState driven through the same path the shell uses (Plane.sync on a Snapshot,
// ViewState.absorb on the Change), with FakeWm in place of Mutter.
import {test, assert} from './harness.js';
import {Plane} from '../src/core/plane.js';
import {ViewState} from '../src/core/view.js';
import {M, C, wrapAngle} from '../src/core/geometry.js';
import {FakeWm, drive, fill} from './fakeWm.js';

const setup = () => {
    const plane = new Plane({fillOrder: 'distance'});
    const view = new ViewState({plane});
    const wm = new FakeWm();
    drive(plane, view, wm);
    return {plane, view, wm};
};

/** Every observable invariant of a seated plane. */
function checkGroup(plane, wm) {
    const T = plane.tiling, snap = wm.snapshot();
    const live = snap.order.filter(k => k === snap.active || snap.hasWindows(k));
    assert.deepEqual(plane.seated(), live, 'seated keys are exactly the live ones, in GNOME order');
    const tiles = live.map(k => plane.seatOf(k).tile);
    assert.equal(new Set(tiles).size, tiles.length, 'one workspace per tile');
    const seen = new Set([tiles[0]]), queue = [tiles[0]], occ = new Set(tiles);
    while (queue.length) for (const n of T.neighbors(queue.pop())) if (occ.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
    assert.equal(seen.size, tiles.length, 'the group is one connected piece');
    assert.ok(occ.has(plane.center), 'the center sits on a workspace');
}

/** A motion along `via` must be the slide G carrying the old content frame onto the new one, with no turn. */
function checkRigid(plane, m) {
    const T = plane.tiling;
    const relP = (a, b) => M.compose(M.inv(T.tiles[a].P), T.tiles[b].P);
    const q = d => M.rot((d * Math.PI) / 2);
    const Fu = relP(m.via.root, m.from.tile);
    const D = M.compose(M.inv(Fu), M.compose(m.via.G, Fu));
    const X = M.compose(M.inv(M.compose(D, q(m.from.down))), M.compose(relP(m.from.tile, m.to.tile), q(m.to.down)));
    assert.ok(M.dist0(X) < 1e-6, 'a sliding workspace lands on its new tile');
    assert.ok(Math.abs(wrapAngle(M.split(X).alpha)) < 1e-6, 'a sliding workspace carries its down edge with no turn');
}

test('every workspace with windows has a seat; the trailing spare has none', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 3);
    for (const k of wm.list.slice(0, 3)) assert.ok(plane.seatOf(k), `${k.name} is seated`);
    assert.equal(plane.seatOf(wm.list.at(-1)), undefined);
    checkGroup(plane, wm);
});

test('an empty active workspace is seated', () => {
    const {plane, wm} = setup();
    assert.ok(plane.seatOf(wm.active));
    assert.deepEqual(plane.seated(), [wm.active]);
});

test('sync is idempotent: a second sync of the same snapshot has no motions', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 5);
    const seats = plane.seated().map(k => plane.seatOf(k));
    assert.equal(drive(plane, view, wm).motions.length, 0);
    assert.deepEqual(plane.seated().map(k => plane.seatOf(k)), seats);
});

test('a new workspace opens next to the group, upright on screen', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 2);
    const [a, b] = wm.list;
    assert.ok(plane.tiling.neighbors(plane.seatOf(a).tile).includes(plane.seatOf(b).tile));
    assert.equal(plane.seatOf(b).down, view.screenDown(plane.seatOf(b).tile));
});

test('reserve: the next sync seats the key on the reserved empty tile', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 2);
    const spare = wm.list.at(-1), T = plane.tiling;
    const occ = new Set(plane.seated().map(k => plane.seatOf(k).tile));
    const target = T.neighbors(plane.seatOf(wm.list[1]).tile).find(t => !occ.has(t));
    plane.reserve(spare, target);
    wm.openWindow(spare);
    drive(plane, view, wm);
    assert.equal(plane.seatOf(spare).tile, target);
});

test('removal lead: an emptied non-active workspace loses its seat at sync, before flush()', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 3);
    const k = wm.list[2];
    const tile = plane.seatOf(k).tile;
    wm.closeWindow(k);
    const change = drive(plane, view, wm);
    assert.ok(wm.list.includes(k), 'GNOME has not removed it yet');
    assert.equal(plane.seatOf(k), undefined);
    assert.ok(change.motions.some(m => m.key === k && m.from.tile === tile && m.to === null));
    wm.flush();
    assert.equal(drive(plane, view, wm).motions.length, 0, 'GNOME catching up changes nothing');
});

test('a workspace GNOME already removed loses its seat', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 3);
    const k = wm.list[1];
    k.w = 0;
    wm.flush();
    drive(plane, view, wm);
    assert.equal(plane.seatOf(k), undefined);
    checkGroup(plane, wm);
});

test('reorder in the fake changes PgUp/PgDn order only, never seats', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 4);
    const seats = new Map(plane.seated().map(k => [k, plane.seatOf(k)]));
    const k = wm.list[3];
    wm.reorder(k, 0);
    assert.equal(drive(plane, view, wm).motions.length, 0);
    assert.equal(plane.seated()[0], k);
    for (const [key, seat] of seats) assert.equal(plane.seatOf(key), seat);
});

test('property (port of sim.js, 3000 seeded steps): one piece, rigid slides on one G per piece, no lost keys', () => {
    const {plane, view, wm} = setup();
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = xs => xs[Math.floor(rnd() * xs.length)];
    let slides = 0, drops = 0, removals = 0;
    for (let i = 0; i < 3000; i++) {
        const x = rnd(), withWindows = wm.list.filter(k => k.w > 0);
        let change;
        if (withWindows.length < 2 || (withWindows.length < 25 && x < 0.4)) {
            wm.openWindow(rnd() < 0.8 ? wm.list.at(-1) : pick(wm.list));
            change = drive(plane, view, wm);
        } else if (x < 0.7) {
            const k = pick(withWindows);
            while (k.w) wm.closeWindow(k);
            if (rnd() < 0.5) wm.flush();
            change = drive(plane, view, wm);
            removals++;
        } else if (x < 0.8) {
            wm.activate(pick(wm.list));
            change = drive(plane, view, wm);
        } else {
            const k = pick(plane.seated());
            const ring = [...plane.tiling.rings(plane.seatOf(k).tile, 3)].filter(([, d]) => d > 0).map(([t]) => t);
            const tile = pick(ring);
            const plan = plane.planDrag(k, tile, pick(plane.tiling.neighbors(tile)));
            change = plan.commit();
            view.absorb(change);
            drops++;
        }
        checkGroup(plane, wm);
        const byRoot = new Map();
        for (const m of change.motions) {
            if (!m.via) continue;
            slides++;
            assert.ok(M.isSlide(m.via.G), 'a piece slides, never turns about a point');
            checkRigid(plane, m);
            const G = byRoot.get(m.via.root);
            if (G) assert.equal(G, m.via.G, 'every member of a piece follows the same G');
            byRoot.set(m.via.root, m.via.G);
        }
    }
    assert.ok(slides > 50 && drops > 200 && removals > 200, `exercised slides ${slides}, drops ${drops}, removals ${removals}`);
});

test.todo('the active workspace never moves and is never removed, even when another piece must slide (needs the activePiece policy in plane.js; open question)');

test('planDrag preview equals commit; cancel leaves seats untouched; refused for the active key', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 5);
    const seats = () => plane.seated().map(k => [k.name, plane.seatOf(k)]);
    const k = wm.list[4], T = plane.tiling;
    const occ = new Set(plane.seated().map(x => plane.seatOf(x).tile));
    const target = plane.seatOf(wm.list[1]).tile;
    const from = T.neighbors(target).find(t => !occ.has(t)) ?? T.neighbors(target)[0];
    const before = seats();
    const plan = plane.planDrag(k, target, from);
    assert.ok(plan.change.motions.length > 0, 'dropping onto an occupied tile moves something');
    assert.deepEqual(seats(), before, 'a preview commits nothing');
    const done = plan.commit();
    assert.deepEqual(done, plan.change);
    assert.equal(plane.seatOf(k).tile, target);
    assert.equal(plane.planDrag(wm.active, from, target).change.motions.length, 0);
    const again = seats();
    assert.equal(plane.planDrag(wm.active, from, target).commit().motions.length, 0);
    assert.deepEqual(seats(), again);
});

test('a stale plan recomputes against the current seats on commit', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 4);
    const k = wm.list[3], target = plane.seatOf(wm.list[1]).tile;
    const plan = plane.planDrag(k, target, plane.seatOf(k).tile);
    const other = wm.list[2];
    while (other.w) wm.closeWindow(other);
    drive(plane, view, wm);
    plan.commit();
    assert.equal(plane.seatOf(k).tile, target);
    checkGroup(plane, wm);
});
