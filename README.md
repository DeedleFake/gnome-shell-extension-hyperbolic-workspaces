# Hyperbolic Workspaces

A GNOME Shell 51 extension that lays out workspaces on a {4,5} hyperbolic plane in the Overview. Each tile is a workspace and shows GNOME's own window previews.

The extension is in progress. The [web demo](https://deedlefake.github.io/gnome-shell-extension-hyperbolic-workspaces/) on the `prototype` branch shows the intended behavior.

## Install

The extension supports GNOME Shell 51 only. Install it from source.

1. Clone the repository and enter it:

   ```sh
   git clone https://github.com/DeedleFake/gnome-shell-extension-hyperbolic-workspaces.git
   cd gnome-shell-extension-hyperbolic-workspaces
   ```

2. Copy the extension into your extensions directory. The directory name must be the extension's UUID, `hyperbolic-workspaces@deedlefake.github.io`:

   ```sh
   mkdir -p ~/.local/share/gnome-shell/extensions/hyperbolic-workspaces@deedlefake.github.io
   cp -r src/. metadata.json schemas ~/.local/share/gnome-shell/extensions/hyperbolic-workspaces@deedlefake.github.io/
   ```

3. Compile the settings schema:

   ```sh
   glib-compile-schemas ~/.local/share/gnome-shell/extensions/hyperbolic-workspaces@deedlefake.github.io/schemas
   ```

4. Log out and log back in. On Wayland, GNOME Shell finds new extensions only when it starts.

5. Enable the extension:

   ```sh
   gnome-extensions enable hyperbolic-workspaces@deedlefake.github.io
   ```

6. Check that it loaded:

   ```sh
   gnome-extensions info hyperbolic-workspaces@deedlefake.github.io
   ```

   The output shows `State: ACTIVE` when the extension is running.

To update, run `git pull`, repeat steps 2 and 3, and log out and back in.

## Run the checks

- `sh tools/check.sh` runs `node --check` on every `.js` file and compiles the schema with `glib-compile-schemas --strict --dry-run`. It uses the `gs51` container when the host has no `glib-compile-schemas`.
- `node --test test/*.test.js` runs the pure-core tests under node.
- `gjs -m test/run-gjs.js` runs the same tests under GJS.

## Keys in the Overview

- The arrow keys move the focus to the neighboring workspace in that direction.
- PgUp and PgDn move the focus to the previous and next workspace in GNOME's order.
- Home and End move the focus to the first and last workspace in that order.
- When you pan away from your workspaces, an arrow on the rim points back to them. Click it to return.
- Enter, Escape and typing to search work as they do in GNOME.

## Settings

Open the extension's preferences to change them. Every setting below has a row there.

- **Focused tile size** (`focused-tile-size`, 1 to 2.5, default 1) grows the focused tile and shrinks the rest. The plane is drawn with straight edges. At 1 each tile's corners sit where the Poincaré disk puts them. At 2 the drawing is exactly the Klein model. From 1.8 up, the neighbor tiles are too small to read, so only the focused workspace's windows can be clicked. The reset button returns it to 1. A change applies the next time the Overview opens.
- **Move modifier** (`move-modifier`, default Super) turns a drag into a workspace move.
- **PgUp/PgDn activate** (`page-keys-activate`, default off) makes PgUp, PgDn, Home and End switch workspaces like GNOME instead of only moving the focus.

Curved Poincaré edges are not offered yet. They need a shader, and a shader moves pixels without moving where Clutter detects clicks.
