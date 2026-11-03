// "TILE X Y": a blank reachable tile that touches the active workspace's tile and no other seated tile, at a stage
// point where a click reaches the plane. Entering it leaves the active workspace's tile as its only link to the group.
globalThis.hwLoneTilePoint = (() => {
    const all = [];
    const walk = a => { all.push(a); for (const c of a.get_children()) walk(c); };
    walk(global.stage);
    const v = all.find(a => a.constructor.name.includes('Plane') && a._disk);
    if (!v) return 'none';
    const C = imports.gi.Clutter;
    const plane = v._cfg.plane, T = plane.tiling;
    const home = plane.seatOf(global.workspace_manager.get_active_workspace())?.tile;
    if (home === undefined) return 'none';
    const seatedTiles = new Set(plane.seated().map(k => plane.seatOf(k).tile));
    const lone = t => !seatedTiles.has(t) && T.neighbors(t).includes(home) &&
        T.neighbors(t).every(n => n === home || !seatedTiles.has(n));
    for (let y = 110; y < 670; y += 10) {
        for (let x = 20; x < 1280; x += 10) {
            const [, lx, ly] = v.transform_stage_point(x, y);
            const t = v._tileAt(lx, ly);
            if (t === null || t === undefined || !v._reach.has(t) || !lone(t)) continue;
            if (global.stage.get_actor_at_pos(C.PickMode.REACTIVE, x, y) !== v) continue;
            return `${t} ${x} ${y}`;
        }
    }
    return 'none';
})()
