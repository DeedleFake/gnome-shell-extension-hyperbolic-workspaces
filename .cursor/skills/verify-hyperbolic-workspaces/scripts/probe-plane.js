(() => {
    const all = [];
    const walk = a => { all.push(a); for (const c of a.get_children()) walk(c); };
    walk(global.stage);
    const plane = all.find(a => a.constructor.name.includes('Plane') && a._disk);
    if (!plane) return JSON.stringify({plane: null});
    const titles = ws => ws.list_windows().map(w => w.title).sort().join(',') || '(empty)';
    const tiles = {};
    for (const id of plane._frame?.tiles?.keys() ?? []) {
        const ws = plane._cfg.plane.at(id);
        if (ws) tiles[id] = titles(ws);
    }
    const focusTile = plane._focusTile();
    const wm = global.workspace_manager;
    return JSON.stringify({focusTile, focus: tiles[focusTile] ?? '(no workspace)', active: titles(wm.get_active_workspace()), size: plane._disk.size, tiles});
})()
