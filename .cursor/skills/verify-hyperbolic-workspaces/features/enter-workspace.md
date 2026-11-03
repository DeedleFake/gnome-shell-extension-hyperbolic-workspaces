# Entering a workspace

Clicking a tile that is not focused focuses it. Clicking the focused tile enters it, which activates that workspace and closes the Overview. Closing the Overview any other way (Escape, Super, a swipe) also enters the focused tile, opening a workspace there if it has none, as a click does, unless a window or search result was activated, which wins as in GNOME. Clicking a window preview activates that window, as in GNOME. Clicking an empty tile next to the group opens a new workspace there.

## Sub-features

- `enter-focus-click` focuses an unfocused tile with one click.
- `enter-focused-click` enters the focused tile with a click and closes the Overview.
- `enter-window-click` activates a window from its preview and switches to its workspace.
- `enter-on-close` enters the focused workspace on every close; `scripts/prove-close-enters.sh` checks Escape, Super and a plain hide, on a workspace and on a tile with no workspace, and a window activation.
- `enter-empty-tile` turns a click on an empty interactable tile into a new workspace.
- `enter-lone-tile` lands on a blank tile that touches only the empty workspace being left. The empty workspace moves onto that tile instead of GNOME keeping a second empty one, and the group slides over to touch it, keeping its shape. `scripts/prove-empty-hop.sh` checks a click and Escape, that GNOME lists one empty workspace, and that Super+PgUp then goes to Delta, and `hw lone-tile-point` finds such a tile.

## How to get to it (user POV)

- Open the Overview and click a tile or a window preview.

## Driving it with hw

Preconditions:

- Baseline from the README, with `hw overview show`.

- **Window click.** Run `hw click $(hw preview-center Alpha | tr -dc '0-9 ')`. `hw eval Main.overview.visible` reads `false`, and `hw workspaces` shows the active index of Alpha's workspace. In this container `global.display.focus_window` read `undefined` right after the click, so prove the switch with `hw workspaces`, not the focus window.
- **Focus then enter.** Reopen the Overview. Click on Beta's tile outside its preview, in tile border space. `hw probe-plane` focus becomes Beta, and the Overview stays open. Click the same point again. The Overview closes, and the active workspace holds Beta.
- **Proof.** Capture `hw shot` before each click and after it.

## Gotchas

- From `focused-tile-size` 1.8 up, neighbor previews do not take clicks. Run these at the default size.
- `Return` does nothing in the Overview outside search, as in stock GNOME 51, which binds no Return action there.
- Focusing a tile slides it to the middle of the disk, so a second click must go where it is drawn now. `hw empty-tile-point` returns the focused tile when it is empty.
- Compare workspaces by title, not index: dynamic workspaces remove the empty workspace you leave, so indices shift.
- Entering a blank tile from an empty workspace moves that workspace, so the active index does not change. Start from a workspace with windows to see a new one open.
- Picking right after the Overview opens can miss actors that have not painted yet. Wait about a second after `overview show`.
