// A WorkspaceTracker stand-in: one trailing empty spare, the active workspace is never removed,
// and empty workspaces leave only on flush() (GNOME's 1 s _checkWorkspaces grace).
export class FakeWm {
    constructor() {
        this.list = [this._new(), this._new()];
        this.active = this.list[0];
    }
    _new() { return {w: 0, name: `ws${(this._n = (this._n ?? 0) + 1)}`}; }
    /** @returns {import('../src/core/types.js').Snapshot<object>} */
    snapshot() { return {order: [...this.list], hasWindows: k => k.w > 0, active: this.active}; }
    openWindow(k) {
        k.w++;
        if (k === this.list.at(-1)) this.list.push(this._new());
    }
    closeWindow(k) {
        if (k.w === 0) throw new Error(`${k.name} has no windows`);
        k.w--;
    }
    flush() {
        this.list = this.list.filter((k, i) => k.w > 0 || k === this.active || i === this.list.length - 1);
    }
    activate(k) { this.active = k; }
    reorder(k, index) {
        this.list.splice(this.list.indexOf(k), 1);
        this.list.splice(index, 0, k);
    }
}

/** Runs one reconcile exactly as extension.js wires it. */
export const drive = (plane, view, wm) => {
    const change = plane.sync(wm.snapshot(), t => view.screenDown(t));
    view.absorb(change);
    return change;
};

/** Opens a window on `n` fresh workspaces (each on the trailing spare). */
export function fill(plane, view, wm, n) {
    for (let i = 0; i < n; i++) {
        wm.openWindow(wm.list.at(-1));
        drive(plane, view, wm);
    }
}
