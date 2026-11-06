---- MODULE OverviewFlow ----
\* Every user step the Overview offers on the primary monitor, as one atomic step each.
\* Each step cites the code it follows. SKILL.md maps each rule to the design decision it checks.
\* The run script reads each CONSTANT from the code: TRUE while the code still does that step,
\* FALSE when it no longer does, and the model then drops that part of the step.
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
    OpenFocusKey,           \* shell/planeView.js _init: focusKey(this._activated)
    SwitchUpdatesActivated, \* shell/planeView.js active-workspace-changed: this._activated = ...
    SwitchMovesFocus,       \* shell/planeView.js active-workspace-changed: focusKey(this._activated)
    RaiseMovesFocus,        \* shell/planeView.js a window's 'raised': focusKey(its workspace)
    CloseGuard,             \* shell/planeView.js prepareToLeaveOverview: active === this._activated
    CloseEntersFocus,       \* shell/planeView.js prepareToLeaveOverview: this._activate(ws)
    ClickOnlyInReach,       \* core/view.js click: !this.reach().has(tile) -> 'ignored'
    FocusedClickEnters,     \* core/view.js click: focused tile -> 'enter'; planeView _apply -> _enter
    ClickFocuses,           \* core/view.js click: this._goTo(tile)
    CutoffLimitsWindows,    \* shell/planeView.js vfunc_allocate: _windowReach at CLICK_CUTOFF
    PreviewAlwaysLeaves,    \* shell/overviewHook.js PlaneWorkspace._shouldLeaveOverview() true
    FocusSettlesActivates,  \* shell/planeView.js _matchActiveToFocus: settled focus activates that workspace
    PageMath,               \* core/view.js nav: the PgUp/PgDn/Home/End index into plane.seated()
    ModKeysIgnored,         \* shell/planeView.js handleKey: MODIFIER_MASK -> EVENT_PROPAGATE
    ArrowGoesToNeighbor,    \* core/view.js nav: this._goTo(best)
    DropOnlyInReach,        \* shell/planeView.js _dropTile: !this._reach.has(tile) -> null
    WorkspaceDrops,         \* shell/planeView.js _apply 'drop': view.drop(plan.commit())
    CarryOutsideCancels,    \* core/gesture.js hover null -> cancelCarry; core/plane.js planDrag refuses a non-tile
    ActiveRefused,          \* core/plane.js planDrag: key === this._active -> empty plan
    RimToCenter,            \* core/view.js recenter: _goTo(plane.center)
    PanEndRefocus,          \* core/view.js panEnd: _goTo(this._view.root)
    EmptyActiveMoves,       \* shell/windowMoves.js openOn: an empty active workspace moves to the tile
    PlaneDropsEmpty,        \* core/plane.js sync: a seated key that is not live leaves
    PlaneKeepsActive,       \* core/plane.js sync: live includes snap.active
    EscapeIsGnomes          \* shell/planeView.js NAV has no Escape, so search keeps it

\* A small piece of the {4,5} tiling: t1..t6 in a row. Reach(t) is t and its neighbors
\* (core/view.js reach: the tile plus edge and corner neighbors).
Tiles == {"t1", "t2", "t3", "t4", "t5", "t6"}
Edges == {<<"t1","t2">>, <<"t2","t3">>, <<"t3","t4">>, <<"t4","t5">>, <<"t5","t6">>}
Nbr(t) == {u \in Tiles : <<t, u>> \in Edges \/ <<u, t>> \in Edges}
Reach(t) == {t} \cup Nbr(t)
Near(t) == Reach(t) \cup UNION {Nbr(u) : u \in Nbr(t)}
None == "-"
Out == "outside the disk"
Pool == {"A", "B", "E", "N"}
PageActs == {"pageUp", "pageDown", "home", "end"}

VARIABLES s, last, big
vars == <<s, last, big>>
\* TLC tells states apart by this view. `last` only names the step that led here.
StateView == <<s, big>>

