#!/bin/sh
# End-to-end journey for features/preferences.md. Needs `hw up` and `hw scene` first.
# Writes every step and its observed state to $EV/prefs-journey.log; exits 1 on the first failed check.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
hw=$here/hw
EV=${HW_EVIDENCE:-/workspace/hw-evidence/${HW_INSTANCE:-hw-verify}}
mkdir -p "$EV"; log=$EV/prefs-journey.log; : > "$log"
say() { echo "$*" | tee -a "$log"; }
check() { if [ "$2" = "$3" ]; then say "PASS $1 ($2)"; else say "FAIL $1: got '$2', want '$3'"; exit 1; fi; }
probe() { "$hw" probe-clicks | sed "s/^(true, '//; s/')\$//; s/\\\\\\\\//g; s/\\\\\"/\"/g"; }
size() { "$hw" gget focused-tile-size; }
overview_state() { "$hw" overview show >/dev/null; sleep 1; p=$(probe); say "overview probe: $p"; "$hw" shot "$1" | tee -a "$log"; "$hw" overview hide >/dev/null; }

check 'starts at the default' "$(size)" 1.0
overview_state overview-size-1
case $p in *'"size":1,'*'"clickable":["Alpha"'*) say "PASS size 1 lets neighbor windows take clicks";; *) say "FAIL size 1 probe"; exit 1;; esac

"$hw" prefs >/dev/null
"$hw" shot prefs-open | tee -a "$log"
"$hw" a11y tree > "$EV/prefs-a11y.txt"
check 'slider reads the setting' "$("$hw" a11y value slider '')" 1.0
# The window does not always hand focus to the slider on open; Tab until End moves it (at most 4 stops).
for tabs in 1 2 3 4; do
	"$hw" key Tab >/dev/null; "$hw" key End >/dev/null; sleep 0.5
	[ "$(size)" = 2.5 ] && break
done
say "slider took focus after $tabs Tab press(es)"
check 'End moves the focused slider to the maximum' "$(size)" 2.5
"$hw" key Home >/dev/null
for _ in $(seq 20); do "$hw" key Right >/dev/null; done; sleep 0.5
check 'Home then 20 x Right lands on Klein' "$(size)" 2.0
check 'slider shows the stored value' "$("$hw" a11y value slider '')" 2.0
"$hw" shot prefs-size-2 | tee -a "$log"
"$hw" prefs-close >/dev/null; sleep 1

overview_state overview-size-2
case $p in *'"size":2,'*'"clickable":[]'*) say "PASS size 2 blocks neighbor windows";; *) say "FAIL size 2 probe"; exit 1;; esac

"$hw" prefs >/dev/null
check 'reopened prefs shows 2' "$("$hw" a11y value slider '')" 2.0
"$hw" a11y do button 'Reset to default' >/dev/null; sleep 0.5
check 'Reset restores the default' "$(size)" 1.0
check 'slider follows the reset' "$("$hw" a11y value slider '')" 1.0
"$hw" shot prefs-after-reset | tee -a "$log"
"$hw" prefs-close >/dev/null; sleep 1

overview_state overview-after-reset
case $p in *'"size":1,'*'"clickable":["Alpha"'*) say "PASS reset size reaches the Overview";; *) say "FAIL reset probe"; exit 1;; esac
say "ALL PASS"
