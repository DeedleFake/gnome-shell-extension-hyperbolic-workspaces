---
name: formal-verify-overview-flow
description: Model-check every step a user can take in the Hyperbolic Workspaces Overview (open, close, arrows, page keys, tile and window clicks, window drags, workspace moves, panning, the rim arrow, search) against the design rules, with TLA+ and TLC. Use when a change touches shell/planeView.js, shell/overviewHook.js, shell/windowMoves.js, core/view.js, core/gesture.js, core/plane.js or disk/fitted.js, or when you need to know whether the Overview still does what the design says.
---

# Formal verification of the Overview flow

The Overview on the primary monitor is a state machine. The user opens it, moves the focus, clicks, drags and closes it, and each step changes which workspace is focused, which one is active, and which tiles hold workspaces. A wrong step sends the user to the wrong workspace or loses their place, and the container scripts in `verify-hyperbolic-workspaces` only test the orders someone thought to write.

`model/OverviewFlow.tla` models each user step as one atomic step and checks every order of steps from the `hw scene` start, for both values of `focused-tile-size >= 1.8` and of `page-keys-activate`. TLC is the checker because the question is "can some order of steps break a rule", which a model checker answers for every order in the bound.

## Run

```sh
.cursor/skills/formal-verify-overview-flow/scripts/check-overview-flow            # decided rules and known findings
.cursor/skills/formal-verify-overview-flow/scripts/check-overview-flow --pending  # also any rules waiting on a design call (none today)
.cursor/skills/formal-verify-overview-flow/scripts/check-overview-flow --only WindowDrops
```

It needs Java 11 or newer and perl. It downloads `tla2tools.jar` 1.7.4 once, checks its sha256, and caches it under `~/.cache/hyperbolic-workspaces/`. The pin is 1.7.4 because the v1.8.0 release asset is rebuilt in place, so its checksum changes. A full run explores about 480,000 distinct states and took 18 seconds on 8 cores. Output goes to `out/` in this directory, which git ignores: `decided.out` is TLC's output, and `*.cfg` are the configs the run wrote.

The script first prints the code facts. Each fact is a model CONSTANT that the script reads from the source on every run. TRUE means the code still does that step. FALSE means the code no longer does it, and the model drops that part of the step, so the check shows which rule breaks. Then the script checks that the steps the model takes as given still match the code, and prints `MODEL STALE` and exits 2 when one does not.

Results:

- `PASS decided`: every decided rule holds in the model of this code.
- `FAIL <Rule>`: a decided rule breaks. Exit 1. The counterexample is in `out/decided.out`.
- `KNOWN <Rule>`: a rule in the Findings below still breaks, as expected.
- `FIXED? <Rule>`: a known finding now holds. Exit 1 until you confirm the fix and update this file.
- `BREAKS` or `HOLDS` (with `--pending`): a rule waiting on a design call. These never fail the run. The list is empty today.
- `covered code changed since sync commit`: see Keeping in step.

Read every result with the `/statechart` skill. Give it `out/OverviewFlow.tla`, the `out/*.cfg` of the run, and `model/view.ts` as the view. It tells each counterexample as the shortest path of user steps in plain words. The model has more states than its chart budget, so it shows only the paths to the rules that break.

## Rules

R numbers are the rule numbers of the design recall (`decided` means the user decided it, `code only` means only the code says so and the user has not decided it, `finding` means the user decided it and `master` breaks it). A state rule is a TLC INVARIANT. A step rule is a PROPERTY `[][Step]_vars` that reads the state before and after the step.

