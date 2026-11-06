# Hyperbolic Workspaces

A GNOME Shell 51 extension that lays out workspaces on a {4,5} hyperbolic plane in the Overview. Each tile is a workspace and shows GNOME's own window previews.

The extension is in progress. The [web demo](https://deedlefake.github.io/gnome-shell-extension-hyperbolic-workspaces/) on the `prototype` branch shows the intended behavior.

## Install

The extension supports GNOME Shell 51 only. Install it from source. The repository is the extension directory, so you can clone it straight into place. The directory name must be the extension's UUID, `hyperbolic-workspaces@deedles.dev`.

1. Clone the repository into your extensions directory:

   ```sh
   mkdir -p ~/.local/share/gnome-shell/extensions
   git clone https://github.com/DeedleFake/gnome-shell-extension-hyperbolic-workspaces.git ~/.local/share/gnome-shell/extensions/hyperbolic-workspaces@deedles.dev
   ```

   If you already have a checkout somewhere else, link it into place instead. Run this from the checkout:

   ```sh
   mkdir -p ~/.local/share/gnome-shell/extensions
   ln -sfn "$PWD" ~/.local/share/gnome-shell/extensions/hyperbolic-workspaces@deedles.dev
   ```

   The repository includes the compiled settings schema, so no compile step is needed. GNOME Shell loads only `metadata.json`, the modules, and `schemas/` from the directory. It ignores the tests, tools and other files.

2. Log out and log back in. On Wayland, GNOME Shell finds new extensions only when it starts.

3. Enable the extension:

   ```sh
   gnome-extensions enable hyperbolic-workspaces@deedles.dev
   ```

4. Check that it loaded:

   ```sh
   gnome-extensions info hyperbolic-workspaces@deedles.dev
   ```

   The output shows `State: ACTIVE` when the extension is running.

To update, run `git pull` in the clone or checkout, then log out and back in.

## Run the checks

- `sh tools/check.sh` runs `node --check` on every `.js` file, checks the schema with `glib-compile-schemas --strict`, and fails if `schemas/gschemas.compiled` no longer matches the XML. After you edit the schema XML, run `glib-compile-schemas schemas` and commit the result. Without `glib-compile-schemas` on the host, the script runs the schema check in the container named by `CHECK_CONTAINER`, `gs51` by default.
- `node --test test/*.test.js` runs the pure-core tests under node.
- `gjs -m test/run-gjs.js` runs the same tests under GJS.

## Keys in the Overview

- The arrow keys switch to the neighboring workspace in that direction, as in stock GNOME.
- PgUp and PgDn switch to the previous and next workspace in GNOME's order.
- Home and End switch to the first and last workspace in that order.
- When you pan away from your workspaces, an arrow on the rim points back to them. Click it to return.
- Enter, Escape and typing to search work as they do in GNOME.

## Settings

Open the extension's preferences to change them. Every setting below has a row there.

- **Focused tile size** (`focused-tile-size`, 1 to 2.5, default 1) grows the focused tile and shrinks the rest. The plane is drawn with straight edges. At 1 each tile's corners sit where the Poincaré disk puts them. At 2 the drawing is exactly the Klein model. From 1.8 up, the neighbor tiles are too small to read, so only the focused workspace's windows can be clicked. The reset button returns it to 1. A change applies the next time the Overview opens.
- **Move modifier** (`move-modifier`, default Super) turns a drag into a workspace move.

Curved Poincaré edges are not offered yet. They need a shader, and a shader moves pixels without moving where Clutter detects clicks.
