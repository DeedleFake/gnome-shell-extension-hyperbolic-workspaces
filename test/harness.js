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
    const [, bytes] = GLib.file_get_contents(path);
    const module = {exports: {}};
    new Function('module', new TextDecoder().decode(bytes))(module);
    return module.exports;
}

const GLib = isNode ? null : (await import('gi://GLib')).default;
const Gio = isNode ? null : (await import('gi://Gio')).default;
const root = isNode ? new URL('../', import.meta.url) : Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();

export const env = name => isNode ? globalThis.process.env[name] : GLib.getenv(name) ?? undefined;

/** Text of a repo-relative file. */
export async function readText(rel) {
    if (isNode) return (await import('node:fs/promises')).readFile(new URL(rel, root), 'utf8');
    return new TextDecoder().decode(root.resolve_relative_path(rel).load_contents(null)[1]);
}

/** The extension's own modules: the files GNOME Shell loads from the repository root. */
export const EXTENSION_ENTRIES = ['extension.js', 'prefs.js', 'core/', 'disk/', 'shell/'];

/** Repo-relative paths of every extension .js file. */
export async function listSources() {
    const out = [];
    if (isNode) {
        const fs = await import('node:fs/promises');
        for (const e of EXTENSION_ENTRIES) {
            if (!e.endsWith('/')) { out.push(e); continue; }
            for (const f of await fs.readdir(new URL(e, root), {recursive: true}))
                if (f.endsWith('.js')) out.push(`${e}${f}`);
        }
        return out.sort();
    }
    const walk = (dir, rel) => {
        const en = dir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        for (let i; (i = en.next_file(null));) {
            const n = i.get_name();
            if (i.get_file_type() === Gio.FileType.DIRECTORY) walk(dir.get_child(n), `${rel}${n}/`);
            else if (n.endsWith('.js')) out.push(`${rel}${n}`);
        }
    };
    for (const e of EXTENSION_ENTRIES)
        if (e.endsWith('/')) walk(root.get_child(e.slice(0, -1)), e);
        else out.push(e);
    return out.sort();
}

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
