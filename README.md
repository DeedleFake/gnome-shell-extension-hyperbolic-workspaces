# Hyperbolic Workspaces

A GNOME Shell 51 extension that lays out workspaces on a {4,5} hyperbolic plane in the Overview. Each tile is a workspace and shows GNOME's own window previews.

The extension is in progress. The [web demo](https://deedlefake.github.io/gnome-shell-extension-hyperbolic-workspaces/) on the `prototype` branch shows the intended behavior.

## Run the checks

- `sh tools/check.sh` runs `node --check` on every `.js` file and compiles the schema with `glib-compile-schemas --strict --dry-run`. It uses the `gs51` container when the host has no `glib-compile-schemas`.
- `node --test test/*.test.js` runs the pure-core tests under node.
- `gjs -m test/run-gjs.js` runs the same tests under GJS.

## Settings

Open the extension's preferences to change them.

- **Focused tile size** (`focused-tile-size`, 1 to 2.5, default 1) grows the focused tile and shrinks the rest. The plane is drawn with straight edges. At 1 each tile's corners sit where the Poincaré disk puts them. At 2 the drawing is exactly the Klein model. From 1.8 up, the neighbor tiles are too small to read, so only the focused workspace's windows can be clicked. The reset button returns it to 1. A change applies the next time the Overview opens.
- **Move modifier** (`move-modifier`, default Super) turns a drag into a workspace move.
- **PgUp/PgDn activate** (`page-keys-activate`, default off) makes PgUp, PgDn and End switch workspaces like GNOME instead of only moving the focus.

Curved Poincaré edges are not offered yet. They need a shader, and a shader moves pixels without moving where Clutter detects clicks.
