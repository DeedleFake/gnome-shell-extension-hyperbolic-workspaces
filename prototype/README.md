Browser prototype of the {4,5} hyperbolic workspace layout. No build step or server: run `xdg-open prototype/index.html` from the repo root.

Controls:
- Click a workspace to center it. Click the centered one to enter it.
- Drag to pan. Shift-drag or the wheel rotates.
- Press and hold a workspace, then drag it somewhere else. Dropping it on another workspace swaps the two. Dropping it anywhere else settles every workspace back into one compact group.
- Arrows move to a neighbor tile. PgUp/PgDn walk the workspace list. Home or "Back to center" returns to the center workspace, upright.
- O opens a window in the focused workspace, C closes one, X closes all of them, Enter enters it. Like GNOME, a workspace exists while it has windows, and there is always one empty workspace at the end.

The side panel switches the removal policy, the arrow key behavior, orientation and pan snapping.
`node prototype/sim.js` checks every policy for holes under random churn. `node prototype/far.js` checks that tiles stay exact far from the center. `node prototype/scenarios.js` and `node prototype/backtrack.js` print the earlier numbers. `results.txt` has the output.
