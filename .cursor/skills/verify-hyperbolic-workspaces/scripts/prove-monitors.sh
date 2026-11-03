#!/bin/sh
# With workspaces on every monitor, the secondary monitor and the plane always agree on the workspace.
# Run after `HW_MONITORS='1280x800 1024x768' hw up`, `hw scene` and
# `hw gset set org.gnome.mutter workspaces-only-on-primary false`. Exits non-zero on the first failed check.
set -eu
hw="$(dirname "$0")/hw"
fail() { echo "FAIL: $*"; exit 1; }
ev() { "$hw" eval "$1" | sed -n "s/^(true, '\"\(.*\)\"')\$/\1/p"; }
D='Main.overview._overview.controls._workspacesDisplay'
SEC="$D._workspacesViews.find(v => v._thumbnails)"
active() { ev 'String(global.workspace_manager.get_active_workspace_index())'; }
focus() { ev "String($D._workspacesViews[Main.layoutManager.primaryIndex]._cfg.view.focus.key?.index() ?? -1)"; }
shown() { ev "String(Math.round($D._scrollAdjustment.value))"; }

"$hw" move 600 400 >/dev/null
"$hw" eval "global.get_window_actors().map(a => a.meta_window).find(w => w.title === 'Beta').move_to_monitor(1)" >/dev/null; sleep 1
"$hw" eval "global.get_window_actors().map(a => a.meta_window).find(w => w.title === 'Alpha').get_workspace().activate(global.get_current_time())" >/dev/null; sleep 1
"$hw" overview show >/dev/null; sleep 1.5
seated=$(ev "const ws = global.get_window_actors().map(a => a.meta_window).find(w => w.title === 'Beta').get_workspace(); String($D._workspacesViews[Main.layoutManager.primaryIndex]._cfg.plane.seatOf(ws) !== undefined)")
echo "Beta moved to the secondary monitor: its workspace on the plane=$seated"
[ "$seated" = true ] || fail "a workspace whose windows are all on the secondary monitor has no tile"

vis=$(ev "String($SEC._thumbnails.visible)")
echo "secondary thumbnails visible=$vis"
[ "$vis" = true ] || fail "the secondary monitor hides its workspace thumbnails"

"$hw" key Page_Down >/dev/null; sleep 1.5
f=$(focus); s=$(shown)
echo "plane focus moved: focus=$f secondary shows=$s"
[ "$f" -ge 0 ] || fail "Page_Down left no workspace focused"
[ "$s" = "$f" ] || fail "secondary shows workspace $s, the plane focuses $f"

want=$(( (f + 2) % 5 ))
xy=$(ev "const t = $SEC._thumbnails._thumbnails.find(x => x.metaWorkspace.index() === $want); const [x, y] = t.get_transformed_position(); const [w, h] = t.get_transformed_size(); Math.round(x + w / 2) + ' ' + Math.round(y + h / 2)")
"$hw" click $xy >/dev/null; sleep 1.5
a=$(active); f=$(focus)
echo "secondary thumbnail $want clicked at $xy: active=$a focus=$f"
[ "$a" = "$want" ] || fail "clicking thumbnail $want made $a active"
[ "$f" = "$a" ] || fail "the plane focuses $f while $a is active"

"$hw" key Escape >/dev/null; sleep 1.5
a=$(active)
echo "closed: active=$a"
[ "$a" = "$want" ] || fail "closing entered $a, not the focused $want"

"$hw" overview show >/dev/null; sleep 1.5
f=$(focus)
echo "reopened: focus=$f active=$a"
[ "$f" = "$a" ] || fail "reopened with $f focused while $a is active"
"$hw" overview hide >/dev/null; sleep 1

echo PASS