| Rule | R | Kind | What must be true |
| --- | --- | --- | --- |
| `OpeningFocusesActive` | 1 | decided | Opening the Overview focuses the active workspace. |
| `ClosingEntersFocused` | 2, 31, 32 | decided | Escape outside search, Super, any other close, or a click on the focused tile enters the focused tile, a blank one included. |
| `SearchPickWins` | 3 | decided | Picking a search result on another workspace, or on the focused tile, leaves with that workspace active. |
| `ActiveSearchPickWins` | 3 | finding F1 | Same, for a result on the active workspace while the focus is on another tile. |
| `WindowClickLeaves` | 17 | decided | A click on a window preview in reach leaves with its workspace active, when the window is on another workspace or on the focused tile. |
| `ActiveWindowClickLeaves` | 17 | finding F1 | Same, for a window on the active workspace while the focus is on another tile. |
| `NearClickFocuses` | 4, 16 | decided | A click on a neighbor tile focuses it and changes nothing else. |
| `FarClickFocuses` | 18 | finding F2 | A click on a tile farther out than reach, or on a window there, focuses that tile and does not leave. |
| `CutoffNeighborClickFocuses` | 19 | decided | From size 1.8, a click on a neighbor's window focuses that tile and does not leave. |
| `ArrowMovesToNeighbor` | 8 | decided | An arrow moves the focus to a neighbor and changes nothing else. |
| `PageKeysActivateSetting` | 13 | decided | With `page-keys-activate` on, the page keys also switch workspace. Off, they only move focus. The Overview stays open. |
| `PageKeysFollowGnomeOrder` | 11, 12 | decided | Home and End go to the first and last workspace in GNOME's order, and Page Up and Down step through it. An empty workspace you are on is in that order until GNOME removes it. |
| `ModifiedKeysIgnored` | 15 | code only | A plane key with Ctrl, Alt, Shift or Super held changes nothing. |
| `WindowDrops` | 21, 22 | decided | A window dragged inside reach and dropped on another reachable workspace joins it. On a blank reachable tile it opens a new workspace. Anywhere else nothing changes. A drag outside reach pans. |
| `WorkspaceMoves` | 23, 24 | decided | A modifier-drag puts a workspace other than the active one on the tile it is dropped on. |
| `DropOutsideCancels` | 26 | code only | A workspace dropped outside the disk changes nothing. |
| `ActiveWorkspaceMoves` | 27 | finding F3 | A modifier-drag moves the active workspace to the tile it is dropped on, like any other workspace. |
| `RimReturnsToGroup` | 28 | decided | The rim arrow focuses a workspace in the group. |
| `PanReleaseFocusesNearest` | 30 | decided | Releasing a pan focuses the tile nearest the center and changes nothing else. |
| `EmptyHopKeepsWorkspace` | 33 | decided | Entering a blank tile from an empty active workspace moves that workspace there. |
| `OneEmptyWorkspace` | 33 | decided | At most one workspace on the plane has no windows. |
| `EscapeClearsSearchFirst` | 34 | decided | Escape in search clears the search and keeps the Overview open. |
| `ActiveOnPlane` | none | invariant | The active workspace is always on the plane. |
| `TypeOK` | none | invariant | Every variable has a value of the expected type. |

### Design calls

The user answered O1 to O5 on 2026-11-04.

- O1. A far-tile click focuses the tile. Checked by `FarClickFocuses`, finding F2.
- O2. The page keys follow GNOME's normal order, with no timing of their own. An empty workspace you are on stays in the order until GNOME removes it after its usual short delay. Checked by `PageKeysFollowGnomeOrder`, which `master` holds.
- O3. The three-way arrow-key setting is dropped by the user. Nothing to model.
- O4. The active workspace must be draggable like any other. Checked by `ActiveWorkspaceMoves`, finding F3.
- O5. Releasing a pan focuses the tile nearest the center. Checked by `PanReleaseFocusesNearest`.
- O6. Still open: what happens on other monitors with "workspaces on primary display only" off. Out of the model's scope until the user answers.

## Findings

F1. Clicking a window, or picking a search result, on the active workspace while the focus is on another tile closes the Overview on the focused tile, not on the window's workspace. Rules 3 and 17 break (`ActiveSearchPickWins`, `ActiveWindowClickLeaves`). GNOME's `Main.activateWindow` switches workspace only when the window is on another one, so no `active-workspace-changed` fires, the focus does not follow, and `prepareToLeaveOverview` then enters the focused tile. When that tile is blank, it opens a new empty workspace there.

Shortest path in the model: open the Overview, press an arrow to a neighbor, drag that neighbor's only window onto the active workspace, click that window. Replayed against `1c5ef4e` in the container with a shorter path: switch to Alpha's workspace, open the Overview, press Right (the focus moves to a blank tile), click Alpha's preview. The Overview closed on a new empty workspace 4 and no window had focus. The search-result case follows the same code path and was not replayed.

F2. A click on a tile farther out than reach does nothing. Rule 18 breaks (`FarClickFocuses`). `ViewState.click` returns `'ignored'` for any tile outside `reach()` (`core/view.js:226`). Shortest path in the model: open the Overview, press an arrow, click a tile two steps from the new focus. Not replayed in the container, because the guard is a plain early return.

F3. A modifier-drag of the active workspace does nothing. Rule 27 breaks (`ActiveWorkspaceMoves`). `Plane.planDrag` returns an empty plan when `key === this._active` (`core/plane.js:91`). Shortest path in the model: open the Overview, modifier-drag the active workspace E onto A's tile. Not replayed in the container, for the same reason. The model's move is abstract, so removing the guard makes the rule hold in the model, but the real slide-back with the active workspace is unchecked (see Scope).

## Scope

Verified: every order of the steps above, from the `hw scene` start (an empty active workspace E between A and B, one window each), with up to four workspaces and two windows, for both values of each setting.

The model abstracts these, so a pass says nothing about them:

- Geometry. Six tiles in a row stand for the {4,5} tiling, and reach is a tile and its two neighbors. The real reach is the tile plus edge and corner neighbors (13 tiles). Which neighbor an arrow picks, which tile a pan ends on, and the group's center are free choices in the model.
- Workspace moves. The dropped workspace takes the tile, the active one included, and whatever was there takes its old tile. The real insert, slide-back and "no holes" rules (24, 25, 38) are `test/plane.test.js`'s job. The hover preview (25) is not modeled.
- The `Plane.sync` that GNOME's signals trigger runs in a GLib idle, and GNOME removes an empty workspace after a short delay. The model folds both into the step that caused them, so the page keys see the order GNOME has at that moment.
- Windows only move by drag. Opening or closing windows, other monitors (35, 36), touch, the preferences window (37), drawing (29), Tab and Return on previews (20), and the stock GNOME keys (5, 7) are left out.
- GNOME's own code (`Main.activateWindow`, the Escape order in search, dynamic workspaces) is modeled from GNOME 51.1's behavior, not read on each run.

