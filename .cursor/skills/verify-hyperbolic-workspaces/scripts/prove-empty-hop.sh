#!/bin/sh
# Leaving an empty workspace for a blank tile lands on that tile, by click and by closing the Overview.
# Focusing the blank seats the empty workspace there right away (focus is active). Closing or a second click enters it.
# The blank tile touches only the workspace being left, so the plane loses that link as GNOME removes it.
# GNOME then holds one empty workspace, so Super+PgUp goes to Delta.
# Run after `hw up` and `hw scene`. Exits non-zero on the first failed check.
set -eu
hw="$(dirname "$0")/hw"
fail() { echo "FAIL: $*"; exit 1; }
probe() { "$hw" probe-plane | tr -d '\\'; }
field() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p"; }
alpha() { "$hw" eval "global.get_window_actors().map(a => a.meta_window).find(w => w.title === 'Alpha').get_workspace().activate(global.get_current_time())" >/dev/null; sleep 1; }

for how in click Escape; do
    alpha
    "$hw" overview show >/dev/null; sleep 1.5
    for _ in 1 2 3 4; do [ "$(probe | field focus)" = "(empty)" ] && break; "$hw" key Right >/dev/null; sleep 0.7; done
    "$hw" key Escape >/dev/null; sleep 1.5
    "$hw" overview show >/dev/null; sleep 1.5
    [ "$(probe | field active)" = "(empty)" ] || fail "$how: setup did not leave an empty workspace active"
    set -- $("$hw" lone-tile-point | tr -d "()'\"," | sed 's/^true //')
    [ $# -eq 3 ] || fail "$how: no blank tile touches only the active workspace"
    t=$1
    "$hw" click "$2" "$3" >/dev/null; sleep 1
    [ "$(probe | field focusTile)" = "$t" ] || fail "$how: clicking tile $t did not focus it"
    # Focusing centers the tile, so the second click goes where it is drawn now.
    if [ "$how" = click ]; then "$hw" click $("$hw" empty-tile-point | tr -d "()'\"," | sed 's/^true //') >/dev/null; else "$hw" key Escape >/dev/null; fi
    sleep 2
    "$hw" overview show >/dev/null; sleep 1.5
    p=$(probe); got=$(echo "$p" | field focusTile); f=$(echo "$p" | field focus); a=$(echo "$p" | field active)
    empties=$(echo "$p" | grep -o '"(empty)"' | wc -l)
    "$hw" overview hide >/dev/null; sleep 1
    echo "$how from an empty workspace onto lone tile $t: reopened focus tile=$got holds=$f active=$a; $p"
    [ "$got" = "$t" ] && [ "$f" = "(empty)" ] && [ "$a" = "(empty)" ] || fail "$how did not land on tile $t (focus tile $got holds $f, active holds $a)"
    for w in Alpha Beta Gamma Delta; do echo "$p" | grep -q "\"$w\"" || fail "$how: $w lost its tile"; done
    # Two from the probe's focus and active fields, plus one tile: the left workspace is a blank tile again.
    [ "$empties" -eq 3 ] || fail "$how: expected one empty tile on the plane, probe shows $((empties - 2))"
    list=$("$hw" workspaces | sed "s/^(true, '\"//; s/\"')$//"); echo "$how: GNOME $list"
    [ "$(echo "$list" | grep -o ': *\(|\|$\)' | wc -l)" -eq 1 ] || fail "$how: GNOME keeps more than one empty workspace: $list"
    "$hw" key Page_Up Super_L >/dev/null; sleep 1
    "$hw" overview show >/dev/null; sleep 1.5
    a=$(probe | field active); "$hw" overview hide >/dev/null; sleep 1
    [ "$a" = Delta ] || fail "$how: Super+PgUp went to $a, not Delta"
done
echo PASS
