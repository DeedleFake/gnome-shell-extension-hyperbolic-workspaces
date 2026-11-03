// Window drops on a tile: occupied tiles take the window, empty tiles get a fresh seated workspace.
import {test, assert} from './harness.js';
import {createWindowMoves} from '../src/shell/windowMoves.js';

function setup() {
    const ws = [0, 1, 2].map(i => ({i, n_windows: i < 2 ? 1 : 0, index() { return this.i; }}));
    const tiles = new Map([[10, ws[0]], [11, ws[1]]]);
    const reserved = new Map(), moves = [];
    const plane = {
        at: t => tiles.get(t),
        seatOf: k => [...tiles.values()].includes(k) ? {} : undefined,
        reserve: (k, t) => reserved.set(k, t),
    };
    const wm = {n_workspaces: ws.length, get_workspace_by_index: i => ws[i]};
    const moveWindow = (w, monitor, index, append) => moves.push({w, monitor, index, append});
    const m = createWindowMoves({plane, workspaceManager: wm, moveWindow, monitorIndex: () => 0});
    const win = {get_workspace: () => ws[0]};
    return {m, ws, win, moves, reserved};
}

test('windowMoves: a drop on an occupied tile moves the window to that workspace', () => {
    const {m, win, moves} = setup();
    assert.equal(m.dropOn(win, 11), true);
    assert.deepEqual(moves.map(x => [x.index, x.append]), [[1, false]]);
});

test('windowMoves: a drop on the window\'s own tile is refused', () => {
    const {m, win, moves} = setup();
    assert.equal(m.dropOn(win, 10), false);
    assert.equal(moves.length, 0);
});

test('windowMoves: a drop on an empty tile uses the spare workspace and seats it on that tile', () => {
    const {m, ws, win, moves, reserved} = setup();
    assert.equal(m.dropOn(win, 12), true);
    assert.deepEqual(moves.map(x => [x.index, x.append]), [[2, false]]);
    assert.equal(reserved.get(ws[2]), 12);
});
