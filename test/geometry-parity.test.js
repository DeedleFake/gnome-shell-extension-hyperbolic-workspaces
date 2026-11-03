// Proves the ESM port reproduces the demo: the same seeded op sequence run on the prototype's
// CommonJS hyper.js and on src/core/geometry.js yields identical states and moves after every op.
import {test, assert, loadDemo, env} from './harness.js';
import * as G from '../src/core/geometry.js';

const HYPER = env('HYPER_JS') ?? '/workspace/hyperbolic-workspaces/hyper.js';
const D = await loadDemo(HYPER);

function run(H, ops, seed0) {
    let seed = seed0;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = xs => xs[Math.floor(rnd() * xs.length)];
    const T = new H.Tiling(4, 5);
    let s = H.emptyState(T.origin ?? 0);
    const log = [];
    for (let i = 0; i < ops; i++) {
        const r0 = rnd();
        let r, op;
        if (s.ws.length < 3 || r0 < 0.45) {
            op = 'open'; r = H.openWorkspace(T, s, H.nearestFree(T, s), Math.floor(rnd() * 4));
        } else if (r0 < 0.75) {
            op = 'remove'; r = H.removeWorkspace(T, s, Math.floor(rnd() * s.ws.length));
        } else {
            const w = pick(s.ws);
            const ring = [...T.rings(w.tile, 3)].filter(([, d]) => d > 0).map(([t]) => t);
            const target = pick(ring);
            op = 'drop'; r = H.dropWorkspace(T, s, w.id, target, pick(T.neighbors(target)));
        }
        s = r.state;
        log.push({op, ws: s.ws.map(w => [w.id, w.tile, w.down]), anchor: s.anchor,
            moves: r.moves.map(m => [m.id, m.from, m.to, m.down, !!m.via])});
    }
    return log;
}

for (const seed of [1, 7, 42]) {
    test(`port matches hyper.js op for op (seed ${seed}, 150 ops)`, () => {
        const a = run(D, 150, seed), b = run(G, 150, seed);
        for (let i = 0; i < a.length; i++) assert.deepEqual(b[i], a[i], `diverged at op ${i} (${a[i].op})`);
        const kinds = new Set(a.map(x => x.op));
        assert.deepEqual([...kinds].sort(), ['drop', 'open', 'remove']);
        assert.ok(a.some(x => x.moves.some(m => m[4])), 'sequence exercised at least one rigid slide (via)');
    });
}

test('carryDown matches the demo on every edge neighbor and down edge', () => {
    const TA = new D.Tiling(4, 5), TB = new G.Tiling(4, 5);
    const na = TA.neighbors(0), nb = TB.neighbors(0);
    for (let k = 0; k < 4; k++) for (let d = 0; d < 4; d++)
        assert.equal(G.carryDown(TB, 0, d, nb[k]), D.carryDown(TA, 0, d, na[k]));
});
