#!/bin/sh
# Entering an empty tile (which opens a workspace and closes the Overview) leaves no Gjs-CRITICAL in the
# shell log, even after a full GC. Run after `hw up` and `hw scene`. Exits non-zero on failure.
set -eu
hw="$(dirname "$0")/hw"
fail() { echo "FAIL: $*"; exit 1; }
crit() { "$hw" logs 1000000 | grep -c Gjs-CRITICAL || true; }
# Retries: right after the Overview opens the plane may not have laid out its tiles yet.
point() { for _ in 1 2 3 4 5; do p=$("$hw" empty-tile-point | tr -dc '0-9 ' | xargs); [ -n "$p" ] && { echo "$p"; return; }; sleep 1; done; }

active() { "$hw" workspaces | sed -n 's/.*active=\([0-9]*\).*/\1/p'; }

# The virtual pointer starts in the top-left hot corner; leaving it there toggles the Overview on the first move.
"$hw" move 640 760 >/dev/null; sleep 0.5
before=$(crit); start=$(active)
"$hw" overview show >/dev/null; sleep 2.5
# The first click focuses an empty tile and the second enters it; one click enters an already focused one.
for _ in 1 2; do
    [ "$("$hw" eval Main.overview.visible)" = "(true, 'true')" ] || break
    p=$(point); [ -n "$p" ] || fail "no empty tile to click"
    "$hw" click $p >/dev/null; sleep 1
done
[ "$("$hw" eval Main.overview.visible)" = "(true, 'false')" ] || fail "the Overview stayed open"
[ "$(active)" != "$start" ] || fail "the Overview closed but no new workspace was entered (active=$start)"
"$hw" eval 'imports.system.gc(); 0' >/dev/null; sleep 1
after=$(crit)
echo "Gjs-CRITICAL lines: before=$before after=$after"
[ "$after" = "$before" ] || { "$hw" logs 1000000 | grep -A4 Gjs-CRITICAL | head -12; fail "$((after - before)) new Gjs-CRITICAL lines"; }
echo PASS
