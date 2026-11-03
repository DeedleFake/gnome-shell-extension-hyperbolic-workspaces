#!/bin/sh
# Runs test/run-gjs.js inside the gs51 container against a fresh copy of this tree and the prototype's hyper.js.
set -eu
cd "$(dirname "$0")/.."
docker exec gs51 rm -rf /tmp/hw
docker exec gs51 mkdir -p /tmp/hw
git ls-files --cached --others --exclude-standard | tar -cf - -T - | docker exec -i gs51 tar -xf - -C /tmp/hw
docker cp "${HYPER_JS:-/workspace/hyperbolic-workspaces/hyper.js}" gs51:/tmp/hw-hyper.js
docker exec -e HYPER_JS=/tmp/hw-hyper.js -w /tmp/hw gs51 gjs -m test/run-gjs.js
