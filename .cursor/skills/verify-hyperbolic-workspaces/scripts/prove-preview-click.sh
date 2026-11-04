#!/bin/sh
# A click on a window preview the plane lets through closes the Overview with that window focused, on the
# focused workspace and on its neighbors alike. From the cutoff size up, a neighbor's preview changes nothing.
# Run after `hw up` and `hw scene`. Exits non-zero on the first failed check.
set -eu
hw="$(dirname "$0")/hw"
fail() { echo "FAIL: $*"; exit 1; }
active() { w=$("$hw" workspaces | tr -d "\"')"); i=$(echo "$w" | sed -n 's/.*active=\([0-9]*\).*/\1/p'); echo "$w" | tr '|' '\n' | sed -n "s/^.* \{0,1\}$i:\([^ ]*\) *\$/\1/p" | head -1; }
focused() { "$hw" eval 'global.display.focus_window?.title ?? "none"' | sed -n "s/^(true, '\"\{0,1\}\([^\"']*\)\"\{0,1\}')\$/\1/p"; }
clickable() { "$hw" probe-clicks | tr -d '\\' | sed -n 's/.*"clickable":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' ' '; }
start() { "$hw" eval "(() => { const w = global.get_window_actors().map(a => a.meta_window).find(w => w.title === '$1'); w.get_workspace().activate_with_focus(w, global.get_current_time()); return 'ok'; })()" >/dev/null; sleep 1; [ "$(active)" = "$1" ] || fail "could not start on $1's workspace"; "$hw" overview show >/dev/null; sleep 1.5; }
center() { "$hw" preview-center "$1" | tr -dc '0-9 '; }
keyreach() { # keyreach LABEL: Tab, Shift+Tab and arrows never put key focus on a preview that takes no clicks
    ok=" $(clickable) "
    for k in Tab Tab Tab Right Down Left Up; do
        "$hw" key $k >/dev/null; sleep 0.4
        t=$("$hw" eval '(() => { let a = global.stage.key_focus; while (a && a.constructor.name !== "WindowPreview") a = a.get_parent(); return a?.metaWindow?.title ?? "-"; })()' | tr -d "()'\"" | sed 's/^true, //')
        [ "$t" = - ] || case $ok in *" $t "*) ;; *) fail "$1: $k put key focus on $t's preview, outside window reach ($ok)";; esac
    done
    "$hw" key Tab Shift_L >/dev/null; sleep 0.4
    echo "$1 keys: no key focus outside window reach ($ok)"
}
check_enters() { # check_enters LABEL TITLE
    sleep 1.5
    v=$("$hw" eval 'Main.overview.visible'); a=$(active); f=$(focused)
    echo "$1 $2: overview=$v active=$a focus=$f"
    case $v in *false*) ;; *) fail "$1 $2 left the Overview open";; esac
    [ "$a" = "$2" ] || fail "$1 $2 left the active workspace on '$a'"
    [ "$f" = "$2" ] || fail "$1 $2 focused '$f'"
}

start Alpha
n=$(clickable | tr ' ' '\n' | grep -vx Alpha | head -1)
[ -n "$n" ] || fail "no neighbor preview takes clicks around Alpha: $(clickable)"
"$hw" click $(center "$n") >/dev/null
check_enters "neighbor click" "$n"

start Alpha
"$hw" click $(center Alpha) >/dev/null
check_enters "focused click" Alpha

start Alpha
n=$(clickable | tr ' ' '\n' | grep -vx Alpha | head -1)
"$hw" eval "(() => { const all = []; const w = a => { all.push(a); a.get_children().forEach(w); }; w(global.stage); all.find(a => a.constructor.name === 'WindowPreview' && a.metaWindow?.title === '$n' && a.mapped).grab_key_focus(); return 'ok'; })()" >/dev/null
"$hw" key Return >/dev/null
check_enters "neighbor Return" "$n"

start Alpha
keyreach "size 1"
"$hw" overview hide >/dev/null

"$hw" gset set org.gnome.shell.extensions.hyperbolic-workspaces focused-tile-size 1.8 >/dev/null
start Alpha
c=$(clickable)
n=$(for t in Beta Gamma Delta; do [ "$(center $t)" != "" ] && echo $t; done | head -1)
echo "size 1.8: clickable=$c"
[ "$c" = Alpha ] || { "$hw" gset reset org.gnome.shell.extensions.hyperbolic-workspaces focused-tile-size; fail "at 1.8 clickable previews were '$c', want Alpha only"; }
keyreach "size 1.8"
"$hw" overview hide >/dev/null; sleep 1; start Alpha
if [ -n "$n" ]; then
    "$hw" click $(center "$n") >/dev/null; sleep 1.5
    v=$("$hw" eval 'Main.overview.visible'); a=$(active)
    echo "size 1.8 neighbor click $n: overview=$v active=$a"
    "$hw" gset reset org.gnome.shell.extensions.hyperbolic-workspaces focused-tile-size >/dev/null
    case $v in *true*) ;; *) fail "at 1.8 a click on $n's preview closed the Overview";; esac
    [ "$a" = Alpha ] || fail "at 1.8 a click on $n's preview moved the active workspace to '$a'"
else
    "$hw" gset reset org.gnome.shell.extensions.hyperbolic-workspaces focused-tile-size >/dev/null
fi
"$hw" overview hide >/dev/null
echo PASS
