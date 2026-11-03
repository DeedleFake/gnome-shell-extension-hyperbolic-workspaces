// One test API for node and gjs. Under node it is node:test and node:assert/strict.
// Under gjs, test/run-gjs.js imports every test file, then calls run().
const isNode = typeof globalThis.process?.versions?.node === 'string';

const registry = [];
const nodeTest = isNode ? await import('node:test') : null;

export const test = isNode ? nodeTest.test : (name, fn) => void registry.push({name, fn});
test.todo ??= name => void registry.push({name, todo: true});

function deepEqual(a, b, path = '') {
    if (Object.is(a, b)) return null;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
        return `${path || 'value'}: ${String(a)} !== ${String(b)}`;
    if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
    if (a instanceof Map || a instanceof Set) {
        if (!(b instanceof Map || b instanceof Set)) return `${path}: collection vs object`;
        return deepEqual([...a], [...b], path);
    }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return `${path}: ${ka.length} keys vs ${kb.length}`;
    for (const k of ka) {
        const d = deepEqual(a[k], b[k], `${path}.${k}`);
        if (d) return d;
    }
    return null;
}

const fail = (msg, extra) => { throw new Error(extra ? `${msg}: ${extra}` : msg); };
const gjsAssert = {
    ok: (v, msg) => v || fail(msg ?? 'expected truthy'),
    equal: (a, b, msg) => Object.is(a, b) || fail(msg ?? 'not equal', `${String(a)} !== ${String(b)}`),
    notEqual: (a, b, msg) => !Object.is(a, b) || fail(msg ?? 'equal', String(a)),
    deepEqual: (a, b, msg) => { const d = deepEqual(a, b); if (d) fail(msg ?? 'not deep equal', d); },
    throws: (fn, msg) => { try { fn(); } catch { return; } fail(msg ?? 'expected a throw'); },
};
export const assert = isNode ? (await import('node:assert/strict')).default : gjsAssert;

/** Loads the prototype's CommonJS hyper.js. */
export async function loadDemo(path) {
    if (isNode) return (await import('node:module')).createRequire(import.meta.url)(path);
    const GLib = (await import('gi://GLib')).default;
    const [, bytes] = GLib.file_get_contents(path);
    const module = {exports: {}};
    new Function('module', new TextDecoder().decode(bytes))(module);
    return module.exports;
}

export const env = name => isNode ? globalThis.process.env[name] : imports.gi.GLib.getenv(name);

export async function run() {
    let pass = 0, failed = 0, todo = 0;
    for (const t of registry) {
        if (t.todo) { todo++; print(`# TODO ${t.name}`); continue; }
        try { await t.fn(); pass++; print(`ok ${t.name}`); }
        catch (e) { failed++; print(`not ok ${t.name}\n  ${e.message}`); }
    }
    print(`# pass ${pass}\n# fail ${failed}\n# todo ${todo}`);
    return failed;
}
