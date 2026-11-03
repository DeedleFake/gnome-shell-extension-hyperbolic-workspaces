// Stage "X Y" on an empty, reachable tile where a click reaches the plane itself; the focused tile if it is empty.
// Stored in a global: hw reads it with a second Eval, because this scan's own Eval reply came back empty.
globalThis.hwEmptyTilePoint = (() => {
    const all = [];
    const walk = a => { all.push(a); for (const c of a.get_children()) walk(c); };
    walk(global.stage);
    const v = all.find(a => a.constructor.name.includes('Plane') && a._disk);
    if (!v) return 'none';
    const C = imports.gi.Clutter;
    const focus = v._cfg.view.focus;
    let any = null;
    for (let y = 110; y < 670; y += 20) {
        for (let x = 20; x < 1280; x += 20) {
            const [, lx, ly] = v.transform_stage_point(x, y);
            const t = v._tileAt(lx, ly);
            if (t === null || t === undefined || !v._reach.has(t) || v._cfg.plane.at(t)) continue;
            if (global.stage.get_actor_at_pos(C.PickMode.REACTIVE, x, y) !== v) continue;
            if (focus.kind === 'tile' && focus.tile === t) return x + " " + y;
            if (!any) any = x + " " + y;
        }
    }
    return any ?? 'none';
})()