\* The `hw scene` start: E is empty and active, A and B have one window each, GNOME order E, A, B.
S0 == [ov |-> "closed", search |-> FALSE,
       seat |-> [t \in Tiles |-> CASE t = "t1" -> "A" [] t = "t2" -> "E" [] t = "t3" -> "B" [] OTHER -> None],
       win |-> [w \in Pool |-> IF w \in {"A", "B"} THEN 1 ELSE 0],
       order |-> <<"E", "A", "B">>, active |-> "E", focus |-> "t2", activated |-> "E"]

Init == /\ s = S0
        /\ last = [act |-> "start", tile |-> None, src |-> None]
        /\ big \in BOOLEAN       \* focused-tile-size >= CLICK_CUTOFF (1.8)

Seated(st) == {st.seat[t] : t \in Tiles} \ {None}
TileOf(st, w) == CHOOSE t \in Tiles : st.seat[t] = w
Free(st) == Pool \ Seated(st)
Fresh(st) == CHOOSE n \in Free(st) : TRUE
IndexOf(sq, w) == IF \E i \in 1..Len(sq) : sq[i] = w THEN CHOOSE i \in 1..Len(sq) : sq[i] = w ELSE 0

\* core/plane.js sync (one GLib idle later, folded into the step): a workspace stays only while it is
\* active or has windows. The focus stays on the tile (core/view.js absorb).
Prune(st) ==
    LET gone == {w \in Seated(st) : st.win[w] = 0 /\ (w # st.active \/ ~PlaneKeepsActive)}
    IN IF ~PlaneDropsEmpty THEN st
       ELSE [st EXCEPT !.seat = [t \in Tiles |-> IF st.seat[t] \in gone THEN None ELSE st.seat[t]],
                       !.order = SelectSeq(st.order, LAMBDA w : w \notin gone)]

\* GNOME switched workspace; planeView.js active-workspace-changed handler.
Switch(st, w) ==
    IF w = st.active THEN st
    ELSE [st EXCEPT !.active = w,
                    !.activated = IF SwitchUpdatesActivated THEN w ELSE st.activated,
                    !.focus = IF SwitchMovesFocus /\ w \in Seated(st) THEN TileOf(st, w) ELSE st.focus]

\* GNOME raises a window it activates, whether or not it switched; planeView.js 'raised' handler.
Raise(st, w) == IF RaiseMovesFocus /\ w \in Seated(st) THEN [st EXCEPT !.focus = TileOf(st, w)] ELSE st

\* planeView.js _activate: remember the workspace, then GNOME switches.
Activate(st, w) == Switch([st EXCEPT !.activated = w], w)

CanEnter(st, t) == st.seat[t] # None \/ (EmptyActiveMoves /\ st.win[st.active] = 0) \/ Free(st) # {}

\* planeView.js _workspaceOn + _activate; windowMoves.js openOn for a blank tile.
EnterTile(st, t) ==
    IF st.seat[t] # None THEN Activate(st, st.seat[t])
    ELSE IF EmptyActiveMoves /\ st.win[st.active] = 0
         THEN [st EXCEPT !.seat = [x \in Tiles |-> IF x = t THEN st.active
                                                  ELSE IF st.seat[x] = st.active THEN None ELSE st.seat[x]],
                         !.activated = st.active]
         ELSE LET n == Fresh(st) IN
              Activate([st EXCEPT !.seat[t] = n, !.order = Append(st.order, n), !.win[n] = 0], n)

\* planeView.js prepareToLeaveOverview, run by GNOME on every close; then the Overview is closed.
Hide(st) ==
    LET st1 == IF CloseEntersFocus /\ (~CloseGuard \/ st.active = st.activated) /\ CanEnter(st, st.focus)
               THEN EnterTile(st, st.focus) ELSE st
    IN Prune([st1 EXCEPT !.ov = "closed", !.search = FALSE])

\* planeView.js _windowReach: from CLICK_CUTOFF only the focused tile's previews take the pointer.
WReach(st) == IF big /\ CutoffLimitsWindows THEN {st.focus} ELSE Reach(st.focus)

\* Settled focus activates that workspace (planeView.js _matchActiveToFocus), Overview stays open.
\* A blank tile runs EnterTile (openOn) then keeps ov open.
FocusSettle(st, t) ==
    IF ~FocusSettlesActivates THEN [st EXCEPT !.focus = t]
    ELSE IF ~CanEnter(st, t) THEN [st EXCEPT !.focus = t]
    ELSE LET st1 == EnterTile([st EXCEPT !.focus = t], t)
         IN Prune([st1 EXCEPT !.focus = IF st1.seat[t] # None THEN t ELSE TileOf(st1, st1.active)])

\* core/view.js click via planeView.js _apply 'click'.
ClickTile(st, t) ==
    IF ClickOnlyInReach /\ t \notin Reach(st.focus) THEN st
    ELSE IF t = st.focus THEN (IF FocusedClickEnters /\ CanEnter(st, t) THEN Hide(EnterTile(st, t)) ELSE st)
    ELSE IF ClickFocuses THEN FocusSettle(st, t) ELSE st

\* GNOME's WindowPreview click: Main.activateWindow switches and raises, then leaves when _shouldLeaveOverview().
WindowActivate(st, w) ==
    LET st1 == Raise(Switch(st, w), w)
    IN IF PreviewAlwaysLeaves \/ w = st.active THEN Hide(st1) ELSE Prune(st1)

\* core/view.js nav for the page keys over plane.seated() (GNOME order of the seated workspaces).
PageTarget(st, nav) ==
    LET l == st.order
        i == IndexOf(l, st.seat[st.focus])
    IN CASE nav = "home" -> 1
         [] nav = "end" -> Len(l)
         [] i = 0 -> 1
         [] nav = "pageDown" -> IF i < Len(l) THEN i + 1 ELSE i
         [] OTHER -> IF i > 1 THEN i - 1 ELSE 1

PageKey(st, nav) ==
    IF ~PageMath THEN st
    ELSE LET w == st.order[PageTarget(st, nav)]
             t == TileOf(st, w)
         IN FocusSettle(st, t)

\* shell/windowMoves.js dropOn via planeView.js acceptDrop/_dropTile.
DropWindow(st, w, t) ==
    IF t = Out \/ (DropOnlyInReach /\ t \notin Reach(st.focus)) \/ st.seat[t] = w THEN st
    ELSE IF st.seat[t] # None
         THEN Prune([st EXCEPT !.win[w] = @ - 1, !.win[st.seat[t]] = @ + 1])
         ELSE LET n == Fresh(st) IN
              Prune([st EXCEPT !.seat[t] = n, !.order = Append(st.order, n), !.win[w] = @ - 1, !.win[n] = 1])

\* core/plane.js planDrag + commit, abstracted: the dropped workspace takes the tile, and whatever
\* was there takes its old tile. The real slide-back geometry is test/plane.test.js's job.
MoveWs(st, src, t) ==
    LET w == st.seat[src]
        blank == {x \in Tiles : st.seat[x] = None}
    IN IF (t = Out /\ (CarryOutsideCancels \/ blank = {})) \/ (ActiveRefused /\ w = st.active) \/ ~WorkspaceDrops THEN st
       ELSE LET dest == IF t = Out THEN CHOOSE x \in blank : TRUE ELSE t
                seat2 == [st.seat EXCEPT ![dest] = w, ![src] = st.seat[dest]]
                fw == st.seat[st.focus]
            IN [st EXCEPT !.seat = seat2,
                          !.focus = IF fw = None THEN st.focus ELSE CHOOSE x \in Tiles : seat2[x] = fw]

Do(a, t, src, st2) ==
    /\ s' = st2
    /\ last' = [act |-> a, tile |-> t, src |-> src]
    /\ UNCHANGED big

Browsing == s.ov = "open" /\ ~s.search

\* ---- User steps ----

\* planeView.js _init runs per open: _activated = active, focusKey(active).
YouOpen == s.ov = "closed" /\
    Do("open", None, None, [s EXCEPT !.ov = "open", !.activated = s.active,
                                     !.focus = IF OpenFocusKey THEN TileOf(s, s.active) ELSE s.focus])

\* A switch made with the Overview closed (Super+PgDn, Ctrl+Alt+arrow). No PlaneView is alive.
YouSwitchWhileClosed == s.ov = "closed" /\ \E w \in Seated(s) \ {s.active} :
    Do("switchClosed", TileOf(s, w), None, Prune([s EXCEPT !.active = w]))

YouPressArrow == Browsing /\ \E t \in Nbr(s.focus) :
    Do("arrow", t, None, IF ArrowGoesToNeighbor THEN FocusSettle(s, t) ELSE s)

YouPressPageKey == Browsing /\ \E nav \in PageActs : Do(nav, None, None, PageKey(s, nav))

\* An arrow or page key with Ctrl, Alt, Shift or Super held.
YouPressModifiedKey == Browsing /\ \E t \in Nbr(s.focus) :
    Do("modkey", t, None, IF ModKeysIgnored THEN s ELSE [s EXCEPT !.focus = t])

YouType == Browsing /\ Do("type", None, None, [s EXCEPT !.search = TRUE])

YouPressEscape == s.ov = "open" /\
    Do("escape", s.focus, None,
       IF s.search THEN (IF EscapeIsGnomes THEN [s EXCEPT !.search = FALSE] ELSE s) ELSE Hide(s))

\* Super, a swipe, or any other close: GNOME hides and calls prepareToLeaveOverview.
YouCloseOtherwise == s.ov = "open" /\ Do("close", s.focus, None, Hide(s))

YouPickSearchResult == s.ov = "open" /\ s.search /\ \E w \in Seated(s) : s.win[w] > 0 /\
    Do("searchpick", TileOf(s, w), None, Hide(Raise(Switch(s, w), w)))

\* A press and release without motion on a tile's empty space (core/gesture.js click).
YouClickTile == Browsing /\ \E t \in Tiles :
    /\ (t = s.focus => CanEnter(s, t))
    /\ Do("clicktile", t, None, ClickTile(s, t))

\* A click on a window preview. An unreactive preview lets the press reach the plane as a tile click.
YouClickWindow == Browsing /\ \E t \in Tiles :
    /\ s.seat[t] # None /\ s.win[s.seat[t]] > 0
    /\ Do("clickwindow", t, None, IF t \in WReach(s) THEN WindowActivate(s, s.seat[t]) ELSE ClickTile(s, t))

\* Drag a window preview from tile src and drop it on t. An unreactive preview pans instead.
YouDragWindow == Browsing /\ \E src \in Tiles, t \in Tiles \cup {Out} :
    /\ s.seat[src] # None /\ s.win[s.seat[src]] > 0 /\ t # src
    /\ \/ /\ src \in WReach(s)
          /\ (t # Out /\ s.seat[t] = None => Free(s) # {})
          /\ Do("dragwindow", t, src, DropWindow(s, s.seat[src], t))
       \/ /\ src \notin WReach(s) /\ t = Out
          /\ \E p \in Tiles : Do("dragwindow", p, src, IF PanEndRefocus THEN FocusSettle(s, p) ELSE s)

\* A plain drag on empty space; on release the tile nearest the disk's center takes the focus.
YouPan == Browsing /\ \E p \in Tiles :
    Do("pan", p, None, IF PanEndRefocus THEN FocusSettle(s, p) ELSE s)

\* The rim arrow shows while no workspace is near the focus (core/view.js _rimAt).
YouClickRim == Browsing /\ Seated(s) # {} /\ \A t \in Near(s.focus) : s.seat[t] = None /\
    \E c \in {TileOf(s, w) : w \in Seated(s)} :
        Do("rim", c, None, IF RimToCenter THEN FocusSettle(s, c) ELSE s)

\* Drag a workspace with the move-modifier held and drop it on t.
YouMoveWorkspace == Browsing /\ \E src \in Tiles, t \in Tiles \cup {Out} :
    /\ s.seat[src] # None /\ t # src
    /\ Do("movews", t, src, MoveWs(s, src, t))

Next == \/ YouOpen \/ YouSwitchWhileClosed \/ YouPressArrow \/ YouPressPageKey \/ YouPressModifiedKey
        \/ YouType \/ YouPressEscape \/ YouCloseOtherwise \/ YouPickSearchResult
        \/ YouClickTile \/ YouClickWindow \/ YouDragWindow \/ YouPan \/ YouClickRim \/ YouMoveWorkspace

Spec == Init /\ [][Next]_vars

\* ---- Rules ----
\* Rn is the rule number in SKILL.md. A step rule reads s (before), s' (after) and last' (the step).
\* Each is a PROPERTY of the form [][Step]_vars, so TLC checks it on every step it explores.
DesignWReach(st) == IF big THEN {st.focus} ELSE Reach(st.focus)
\* Overview stays open; seat/win may change when a blank tile gets a workspace. Active follows focus.
FocusOpen == s'.ov = "open" /\ (s'.seat[s'.focus] = None \/ s'.active = s'.seat[s'.focus])
IsClose == \/ last'.act = "close"
           \/ (last'.act = "escape" /\ ~s.search)
           \/ (last'.act = "clicktile" /\ last'.tile = s.focus)
AllWindowed(st) == \A w \in Seated(st) : st.win[w] > 0

\* State rules (INVARIANT).
TypeOK == /\ s.ov \in {"open", "closed"} /\ s.search \in BOOLEAN
          /\ \A w \in Pool : s.win[w] \in 0..2
          /\ s.focus \in Tiles
\* The plane always shows the workspace you are on.
ActiveOnPlane == s.active \in Seated(s)
\* R33: GNOME keeps one empty workspace.
OneEmptyWorkspace == Cardinality({w \in Seated(s) : s.win[w] = 0}) <= 1

\* R1
OpeningFocusesActive == [][last'.act = "open" => s'.seat[s'.focus] = s'.active]_vars
\* R2, R31, R32
ClosingEntersFocused == [][IsClose => (s'.ov = "closed" /\ s'.seat[s.focus] = s'.active)]_vars
\* R3, split by case like R17 below.
SearchPick == last'.act = "searchpick"
PickLeaves == s'.ov = "closed" /\ s'.active = s.seat[last'.tile]
\* The result is on another workspace, or the focus is on its tile.
SearchPickWins == [][(SearchPick /\ (s.seat[last'.tile] # s.active \/ last'.tile = s.focus)) => PickLeaves]_vars
\* The result is on the active workspace and the focus is on another tile.
ActiveSearchPickWins == [][(SearchPick /\ s.seat[last'.tile] = s.active /\ last'.tile # s.focus) => PickLeaves]_vars
\* R17, split by case so a finding in one case leaves the other checked.
WindowClick == last'.act = "clickwindow" /\ last'.tile \in DesignWReach(s)
WindowLeaves == s'.ov = "closed" /\ s'.active = s.seat[last'.tile]
\* The window is on another workspace, or the focus is on the window's tile.
WindowClickLeaves == [][(WindowClick /\ (s.seat[last'.tile] # s.active \/ last'.tile = s.focus)) => WindowLeaves]_vars
\* The window is on the active workspace and the focus is on another tile.
ActiveWindowClickLeaves == [][(WindowClick /\ s.seat[last'.tile] = s.active /\ last'.tile # s.focus) => WindowLeaves]_vars
\* R4, R16
NearClickFocuses == [][(last'.act = "clicktile" /\ last'.tile \in Nbr(s.focus)) => (s'.focus = last'.tile /\ FocusOpen)]_vars
\* R19
CutoffNeighborClickFocuses ==
    [][(last'.act = "clickwindow" /\ big /\ last'.tile \in Nbr(s.focus)) => (s'.focus = last'.tile /\ FocusOpen)]_vars
\* R8
ArrowMovesToNeighbor == [][last'.act = "arrow" => (s'.focus = last'.tile /\ FocusOpen)]_vars
\* R13: settled focus is the active workspace (stock GNOME). Page keys included.
SettledFocusIsActive == [][last'.act \in PageActs => FocusOpen /\ s'.seat[s'.focus] # None]_vars
\* R11, R12 (O2): the page keys walk GNOME's own workspace order. An empty workspace you are on
\* stays in that order until GNOME removes it, which the model folds into the step that leaves it.
PageKeysFollowGnomeOrder == [][last'.act \in PageActs =>
    LET l == s.order
        i == IndexOf(l, s.seat[s.focus])
        want == CASE last'.act = "home" -> l[1]
                  [] last'.act = "end" -> l[Len(l)]
                  [] i = 0 -> l[1]
                  [] last'.act = "pageDown" -> l[IF i < Len(l) THEN i + 1 ELSE i]
                  [] OTHER -> l[IF i > 1 THEN i - 1 ELSE 1]
    IN s'.seat[s'.focus] = want]_vars
\* R15 (code only)
ModifiedKeysIgnored == [][last'.act = "modkey" => s' = s]_vars
\* R21, R22
WindowDrops == [][last'.act = "dragwindow" =>
    LET w == s.seat[last'.src]
        t == last'.tile
    IN /\ s'.ov = "open"
       /\ IF last'.src \notin Reach(s.focus) \/ (big /\ last'.src # s.focus)
          THEN s'.win = s.win
          ELSE /\ s'.active = s.active
               /\ IF t # Out /\ t \in Reach(s.focus) /\ s.seat[t] # w
                  THEN IF s.seat[t] # None
                       THEN s'.win[s.seat[t]] = s.win[s.seat[t]] + 1
                       ELSE s'.seat[t] # None /\ s'.win[s'.seat[t]] = 1
                  ELSE s'.win = s.win /\ s'.seat = s.seat]_vars
\* R23, R24
WorkspaceMoves == [][(last'.act = "movews" /\ last'.tile # Out /\ s.seat[last'.src] # s.active)
                     => (s'.seat[last'.tile] = s.seat[last'.src] /\ s'.win = s.win
                         /\ s'.active = s.active /\ s'.ov = "open")]_vars
\* R26 (code only)
DropOutsideCancels == [][(last'.act = "movews" /\ last'.tile = Out) => s' = s]_vars
\* R27 (O4): a modifier-drag moves the active workspace like any other. Was finding F3.
ActiveWorkspaceMoves == [][(last'.act = "movews" /\ last'.tile # Out /\ s.seat[last'.src] = s.active)
                           => (s'.seat[last'.tile] = s.active /\ s'.win = s.win
                               /\ s'.active = s.active /\ s'.ov = "open")]_vars
\* R28
RimReturnsToGroup == [][last'.act = "rim" => s'.seat[s'.focus] # None]_vars
\* R30 (O5)
PanReleaseFocusesNearest == [][last'.act = "pan" => (s'.focus = last'.tile /\ FocusOpen)]_vars
\* R33
EmptyHopKeepsWorkspace == [][(IsClose /\ s.seat[s.focus] = None /\ s.win[s.active] = 0) => s'.active = s.active]_vars
\* R34
EscapeClearsSearchFirst == [][(last'.act = "escape" /\ s.search) => (s'.ov = "open" /\ ~s'.search)]_vars

\* R18 (O1): a click farther out than reach focuses that tile. Was finding F2.
FarClickFocuses == [][(last'.act \in {"clicktile", "clickwindow"} /\ last'.tile \notin Reach(s.focus))
                      => (s'.focus = last'.tile /\ FocusOpen)]_vars
====
