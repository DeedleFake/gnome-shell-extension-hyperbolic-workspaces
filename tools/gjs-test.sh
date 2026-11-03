#!/bin/sh
# Runs test/run-gjs.js inside the gs51 container against a fresh copy of this tree and the prototype's hyper.js.
set -eu
cd "$(dirname "$0")/.."
docker exec gs51 rm -rf /tmp/hw /tmp/hw.log /tmp/hw.exit
docker exec gs51 mkdir -p /tmp/hw
git ls-files --cached --others --exclude-standard | tar -cf - -T - | docker exec -i gs51 tar -xf - -C /tmp/hw
docker cp "${HYPER_JS:-/workspace/hyperbolic-workspaces/hyper.js}" gs51:/tmp/hw-hyper.js
# The docker daemon drops long exec streams, so the run is detached and its log polled.
docker exec -d -e HYPER_JS=/tmp/hw-hyper.js -w /tmp/hw gs51 sh -c 'gjs -m test/run-gjs.js > /tmp/hw.log 2>&1; echo $? > /tmp/hw.exit'
while ! docker exec gs51 test -e /tmp/hw.exit; do sleep 1; done
docker exec gs51 cat /tmp/hw.log
exit "$(docker exec gs51 cat /tmp/hw.exit)"
