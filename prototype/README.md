Throwaway browser prototype of the {4,5} hyperbolic workspace layout. No build step or server: run `xdg-open prototype/index.html` from the repo root.
Drag pans, shift-drag or the wheel rotates, clicking a workspace goes to it, and clicking an empty tile creates a workspace there. Ctrl+arrows move to a neighbor tile, PgUp/PgDn walk the list, A adds and X removes the focused workspace.
The side panel switches fill order, removal policy, orientation and settle behavior; `node prototype/scenarios.js` and `node prototype/backtrack.js` print the numbers in `results.txt`.
