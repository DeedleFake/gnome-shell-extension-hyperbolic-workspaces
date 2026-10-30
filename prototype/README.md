Browser prototype of the {4,5} hyperbolic workspace layout. No build step or server: run `xdg-open prototype/index.html` from the repo root.

Every tile is a workspace. The colored ones have windows and form one connected group; the rest are empty and look like the bare grid.

Controls:
- Click any tile to center it. Click the centered one to enter it, empty or not.
- Drag to pan, even when the drag starts on a workspace. Right-drag or the wheel rotates.
- Hold the move key and drag a workspace to move it. The move key is Shift by default; the side panel switches it to Alt, Ctrl or Ctrl+Alt. Meta is left out because the browser and desktop take it. While you hover, the plane previews the result. Drop it on any empty tile; if that tile doesn't touch the group, it lands there and then slides back to the nearest tile that does. Drop it on another workspace to insert it there: that workspace, and any in a straight line behind it, move one tile on in the direction you came from, up to the first empty tile.
- Arrows move to a neighbor tile. PgUp/PgDn walk the workspaces with windows. Home or "Back to center" returns to the center tile, the one the first workspace started on, upright.
- O opens a window on the focused tile, C closes one, X closes all of them, Enter enters it. The first window on a tile away from the group slides that workspace over to the group, and the view follows it.

Stay connected: whenever closing a workspace's last window or moving a workspace splits the group, the biggest piece stays put and each smaller piece slides over, keeping its shape, until it touches the group again. Nothing else moves.

The side panel switches the arrow key behavior, orientation, pan snapping and the move key.
`node prototype/sim.js [ops] [seed]` runs random open/close/drag churn and checks that the group stays connected and that nothing moves except the insert chain, a newly opened far workspace, and cut-off pieces, each rigidly. `node prototype/far.js` checks that tiles stay exact far from the center. `node prototype/backtrack.js` prints the earlier backtracking numbers. `scenarios.js` measured the old removal policies and only runs at commit ce3f40f. `results.txt` has the output.
