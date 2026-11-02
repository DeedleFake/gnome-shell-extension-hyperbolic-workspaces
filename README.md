Browser prototype of the {4,5} hyperbolic workspace layout. No build step or server: run `xdg-open index.html` from the repo root.

Live demo: https://deedlefake.github.io/gnome-shell-extension-hyperbolic-workspaces/

Every tile is a workspace. The colored ones have windows and form one connected group; the rest are empty and look like the bare grid.

Controls:
- Click any tile to center it. Click the centered one to enter it, empty or not.
- Drag to pan, even when the drag starts on a workspace. Right-drag or the wheel rotates.
- Hold the move key and drag a workspace to move it. The move key is Shift by default; the side panel switches it to Alt, Ctrl or Ctrl+Alt. Meta is left out because the browser and desktop take it. While you hover, the plane previews the result. Drop it on any empty tile; if that tile doesn't touch the group, it lands there and then slides back to the nearest tile that does. Drop it on another workspace to insert it there: that workspace, and any in a straight line behind it, move one tile on in the direction you came from, up to the first empty tile.
- Arrows move to a neighbor tile. PgUp/PgDn walk the workspaces with windows. Home or "Back to center" returns to the center tile, upright. A small ring marks it.
- When the group gets too small to make out (its largest workspace below about four rings' size, where windows stop being drawn), a yellow arrow fades in outside the disk's edge, pointing the way to the center tile. Clicking it goes back to the center. It fades out again by the time the group is three rings' size.
- O opens a window on the focused tile, C closes one, X closes all of them, Enter enters it. The first window on a tile away from the group slides that workspace over to the group, and the view follows it.

Stay connected: whenever closing a workspace's last window or moving a workspace splits the group, the biggest piece stays put and each smaller piece slides over, keeping its shape, until it touches the group again. Nothing else moves.

The center follows the group. After any open, close or drop, if the center tile has no windows but some tile does, the center moves to the nearest tile with windows by edge steps; ties go to the oldest workspace. With no windows anywhere it stays put. Home, first-window placement and the split tie-break all use the current center.

The side panel switches the arrow key behavior, orientation, pan snapping and the move key. The defaults are "Always visual direction" for the arrow keys and "Upright after move" for orientation.
`node sim.js [ops] [seed]` runs random open/close/drag churn and checks that the group stays connected and that nothing moves except the insert chain, a newly opened far workspace, and cut-off pieces, each as the image of its own tiles under one orientation-preserving tiling symmetry, with a one-tile slide taken whenever one reconnects a two-piece split. `node far.js` checks that tiles stay exact far from the center. `node backtrack.js` prints the earlier backtracking numbers. `scenarios.js` measured the old removal policies and only runs at commit ce3f40f. `results.txt` has the output.
