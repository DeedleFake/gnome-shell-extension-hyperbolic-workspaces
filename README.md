# Hyperbolic Workspaces

A GNOME Shell 51 extension that lays out workspaces on a {4,5} hyperbolic plane in the Overview. Each tile is a workspace and shows GNOME's own window previews.

The extension is in progress. The [web demo](https://deedlefake.github.io/gnome-shell-extension-hyperbolic-workspaces/) on the `prototype` branch shows the intended behavior.

## Run the checks

- `sh tools/check.sh` runs `node --check` on every `.js` file and compiles the schema with `glib-compile-schemas --strict --dry-run`. It uses the `gs51` container when the host has no `glib-compile-schemas`.
- `node --test test/*.test.js` runs the pure-core tests under node.
- `gjs -m test/run-gjs.js` runs the same tests under GJS.
