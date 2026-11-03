// The module map's import rules (MODULES.md "Lint rules"), checked over the source text.
import {test, assert, readText, listSources} from './harness.js';

const files = await listSources();
const importsOf = src => [...src.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1]);

test('only core/plane.js, core/view.js and disk/* import core/geometry.js', async () => {
    for (const f of files) {
        const uses = importsOf(await readText(f)).some(s => s.endsWith('geometry.js'));
        if (uses) assert.ok(['src/core/plane.js', 'src/core/view.js'].includes(f) || f.startsWith('src/disk/'), f);
    }
});

test('only shell/overviewHook.js imports resource:///org/gnome/shell/ui/', async () => {
    for (const f of files)
        if (importsOf(await readText(f)).some(s => s.startsWith('resource:///org/gnome/shell/ui/')))
            assert.equal(f, 'src/shell/overviewHook.js');
});

test('no gi:// import under core/ or in disk/{solve,fitted}.js', async () => {
    const pure = f => f.startsWith('src/core/') || ['src/disk/solve.js', 'src/disk/fitted.js'].includes(f);
    for (const f of files.filter(pure))
        assert.ok(!importsOf(await readText(f)).some(s => s.startsWith('gi://')), f);
});
