// Plane and ViewState driven through the same path the shell uses (Plane.sync on a Snapshot,
// ViewState.absorb on the Change), with FakeWm in place of Mutter.
import {test, assert} from './harness.js';
import {Plane} from '../core/plane.js';
import {ViewState} from '../core/view.js';
import {M, C, wrapAngle} from '../core/geometry.js';
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

/** A leg along `via` must be the slide G carrying the old content frame onto the new one, with no turn. */
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

test('entering a reserved tile off the group lands there: the group slides over, keeping its shape', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 3);
    wm.activate(wm.list[1]);
    drive(plane, view, wm);
    const spare = wm.list.at(-1), T = plane.tiling;
    const occ = new Set(plane.seated().map(k => plane.seatOf(k).tile));
    const near = new Set([...occ].flatMap(t => T.neighbors(t)));
    const target = [...near].flatMap(t => T.neighbors(t)).find(t => !occ.has(t) && !near.has(t));
    const full = wm.list.filter(k => k.w > 0);
    const before = full.map(k => plane.seatOf(k).tile);
    plane.reserve(spare, target);
    wm.activate(spare);
    drive(plane, view, wm);
    assert.equal(plane.seatOf(spare).tile, target, 'the active workspace sits on the tile it was entered on');
    checkGroup(plane, wm);
    const after = full.map(k => plane.seatOf(k).tile);
    assert.ok(after.some((t, i) => t !== before[i]), 'the group moved, not the entered workspace');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        assert.equal(T.neighbors(after[i]).includes(after[j]), T.neighbors(before[i]).includes(before[j]), 'the group keeps its shape');
});

test('an empty active workspace reserved onto a free tile moves there; the group slides over', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 3);
    const empty = wm.list.at(-1);
    wm.activate(empty);
    drive(plane, view, wm);
    const T = plane.tiling, occ = new Set(plane.seated().map(k => plane.seatOf(k).tile));
    const near = new Set([...occ].flatMap(t => T.neighbors(t)));
    const target = [...near].flatMap(t => T.neighbors(t)).find(t => !occ.has(t) && !near.has(t));
    const n = wm.list.length;
    plane.reserve(empty, target);
    drive(plane, view, wm);
    assert.equal(plane.seatOf(empty).tile, target, 'the empty workspace sits on the entered tile');
    assert.equal(wm.list.length, n, 'no workspace was added');
    checkGroup(plane, wm);
    assert.equal(drive(plane, view, wm).motions.length, 0, 'the hint is spent');
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
    let multi = 0, slides = 0, drops = 0, removals = 0;
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
            if (m.from && m.to) {
                assert.ok(m.path.length > 0, 'a moved workspace has at least one leg');
                assert.deepEqual(m.path[0].from, m.from, 'the path starts at the old seat');
                assert.deepEqual(m.path.at(-1).to, m.to, 'the path ends at the new seat');
                for (let i = 1; i < m.path.length; i++) assert.deepEqual(m.path[i].from, m.path[i - 1].to, 'legs are continuous');
            }
            if (m.path.length > 1) multi++;
            for (const leg of m.path) {
                if (!leg.via) continue;
                slides++;
                assert.ok(M.isSlide(leg.via.G), 'a piece slides, never turns about a point');
                checkRigid(plane, leg);
                const G = byRoot.get(leg.via.root);
                if (G) assert.equal(G, leg.via.G, 'every member of a piece follows the same G');
                byRoot.set(leg.via.root, leg.via.G);
            }
        }
    }
    assert.ok(multi > 10 && slides > 50 && drops > 200 && removals > 200, `exercised multi-leg ${multi}, slides ${slides}, drops ${drops}, removals ${removals}`);
});

test('planDrag preview equals commit; cancel leaves seats untouched', () => {
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
});

test('the active workspace moves like any other: onto a free tile, onto an occupied one, and cut off on its own', () => {
    const {plane, view, wm} = setup();
    fill(plane, view, wm, 5);
    wm.activate(plane.seated().filter(k => k.w > 0)[2]);
    drive(plane, view, wm);
    const T = plane.tiling, a = wm.active;
    view.focusKey(a);
    const occ = () => new Set(plane.seated().map(x => plane.seatOf(x).tile));
    const free = [...T.rings(plane.seatOf(a).tile, 2)].map(([t]) => t).find(t => !occ().has(t) && T.neighbors(t).some(n => occ().has(n) && plane.at(n) !== a));
    const plan = plane.planDrag(a, free, T.neighbors(free).find(n => occ().has(n)));
    assert.ok(plan.change.motions.some(m => m.key === a), 'a preview of the active workspace moves it');
    view.absorb(plan.commit());
    assert.equal(plane.seatOf(a).tile, free, 'the active workspace lands on the free tile');
    checkGroup(plane, wm);
    const target = plane.seatOf(plane.seated().find(k => k !== a)).tile;
    view.absorb(plane.planDrag(a, target, T.neighbors(target).find(t => !occ().has(t)) ?? T.neighbors(target)[0]).commit());
    assert.equal(plane.seatOf(a).tile, target, 'a drop on an occupied tile inserts the active workspace there');
    checkGroup(plane, wm);
    const far = [...T.rings(plane.seatOf(a).tile, 3)].find(([t, d]) => d === 3 && !occ().has(t))[0];
    view.absorb(plane.planDrag(a, far, T.neighbors(far)[0]).commit());
    assert.ok(T.neighbors(plane.seatOf(a).tile).some(n => occ().has(n) && plane.at(n) !== a), 'cut off on its own, the active workspace slides back to touch the group');
    checkGroup(plane, wm);
    assert.equal(drive(plane, view, wm).motions.length, 0, 'the next sync keeps the moved active workspace where it is');
    assert.equal(view.focus.kind === 'ws' && view.focus.key, a, 'the focus stays on the active workspace');
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
