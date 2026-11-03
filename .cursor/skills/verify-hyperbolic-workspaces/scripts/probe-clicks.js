(() => {
    const all = [];
    const walk = a => { all.push(a); for (const c of a.get_children()) walk(c); };
    walk(global.stage);
    const plane = all.find(a => a.constructor.name.includes('Plane') && a._disk);
    const out = {size: plane?._disk?.size ?? null, clickable: [], blocked: []};
    for (const p of all.filter(a => a.constructor.name === 'WindowPreview' && a.mapped && a.opacity > 0)) {
        const [ok, b] = [true, p.get_transformed_extents()];
        const x = b.get_x() + b.get_width() / 2, y = b.get_y() + b.get_height() / 2;
        let hit = global.stage.get_actor_at_pos(imports.gi.Clutter.PickMode.REACTIVE, x, y);
        let inside = false;
        for (let h = hit; h; h = h.get_parent()) if (h === p) { inside = true; break; }
        (inside ? out.clickable : out.blocked).push(p.metaWindow.title);
    }
    out.clickable.sort(); out.blocked.sort();
    return JSON.stringify(out);
})()