## Coverage record

Sync commit: `1c5ef4e` (the code at this commit was checked against the model).

- `shell/planeView.js`: `_init` (open, `active-workspace-changed`), `vfunc_allocate` (window reach), `handleKey`, `vfunc_captured_event`, `_apply`, `_enter`, `_workspaceOn`, `_dropTile`, `_activate`, `prepareToLeaveOverview`.
- `shell/overviewHook.js`: `PlaneWorkspace._shouldLeaveOverview`, `_updateWorkspacesViews`.
- `shell/windowMoves.js`: `openOn`, `dropOn`.
- `core/view.js`: `reach`, `nav`, `focusKey`, `recenter`, `click`, `panEnd`.
- `core/gesture.js`: `handle` (click, cancelCarry).
- `core/plane.js`: `sync` (live set, removal), `planDrag` (refusals), `_commit` (seated order).
- `disk/fitted.js`: `CLICK_CUTOFF`.

## Real bug or modeling error

When a decided rule fails:

1. Read the path with `/statechart` and map each step to the code with the comments in `model/OverviewFlow.tla`.
2. Replay the path in the container with the `verify-hyperbolic-workspaces` skill, one user step per model step. Use `hw probe-plane`, `hw workspaces` and a screenshot after each step.
3. If the container shows the same result, it is a real bug. Report it with the path in user steps. Do not weaken the rule or the model to make it pass, and do not change product code unless asked.
4. If the container does not show it, assume the model is wrong. Find the step that differs, fix the model or a code fact, and rerun.

## Keeping in step

- An intended behavior change: change the step in the model, then the fact regex in the script if the code text changed, and the rule only if the user changed the design. Show the new rule failing on a scratch break before you commit.
- A `MODEL STALE` line: the code text a step depends on moved or changed. Read the new code, and update the regex or the model step.
- A rule that the user decides (O6, or a code-only rule): move it to the decided list or to KNOWN in the script, and update the tables.
- A `FIXED?` line: confirm the fix in the container, then move the rule from KNOWN to RULES in the script and from Findings to decided here.
- Move the sync commit forward only after you confirm that the model describes the code at the new commit.

For a full pass after changes that did not recheck this, use `/maintain-formal-verification-skill`.

## Proof that the check can fail

Each decided rule was seen to fail on a scratch edit of the real code, which was then reverted. `TypeOK` has no code to break. Each known finding was seen to turn `FIXED?` when its guard was removed.

| Rule | Scratch edit |
| --- | --- |
| `OpeningFocusesActive` | delete `config.view.focusKey(this._activated);` from `PlaneView._init` |
| `ClosingEntersFocused` | `if (false) this._activate(ws);` in `prepareToLeaveOverview` |
| `SearchPickWins` | delete `focusKey` from the `active-workspace-changed` handler |
| `WindowClickLeaves` | `PlaneWorkspace._shouldLeaveOverview` returns `false` |
| `NearClickFocuses` | delete `this._goTo(tile);` from `ViewState.click` |
| `FarClickFocuses` | 18 | finding F2 | A click on a tile farther out than reach, or on a window there, focuses that tile and does not leave. |
| `CutoffNeighborClickFocuses` | compare `d.size >= 99` for the window reach |
| `ArrowMovesToNeighbor` | `this._goTo(from);` at the end of `nav` |
| `PageKeysActivateSetting` | `&& false` in place of `&& f.kind === 'ws'` in `handleKey` |
| `PageKeysFollowGnomeOrder` | swap the `pageDown` step sign in `nav` |
| `ModifiedKeysIgnored` | `if (!nav)` in `handleKey` |
| `WindowDrops` | drop `|| !this._reach.has(tile)` in `_dropTile` |
| `WorkspaceMoves` | remove the `view.drop(...)` call in `_apply` |
| `DropOutsideCancels` | both guards: `ph.hover === undefined` in `GestureMachine.handle` and no `!this._T.tiles[tile]` in `planDrag` |
| `RimReturnsToGroup` | `recenter` goes to `this._view.root` |
| `PanReleaseFocusesNearest` | delete `this._goTo(this._view.root);` from `panEnd` |
| `EmptyHopKeepsWorkspace` | `if (false) {` in `openOn` |
| `OneEmptyWorkspace` | `continue;` without the `live.has(k)` test in `Plane.sync` |
| `EscapeClearsSearchFirst` | add `[Clutter.KEY_Escape]` to `NAV` |
| `ActiveOnPlane` | drop `k === snap.active ||` from the live set in `Plane.sync` |
| `FarClickFocuses` (F2) | delete `if (!this.reach().has(tile)) return 'ignored';` from `click`: `FIXED?` |
| `ActiveWorkspaceMoves` (F3) | drop `key === this._active ||` from `planDrag`: `FIXED?` |
