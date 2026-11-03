#!/bin/sh
# Every way the Overview closes enters the plane's focused workspace.
# Run after `hw up` and `hw scene`. Exits non-zero on the first failed check.
set -eu
hw="$(dirname "$0")/hw"
fail() { echo "FAIL: $*"; exit 1; }
# Titles on the active workspace. Compare titles, not indices: dynamic workspaces drop the empty one we left.
active() { w=$("$hw" workspaces | tr -d "\"')"); i=$(echo "$w" | sed -n 's/.*active=\([0-9]*\).*/\1/p'); echo "$w" | tr '|' '\n' | sed -n "s/^.* \{0,1\}$i:\([^ ]*\) *\$/\1/p" | head -1; }
focus() { "$hw" probe-plane | tr -d '\\' | sed -n 's/.*"focus":"\([^"]*\)".*/\1/p'; }
tile() { "$hw" probe-plane | tr -d '\\' | sed -n 's/.*"focusTile":\([0-9]*\).*/\1/p'; }

for close in Escape Super_L hide; do
    "$hw" overview show >/dev/null; sleep 1.5
    "$hw" key Page_Down >/dev/null; sleep 1
    f=$(focus); want=$f
    [ -n "$f" ] && [ "$f" != "(empty)" ] || fail "$close: focus '$f' is not a workspace with a window"
    if [ "$close" = hide ]; then "$hw" overview hide >/dev/null; else "$hw" key "$close" >/dev/null; fi
    sleep 1.5
    got=$(active)
    echo "$close: focus=$f want=$want active=$got"
    [ "$got" = "$want" ] || fail "$close left the active workspace on '$got', focused workspace holds $want"
done

# A tile with no workspace is entered too: closing on it opens a workspace there, as clicking it does.
# Each case starts on Alpha's workspace: leaving an empty workspace for an empty tile is a separate bug, clicks included.
for close in Escape Super_L hide; do
    "$hw" eval "global.get_window_actors().map(a => a.meta_window).find(w => w.title === 'Alpha').get_workspace().activate(global.get_current_time())" >/dev/null; sleep 1
    "$hw" overview show >/dev/null; sleep 1.5
    for _ in 1 2 3 4; do [ "$(focus)" = "(no workspace)" ] && break; "$hw" key Right >/dev/null; sleep 0.7; done
    t=$(tile); [ "$(focus)" = "(no workspace)" ] || fail "$close: could not focus a tile with no workspace"
    if [ "$close" = hide ]; then "$hw" overview hide >/dev/null; else "$hw" key "$close" >/dev/null; fi
    sleep 1.5
    "$hw" overview show >/dev/null; sleep 1.5
    got=$(tile); f=$(focus); a=$("$hw" probe-plane | tr -d '\\' | sed -n 's/.*"active":"\([^"]*\)".*/\1/p')
    "$hw" overview hide >/dev/null; sleep 1
    echo "$close on empty tile $t: reopened focus tile=$got holds=$f active=$a"
    [ "$got" = "$t" ] && [ "$f" = "(empty)" ] && [ "$a" = "(empty)" ] || fail "$close on empty tile $t did not enter a new workspace there (tile $got holds $f, active holds $a)"
done

# A window activated from the Overview wins over the plane's focus, as in GNOME. Main.activateWindow is the
# path GNOME's window previews and window search results take; eval stands in for picking a result.
"$hw" overview show >/dev/null; sleep 1.5
"$hw" key Page_Down >/dev/null; sleep 1
f=$(focus); other=Alpha; [ "$f" = Alpha ] && other=Beta
"$hw" eval "Main.activateWindow(global.get_window_actors().map(a => a.meta_window).find(w => w.title === '$other'))" >/dev/null
sleep 1.5
got=$(active)
echo "window activated: focus=$f activated=$other active=$got"
[ "$got" = "$other" ] || fail "activating $other left the active workspace on '$got'"
echo PASS
