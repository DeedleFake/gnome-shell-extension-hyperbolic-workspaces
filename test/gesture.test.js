// GestureMachine: scripted pointer sequences in, Intent lists out.
import {test, assert} from './harness.js';
import {GestureMachine} from '../src/core/gesture.js';

const ev = (type, x, o = {}) => ({type, p: [x / 100, 0], xy: [x, 0], tile: null, key: null, moveMod: false, onRim: false, timeMs: 0, ...o});
const run = (events, g = new GestureMachine()) => events.flatMap(e => g.handle(e));
const W = {name: 'ws'};

test('a press and release under the threshold is a click on the pressed tile', () => {
    assert.deepEqual(run([ev('press', 0, {tile: 5}), ev('motion', 3, {tile: 5}), ev('release', 3, {tile: 5})]), [{kind: 'click', tile: 5}]);
});

test('a click on empty space outside every tile does nothing', () => {
    assert.deepEqual(run([ev('press', 0), ev('release', 0)]), []);
});

test('motion past the threshold pans from the press point, one step per motion', () => {
    assert.deepEqual(run([ev('press', 0, {tile: 5}), ev('motion', 10), ev('motion', 20), ev('release', 20)]), [
        {kind: 'pan', last: [0, 0], p: [0.1, 0]},
        {kind: 'pan', last: [0.1, 0], p: [0.2, 0]},
        {kind: 'panEnd'},
    ]);
});

test('a plain drag on a workspace pans; the move modifier carries it', () => {
    const plain = run([ev('press', 0, {tile: 1, key: W}), ev('motion', 10, {tile: 1, key: W})]);
    assert.equal(plain[0].kind, 'pan');
    const carry = run([ev('press', 0, {tile: 1, key: W, moveMod: true}), ev('motion', 10, {tile: 1}),
        ev('motion', 20, {tile: 2}), ev('motion', 30, {tile: 3}), ev('release', 30, {tile: 3})]);
    assert.deepEqual(carry, [
        {kind: 'hold', key: W, p: [0.1, 0]},
        {kind: 'carry', key: W, tile: 2, from: 1},
        {kind: 'hold', key: W, p: [0.2, 0]},
        {kind: 'carry', key: W, tile: 3, from: 2},
        {kind: 'hold', key: W, p: [0.3, 0]},
        {kind: 'drop', key: W, tile: 3, from: 2},
    ]);
});

test('the move modifier on empty space pans', () => {
    assert.equal(run([ev('press', 0, {tile: 1, moveMod: true}), ev('motion', 10)])[0].kind, 'pan');
});

test('carrying off the disk cancels the preview, and releasing there cancels the carry', () => {
    const out = run([ev('press', 0, {tile: 1, key: W, moveMod: true}), ev('motion', 10, {tile: 2}),
        ev('motion', 20, {tile: null, p: null}), ev('release', 20, {tile: null})]);
    assert.deepEqual(out.filter(i => i.kind !== 'hold'), [{kind: 'carry', key: W, tile: 2, from: 1}, {kind: 'cancelCarry'}, {kind: 'cancelCarry'}]);
});

test('cancel ends a carry with cancelCarry and resets the machine', () => {
    const g = new GestureMachine();
    assert.deepEqual(run([ev('press', 0, {tile: 1, key: W, moveMod: true}), ev('motion', 10, {tile: 2}), ev('cancel', 10)], g),
        [{kind: 'carry', key: W, tile: 2, from: 1}, {kind: 'hold', key: W, p: [0.1, 0]}, {kind: 'cancelCarry'}]);
    assert.deepEqual(run([ev('release', 10, {tile: 2})], g), []);
});

test('a press and release on the rim is a rim click; dragging from the rim does nothing', () => {
    assert.deepEqual(run([ev('press', 0, {onRim: true}), ev('release', 1, {onRim: true})]), [{kind: 'rim'}]);
    assert.deepEqual(run([ev('press', 0, {onRim: true}), ev('motion', 50), ev('release', 50)]), []);
});

test('the threshold is configurable', () => {
    const g = new GestureMachine({dragThresholdPx: 20});
    assert.deepEqual(run([ev('press', 0, {tile: 4}), ev('motion', 15, {tile: 4}), ev('release', 15, {tile: 4})], g), [{kind: 'click', tile: 4}]);
});
