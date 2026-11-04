// "TILE X Y": a tile outside reach, at a stage point where a click reaches the plane. A tile that holds a
// workspace wins over a blank one, so a wrong enter would show as a switch.
globalThis.hwFarTilePoint = (() => {
    const all = [];
    const walk = a => { all.push(a); for (const c of a.get_children()) walk(c); };
    walk(global.stage);
    const v = all.find(a => a.constructor.name.includes('Plane') && a._disk);
    if (!v) return 'none';
    const C = imports.gi.Clutter;
    let blank = null;
    for (let y = 110; y < 670; y += 10) {
        for (let x = 20; x < 1280; x += 10) {
            const [, lx, ly] = v.transform_stage_point(x, y);
            const t = v._tileAt(lx, ly);
            if (t === null || t === undefined || v._reach.has(t)) continue;
            if (global.stage.get_actor_at_pos(C.PickMode.REACTIVE, x, y) !== v) continue;
            if (v._cfg.plane.at(t)) return `${t} ${x} ${y}`;
            blank ??= `${t} ${x} ${y}`;
        }
    }
    return blank ?? 'none';
})()
