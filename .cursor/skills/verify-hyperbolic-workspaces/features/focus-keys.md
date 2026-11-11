# Focus and keys

In the Overview the arrows, PgUp, PgDn, Home and End switch the active workspace, as in stock GNOME. The focused tile has the bright outline and is the workspace you are on. Other keys keep GNOME's behavior.

## Sub-features

- `keys-arrows` switches to the edge neighbor.
- `keys-page` switches with PgUp and PgDn through GNOME's workspace order.
- `keys-home-end` switches to the first (Home) or last (End) workspace in that order.
- `keys-passthrough` sends typed letters to the search entry. Escape first clears the search, then closes the Overview.

## How to get to it (user POV)

- Open the Overview, then press `Left`, `Right`, `Up`, `Down`, `Page_Up`, `Page_Down`, `Home` or `End`.

## Driving it with hw

Preconditions:

- Baseline from the README. Run `hw overview show`. `hw probe-plane` shows `focusTile` 0.

- **Arrow.** Run `hw key Right`. `hw probe-plane` shows `"focusTile":1,"focus":"Alpha"`, and `active` is `Alpha`. Capture `hw shot focus-right`.
- **Home and End.** Run `hw key End`. `hw probe-plane` shows `"focus":"Delta"`, the last workspace. Run `hw key Home`. `focusTile` is back to 0, the first workspace, and `active` matches.
- **Page keys.** Run `hw key Page_Down`. Focus moves and `hw workspaces` shows the active index changed. The Overview stays open.
- **Passthrough.** Run `hw key h`, then `hw key i`. `hw eval 'Main.overview.searchEntry.text'` reads `"hi"`. The first `hw key Escape` clears the search and leaves the Overview open, as in stock GNOME. A second `hw key Escape` closes it (`hw eval Main.overview.visible` is `false`).

## Gotchas

- `Return` leaves the Overview open, as in stock GNOME 51. Escape closes it and enters the focused workspace (see [entering a workspace](./enter-workspace.md)).
- Any held modifier other than Lock or NumLock makes the plane ignore the key. Release modifiers from an earlier `drag` before testing keys.
- Focusing a blank tile seats a workspace there through `openOn` (reuses the trailing empty, or moves the empty active one) and activates it, so focus and active stay the same thing.
