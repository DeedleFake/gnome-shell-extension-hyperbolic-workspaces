# Focused tile size and click cutoff

`focused-tile-size` grows the focused tile and shrinks the rest. At 1 the drawing has straight edges with Poincaré corners, and at 2 it is the Klein model. From 1.8 up, only the focused workspace's windows take clicks. The Overview reads the value each time it opens.

## Sub-features

- `size-draw` changes how large the focused tile is drawn.
- `size-cutoff` stops neighbor window previews from taking clicks at 1.8 and above. Clicking a neighbor tile still focuses it.
- `size-next-open` applies a change the next time the Overview opens, not while it is open.

## How to get to it (user POV)

- Move the slider in the extension's preferences ([preferences page](./preferences.md)), then open the Overview.

## Driving it with hw

Preconditions:

- Baseline from the README.

- **Default.** Run `hw overview show` and `hw probe-clicks`. The output is `"size":1` with all four titles under `clickable`. Capture `hw shot size-1`.
- **Above cutoff.** Run `hw overview hide`, then `hw gset set org.gnome.shell.extensions.hyperbolic-workspaces focused-tile-size 2`, then `hw overview show`. `hw probe-clicks` gives `"size":2,"clickable":[]` with all four under `blocked`. The center tile in `hw shot size-2` is visibly larger.
- **Below cutoff.** Repeat with `1.7`. All four are clickable again.
- **Next open only.** With the Overview open, set a new value. `probe-clicks` keeps the old `size` until you run `hw overview hide` and `hw overview show`.
- Reset the key afterward.

## Gotchas

- Setting the key through GSettings proves the Overview side only. A slider claim needs the [preferences journey](./preferences.md).
- Workspace 0 in the baseline is empty, so above the cutoff `clickable` is empty. Focus Alpha (`hw key Right`) first to show that the focused tile's windows stay clickable.
- The schema clamps the value to 1 to 2.5. A `gsettings set` outside that range fails.
