# Hyperbolic Workspaces verification map

This directory is the maintained source for verifying what a user of the extension sees. Read the index, then use the matching feature file as the recipe. `hw` means `.cursor/skills/verify-hyperbolic-workspaces/scripts/hw`.

## Baseline preconditions

- Run `hw up` with your own `HW_INSTANCE`, then `hw doctor`. Require extension state `1` and `installed src matches checkout`.
- Run `hw scene`. Workspace 0 is empty and active, and Alpha, Beta, Gamma and Delta each sit alone on workspaces 1 to 4.
- `focused-tile-size` is at its default of `1.0` (`hw gget focused-tile-size`).
- Never drive `gs51` or any instance this run did not start.

## Driving conventions

- Find windows by title, settings by GSettings key, and prefs widgets by AT-SPI role and name. Stage coordinates are a last resort, and only after reading the actor's transformed extents through `hw eval`.
- The Overview reads settings when it opens. Close and reopen it after changing a setting.
- Restore any setting you changed (`hw gset reset org.gnome.shell.extensions.hyperbolic-workspaces KEY`).

## Proof and skip reporting

- Each check pairs a user action with a screenshot and a second read of state (`gget`, `probe-clicks`, `workspaces`).
- Name the entry point you drove. Do not report a path you skipped as verified through a different one.
- Report a missing precondition as a failure with the command you tried.

## Feature entry contract

Each feature file has an H1 title and a paragraph describing the behavior, then four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with hw`, `Gotchas`.

## Features

- [Overview plane and panning](./overview-plane.md) covers the disk replacing GNOME's workspace strip, drag-to-pan, the rim arrow, and the layout kept across disable.
- [Focus and keys](./focus-keys.md) covers arrow, PgUp/PgDn, Home and End focus movement and the shortcuts GNOME keeps.
- [Workspace move with modifier](./workspace-move.md) covers modifier-drag to move a workspace, insert-by-direction, and dragging a window to another tile.
- [Entering a workspace](./enter-workspace.md) covers clicking a tile or a window preview to leave the Overview there.
- [Focused tile size and click cutoff](./focused-tile-size.md) covers how the setting changes the drawing and which windows take clicks.
- [Preferences page](./preferences.md) covers the slider, keyboard and AT-SPI entry, reset, and the keys and dragging group. Proven end to end by `scripts/prove-prefs.sh`.
