# Overview plane and panning

Opening the Overview shows a disk tiled with {4,5} squares in place of GNOME's workspace strip. Every workspace that holds windows sits on a tile with GNOME's own window previews. A plain drag on the disk pans the plane.

## Sub-features

- `plane-shown` replaces the workspace strip with the disk, with one tile per workspace.
- `plane-previews` shows GNOME window previews inside their workspace's tile.
- `plane-pan` moves every tile together while a plain drag on empty disk space continues.
- `plane-rim` draws a rim arrow back to the group when panning moves it off center. Clicking the arrow brings the group home.
- `plane-kept` keeps the layout across a disable and enable in the same shell process (`shell/layoutStore.js`). A restart or logout starts a new layout.
- `plane-touch` pans and taps with touch as with the primary button. The container has no touch device, so this stays unverified here.

## How to get to it (user POV)

- Press Super, or click Activities.
- Drag with the primary button on the disk, but not on a window preview.

## Driving it with hw

Preconditions:

- Baseline from the README, Overview closed.

- **Open.** Run `hw overview show`. It prints `(true, 'true')`. `hw probe-plane` lists tiles `0` (empty) and `1` to `4` holding Alpha, Delta, Gamma and Beta. Capture `hw shot plane-open`.
- **Previews.** `hw probe-clicks` lists Alpha, Beta, Delta and Gamma under `clickable`, which proves their previews are mapped and reachable at the default size.
- **Pan.** Run `hw drag 640 400 640 520` (empty space at the disk center at 1280x800). Run `hw shot plane-panned` and compare it with `plane-open`. The tiles have moved down together, and none has moved relative to another. On release the plane focuses the tile nearest the center, so `probe-plane` focus can change.
- **Rim.** From a fresh baseline Overview, run `hw drag $(hw empty-tile-point | tr -dc '0-9 ') 640 700`. The group leaves the screen, and a rim arrow appears. Read the arrow position from `hw shot` (screenshots are scaled; multiply by 1.25 for stage pixels) and click it. `hw probe-plane` focus returns to tile 0.
- **Kept layout.** Record `hw probe-plane`, close the Overview, run `gnome-extensions disable` and then `enable` for the UUID inside the container, and reopen the Overview. `hw probe-plane` shows the same tile ids holding the same titles.

## Gotchas

- The `Escape`, `Return` and type-to-search keys stay GNOME's. Pressing them does not prove anything about the plane.
- A press on a window preview belongs to GNOME (click activates, drag moves the window). Start pans on empty disk space. After one pan, `640 400` can sit on a preview, and a second drag from there moves that window to another workspace.
- Rendering is software only, so frame pacing here tells you nothing about real hardware.
- `tiles` in `probe-plane` is keyed by tile id. The ids depend on the order workspaces appeared in, not their GNOME index.
