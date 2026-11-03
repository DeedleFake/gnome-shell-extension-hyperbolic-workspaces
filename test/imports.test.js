// Every pure module must import under node (no gi://, no resource://). Shell modules are checked with node --check only.
import {test, assert} from './harness.js';
const PURE = ['core/types.js', 'core/geometry.js', 'core/plane.js', 'core/view.js', 'core/gesture.js',
    'disk/solve.js', 'disk/fitted.js'];
for (const m of PURE)
    test(`pure: ${m}`, async () => assert.ok(await import(`../${m}`)));
