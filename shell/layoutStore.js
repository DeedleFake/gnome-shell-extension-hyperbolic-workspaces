// Holds the plane across disable() and enable() inside one shell process. Extension modules are imported
// once per process, so this survives a disable but never a restart or logout. The plane is keyed by the
// Meta.Workspace objects themselves, so workspaces removed while disabled simply drop out on the next sync.

/** @type {object|null} */
let kept = null;

/** @param {object} plane */
export function keep(plane) { kept = plane; }

/** @template P @param {() => P} make @returns {P} the kept plane, or a new one. Empties the store. */
export function take(make) {
    const plane = kept ?? make();
    kept = null;
    return plane;
}
