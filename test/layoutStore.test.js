// The layout survives disable() and enable(): extension.js keeps the plane in layoutStore and the next enable takes it.
import {test, assert} from './harness.js';
import {Plane} from '../core/plane.js';
import {ViewState} from '../core/view.js';
import * as layoutStore from '../shell/layoutStore.js';
import {FakeWm, drive, fill} from './fakeWm.js';

const make = () => new Plane({fillOrder: 'distance'});

/** One enable() lifetime as extension.js wires it, ending in disable(). */
function enabled(wm, during = () => {}) {
    const plane = layoutStore.take(make);
    const view = new ViewState({plane});
    drive(plane, view, wm);
    during(plane, view);
    view.destroy();
    layoutStore.keep(plane);
    return plane;
}

const tiles = (plane, keys) => keys.map(k => plane.seatOf(k)?.tile);

function connected(plane) {
    const occ = new Set(plane.seated().map(k => plane.seatOf(k).tile));
    const [first] = occ, seen = new Set([first]), queue = [first];
    while (queue.length) for (const n of plane.tiling.neighbors(queue.pop())) if (occ.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
    return seen.size === occ.size;
}

test('layoutStore: a disable and enable keeps every workspace on its tile', () => {
    layoutStore.take(make);
    const wm = new FakeWm();
    let moved;
    const before = enabled(wm, (plane, view) => {
        fill(plane, view, wm, 4);
        const k = plane.seated()[3], free = plane.tiling.neighbors(plane.seatOf(plane.seated()[1]).tile).find(t => !plane.at(t));
        plane.planDrag(k, free, plane.seatOf(plane.seated()[1]).tile).commit();
        moved = tiles(plane, plane.seated());
    });
    const after = enabled(wm);
    assert.equal(after, before, 'enable takes the plane disable kept');
    assert.deepEqual(tiles(after, after.seated()), moved, 'every workspace is on the tile it held, the dragged one included');
});

test('layoutStore: a workspace removed while disabled drops out and the group stays connected', () => {
    layoutStore.take(make);
    const wm = new FakeWm();
    let keys, held;
    enabled(wm, (plane, view) => { fill(plane, view, wm, 4); keys = [...plane.seated()]; held = tiles(plane, keys); });
    const gone = keys[2];
    wm.closeWindow(gone);
    wm.flush();
    const plane = enabled(wm);
    assert.ok(!plane.seatOf(gone), 'the removed workspace has no tile');
    assert.equal(plane.seated().length, keys.length - 1, 'the rest stay seated');
    assert.ok(connected(plane), 'the group is one connected piece');
    assert.ok(keys.filter(k => k !== gone).some((k, i) => plane.seatOf(k).tile === held[keys.indexOf(k)]), 'unaffected workspaces keep their tiles');
});

test('layoutStore: a workspace added while disabled gets a tile next to the group', () => {
    layoutStore.take(make);
    const wm = new FakeWm();
    let keys, held;
    enabled(wm, (plane, view) => { fill(plane, view, wm, 3); keys = [...plane.seated()]; held = tiles(plane, keys); });
    const added = wm.list.at(-1);
    wm.openWindow(added);
    const plane = enabled(wm);
    assert.deepEqual(tiles(plane, keys), held, 'existing workspaces keep their tiles');
    assert.ok(plane.seatOf(added), 'the new workspace is seated');
    assert.ok(connected(plane), 'the group is one connected piece');
});
