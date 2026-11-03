# Workspace move with modifier

Holding the move modifier (Super by default) while dragging a tile carries that workspace to another tile. A drop on an occupied tile inserts by drag direction. The group stays connected, and cut-off pieces slide back without turning. A workspace you have entered is never moved.

## Sub-features

- `move-carry` makes the carried tile follow the pointer while Super is held.
- `move-drop-empty` puts the workspace on the empty tile under the drop.
- `move-insert` shifts the occupied tiles away from the drag direction when the drop lands on an occupied tile.
- `move-modifier-setting` uses `move-modifier` (`super`, `shift`, `control`, `alt`) as the modifier.

## How to get to it (user POV)

- In the Overview, hold Super and drag a tile or one of its window previews to another tile.

## Driving it with hw

Preconditions:

- Baseline from the README. Run `hw overview show` and record `hw probe-plane` as the before state.

- **Find the tiles.** `hw preview-center Alpha` prints the source point. Take the target point from a second `preview-center` or from `hw shot`.
- **Carry and drop.** Run `hw drag X1 Y1 X2 Y2 Super_L`. Run `hw probe-plane` again. The carried workspace's titles now sit under a different tile id, and every other workspace is still adjacent to the group.
- **Plain drag is a pan.** Repeat without `Super_L`. The tile ids map to the same titles as before, and only the screenshot moved.
- **Other modifier.** Run `hw gset set org.gnome.shell.extensions.hyperbolic-workspaces move-modifier alt`, reopen the Overview, and drag with `Alt_L`. The workspace moves. Super no longer moves it. Reset the key afterward.

## Gotchas

- Keep the modifier down for the whole drag. `hw drag` holds it from press to release.
- A drop outside the disk cancels the carry, and `probe-plane` stays unchanged.
- The active workspace (the one you entered) refuses to move, by design.
- No preferences UI exists for `move-modifier` yet, so only GSettings can change it.
