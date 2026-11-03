# Focus and keys

In the Overview the arrows move focus to the tile in that direction. PgUp and PgDn walk GNOME's workspace order, and Home returns focus to the group's center. The focused tile has the bright outline. Other keys keep GNOME's behavior.

## Sub-features

- `keys-arrows` moves focus to the edge neighbor.
- `keys-page` moves focus with PgUp and PgDn. With `page-keys-activate` set to true, it also switches workspace.
- `keys-home` focuses the center of the group again.
- `keys-passthrough` sends typed letters to the search entry and keeps Escape closing the Overview.

## How to get to it (user POV)

- Open the Overview, then press `Left`, `Right`, `Up`, `Down`, `Page_Up`, `Page_Down` or `Home`.

## Driving it with hw

Preconditions:

- Baseline from the README. Run `hw overview show`. `hw probe-plane` shows `focusTile` 0.

- **Arrow.** Run `hw key Right`. `hw probe-plane` shows `"focusTile":1,"focus":"Alpha"`, and `active` is still `(empty)`. Capture `hw shot focus-right`.
- **Home.** Run `hw key Home`. `focusTile` is back to 0.
- **Page keys, default.** Run `hw key Page_Down`. Focus moves, and `hw workspaces` still shows `active=0`.
- **Page keys, activate.** Run `hw gset set org.gnome.shell.extensions.hyperbolic-workspaces page-keys-activate true`, close and reopen the Overview, and press `Page_Down`. `hw workspaces` shows the active index changed. Reset the key afterward.
- **Passthrough.** Run `hw key h`, then `hw key i`. `hw eval 'Main.overview.searchEntry.text'` reads `"hi"`. Then `hw key Escape` closes the Overview (`hw eval Main.overview.visible` is `false`).

## Gotchas

- `Return` does not enter the focused workspace yet. As of `06445c6`, it leaves `active=0` and the Overview open. Report that as a missing feature, not a harness fault.
- Any held modifier other than Lock or NumLock makes the plane ignore the key. Release modifiers from an earlier `drag` before testing keys.
- `End` is not bound by the plane yet and still does what it does in GNOME.
