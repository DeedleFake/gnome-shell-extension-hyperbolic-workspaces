#!/bin/sh
# A window or search pick on the active workspace wins over the plane's focus. A click outside reach focuses that
# tile and enters nothing, and a drag there still pans. The active workspace moves with the move modifier like any
# other, and the group stays connected. Run after `hw up` and `hw scene`. Exits non-zero on the first failed check.
set -eu
hw="$(dirname "$0")/hw"
fail() { echo "FAIL: $*"; exit 1; }
active() { w=$("$hw" workspaces | tr -d "\"')"); i=$(echo "$w" | sed -n 's/.*active=\([0-9]*\).*/\1/p'); echo "$w" | tr '|' '\n' | sed -n "s/^.* \{0,1\}$i:\([^ ]*\) *\$/\1/p" | head -1; }
focused() { "$hw" eval 'global.display.focus_window?.title ?? "none"' | sed -n "s/^(true, '\"\{0,1\}\([^\"']*\)\"\{0,1\}')\$/\1/p"; }
visible() { case $("$hw" eval 'Main.overview.visible') in *"'true'"*) echo true;; *) echo false;; esac; }
probe() { "$hw" probe-plane | tr -d '\\'; }
ftile() { probe | sed -n 's/.*"focusTile":\([0-9]*\).*/\1/p'; }
focus() { probe | sed -n 's/.*"focus":"\([^"]*\)".*/\1/p'; }
tileof() { probe | tr ',{}' '\n\n\n' | sed -n "s/^\"\([0-9]*\)\":\"$1\"\$/\1/p"; }
center() { "$hw" preview-center "$1" | tr -dc '0-9 '; }
point() { "$hw" "$1" | tr -d "()'\"" | sed 's/^true, //'; }
start() { "$hw" eval "(() => { const w = global.get_window_actors().map(a => a.meta_window).find(w => w.title === '$1'); w.get_workspace().activate_with_focus(w, global.get_current_time()); return 'ok'; })()" >/dev/null; sleep 1; "$hw" overview show >/dev/null; sleep 1.5; }
away() { for _ in 1 2 3 4; do [ "$(focus)" != "$1" ] && return; "$hw" key Right >/dev/null; sleep 0.7; done; fail "could not move the focus off $1"; }
check_left() { # check_left LABEL WORKSPACE_TITLES WINDOW
    sleep 1.5
    v=$("$hw" eval 'Main.overview.visible'); a=$(active); f=$(focused)
    echo "$1: overview=$v active=$a focus=$f"
    case $v in *false*) ;; *) fail "$1 left the Overview open";; esac
    [ "$a" = "$2" ] || fail "$1 left the active workspace on '$a', want '$2'"
    [ "$f" = "$3" ] || fail "$1 focused '$f', want $3"
}
connected() { "$hw" eval '(() => { const all = []; const w = a => { all.push(a); a.get_children().forEach(w); }; w(global.stage); const v = all.find(a => a.constructor.name.includes("Plane") && a._disk); const p = v._cfg.plane, T = p.tiling; const occ = new Set(p.seated().map(k => p.seatOf(k).tile)); const [t0] = occ; const seen = new Set([t0]), q = [t0]; while (q.length) for (const n of T.neighbors(q.pop())) if (occ.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } return seen.size === occ.size && occ.has(p.center) ? "connected" : "split"; })()' | tr -dc 'a-z'; }

start Alpha
away Alpha
"$hw" click $(center Alpha) >/dev/null
check_left "window click on the active workspace, focus elsewhere" Alpha Alpha

"$hw" eval 'const G = imports.gi.GLib; const d = G.get_user_data_dir() + "/applications"; G.mkdir_with_parents(d, 0o755); G.file_set_contents(d + "/test.win.Foxtrot.desktop", ["[Desktop Entry]", "Type=Application", "Name=Foxtrot", "Exec=gjs -m /hw/window.js Foxtrot 700 450", ""].join(String.fromCharCode(10))); "ok"' >/dev/null
sleep 2
"$hw" eval "global.get_window_actors().map(a => a.meta_window).find(w => w.title === 'Alpha').get_workspace().activate(global.get_current_time())" >/dev/null; sleep 1
"$hw" window Foxtrot >/dev/null; sleep 1
[ "$(active)" = Alpha,Foxtrot ] || fail "Foxtrot did not open on Alpha's workspace: $(active)"
"$hw" overview show >/dev/null; sleep 1.5
away Alpha,Foxtrot
for c in f o x t r o t; do "$hw" key $c >/dev/null; sleep 0.2; done; sleep 2
"$hw" key Return >/dev/null
check_left "search pick on the active workspace, focus elsewhere" Alpha,Foxtrot Foxtrot

start Alpha
before=$(active)
set -- $(point far-tile-point)
[ "$#" = 3 ] || fail "no tile outside reach takes a click"
far=$1
"$hw" click "$2" "$3" >/dev/null; sleep 1.5
t=$(ftile); v=$(visible); a=$(active)
echo "far click on tile $far: focusTile=$t overview=$v active=$a"
[ "$v" = true ] || fail "a far click closed the Overview"
[ "$a" = "$before" ] || fail "a far click switched to '$a'"
[ "$t" = "$far" ] || fail "a far click left the focus on tile $t, want $far"
set -- $(point far-tile-point)
[ "$#" = 3 ] || fail "no second tile outside reach"
w0=$("$hw" workspaces)
"$hw" drag "$2" "$3" $(($2 > 640 ? $2 - 200 : $2 + 200)) "$3" >/dev/null; sleep 1.5
v=$(visible); w1=$("$hw" workspaces)
echo "far drag from tile $1: overview=$v workspaces unchanged=$([ "$w0" = "$w1" ] && echo yes || echo no)"
[ "$v" = true ] || fail "a far drag closed the Overview"
[ "$w0" = "$w1" ] || fail "a far drag changed the workspaces: $w1"
"$hw" overview hide >/dev/null; sleep 1

start Beta
from=$(tileof Beta); to=$(tileof Alpha)
[ -n "$from" ] && [ -n "$to" ] || fail "Beta or Alpha has no tile: $(probe)"
"$hw" drag $(center Beta) $(center Alpha) Super_L >/dev/null; sleep 2
now=$(tileof Beta); v=$(visible); a=$(active); g=$(connected)
echo "move-modifier drag of the active workspace Beta from tile $from onto $to: now on tile $now overview=$v active=$a group=$g"
[ "$v" = true ] || fail "the drag closed the Overview"
[ "$a" = Beta ] || fail "the drag switched to '$a'"
[ "$now" != "$from" ] || fail "the active workspace did not move"
[ "$g" = connected ] || fail "the group split after moving the active workspace"
"$hw" key Escape >/dev/null
check_left "Escape after moving the active workspace" Beta Beta
echo PASS
