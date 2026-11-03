#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
n=0
for f in $(git ls-files --cached --others --exclude-standard '*.js'); do node --check "$f"; n=$((n + 1)); done
echo "node --check: $n files ok"
if command -v glib-compile-schemas >/dev/null; then
	glib-compile-schemas --strict --dry-run schemas
else
	docker exec gs51 rm -rf /tmp/hw-schemas
	docker cp schemas gs51:/tmp/hw-schemas
	docker exec gs51 glib-compile-schemas --strict --dry-run /tmp/hw-schemas
fi
echo "schema: ok"
