#!/bin/sh
# Opens Alpha, Beta, Gamma and Delta in gs51, each on its own workspace after an empty active one.
set -eu
E() { docker exec gs51 /shell-eval.sh "$1"; }
E 'Main.overview.hide(); "ok"' >/dev/null
for n in Alpha Beta Gamma Delta; do
	docker exec gs51 /open-window.sh $n 700 450
	sleep 2
	E "(() => { const wm = global.workspace_manager; const w = global.display.list_all_windows().find(w => w.title === '$n'); w.change_workspace_by_index(wm.n_workspaces - 1, true); wm.get_workspace_by_index(0).activate(global.get_current_time()); return 'ok'; })()" >/dev/null
	sleep 1
done
E '(() => { const wm = global.workspace_manager; const o = []; for (let i = 0; i < wm.n_workspaces; i++) o.push(i + ":" + wm.get_workspace_by_index(i).list_windows().map(w => w.title).join(",")); return o.join(" | "); })()'
