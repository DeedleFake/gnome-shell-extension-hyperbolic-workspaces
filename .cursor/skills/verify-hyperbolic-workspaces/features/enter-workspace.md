# Entering a workspace

Clicking a tile that is not focused focuses it. Clicking the focused tile enters it, which activates that workspace and closes the Overview. Clicking a window preview activates that window, as in GNOME. Clicking an empty tile next to the group opens a new workspace there.

## Sub-features

- `enter-focus-click` focuses an unfocused tile with one click.
- `enter-focused-click` enters the focused tile with a click and closes the Overview.
- `enter-window-click` activates a window from its preview and switches to its workspace.
- `enter-empty-tile` turns a click on an empty interactable tile into a new workspace.

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
- `Return` does not enter the focused workspace yet (see [focus and keys](./focus-keys.md)).
- Picking right after the Overview opens can miss actors that have not painted yet. Wait about a second after `overview show`.
