# Focus and keys

In the Overview the arrows move focus to the tile in that direction. PgUp and PgDn walk GNOME's workspace order, and Home and End focus the first and last workspace in that order. The focused tile has the bright outline. Other keys keep GNOME's behavior.

## Sub-features

- `keys-arrows` moves focus to the edge neighbor.
- `keys-page` moves focus with PgUp and PgDn. With `page-keys-activate` set to true, it also switches workspace.
- `keys-home-end` focuses the first (Home) or last (End) workspace in GNOME's order. `page-keys-activate` makes them switch workspace too.
- `keys-passthrough` sends typed letters to the search entry. Escape first clears the search, then closes the Overview.

## How to get to it (user POV)

- Open the Overview, then press `Left`, `Right`, `Up`, `Down`, `Page_Up`, `Page_Down`, `Home` or `End`.

## Driving it with hw

Preconditions:

- Baseline from the README. Run `hw overview show`. `hw probe-plane` shows `focusTile` 0.

- **Arrow.** Run `hw key Right`. `hw probe-plane` shows `"focusTile":1,"focus":"Alpha"`, and `active` is still `(empty)`. Capture `hw shot focus-right`.
- **Home and End.** Run `hw key End`. `hw probe-plane` shows `"focus":"Delta"`, the last workspace. Run `hw key Home`. `focusTile` is back to 0, the first workspace.
- **Page keys, default.** Run `hw key Page_Down`. Focus moves, and `hw workspaces` still shows `active=0`.
- **Page keys, activate.** Run `hw gset set org.gnome.shell.extensions.hyperbolic-workspaces page-keys-activate true`, close and reopen the Overview, and press `Page_Down` or `End`. `hw workspaces` shows the active index changed, and the Overview stays open. Reset the key afterward.
- **Passthrough.** Run `hw key h`, then `hw key i`. `hw eval 'Main.overview.searchEntry.text'` reads `"hi"`. The first `hw key Escape` clears the search and leaves the Overview open, as in stock GNOME. A second `hw key Escape` closes it (`hw eval Main.overview.visible` is `false`).

## Gotchas

- `Return` leaves the Overview open, as in stock GNOME 51. Escape closes it and enters the focused workspace (see [entering a workspace](./enter-workspace.md)).
- Any held modifier other than Lock or NumLock makes the plane ignore the key. Release modifiers from an earlier `drag` before testing keys.
