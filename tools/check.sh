#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
n=0
for f in $(git ls-files --cached --others --exclude-standard '*.js'); do node --check "$f"; n=$((n + 1)); done
echo "node --check: $n files ok"

# Prints every key's default and range, as read from a compiled schema directory.
dump() {
	for k in $(gsettings --schemadir "$1" list-keys "$SCHEMA" | sort); do
		echo "$k $(gsettings --schemadir "$1" get "$SCHEMA" "$k") $(gsettings --schemadir "$1" range "$SCHEMA" "$k" | tr '\n' ' ')"
	done
}
schema_check() {
	SCHEMA=org.gnome.shell.extensions.hyperbolic-workspaces
	glib-compile-schemas --strict --dry-run schemas
	fresh=$(mktemp -d)
	cp schemas/*.gschema.xml "$fresh"
	glib-compile-schemas --strict "$fresh"
	# The committed gschemas.compiled lets a clone load without a compile step, so it must match the XML.
	[ "$(dump schemas)" = "$(dump "$fresh")" ] || { echo "schemas/gschemas.compiled is stale: run glib-compile-schemas schemas" >&2; exit 1; }
	rm -rf "$fresh"
}
if command -v glib-compile-schemas >/dev/null; then
	schema_check
else
	C=${CHECK_CONTAINER:-gs51}
	docker exec "$C" rm -rf /tmp/hw-check
	docker exec "$C" mkdir -p /tmp/hw-check
	tar -cf - schemas | docker exec -i "$C" tar -xf - -C /tmp/hw-check
	docker exec -e SCRIPT="$(sed -n '/^dump()/,/^}/p;/^schema_check()/,/^}/p' "$0")" -w /tmp/hw-check "$C" sh -c 'eval "$SCRIPT"; set -eu; schema_check'
fi
echo "schema: ok"
