# Preferences page

The extension's preferences window has a "Disk drawing" group with a "Focused tile size" slider from 1 to 2.5, with marks at 1 and at 2 (Klein), and a reset button. Moving the slider writes `focused-tile-size` right away, and the reset button returns it to 1.

## Sub-features

- `prefs-open` opens the window from `gnome-extensions prefs` (the Extensions app's settings button does the same).
- `prefs-slider-keys` changes the value in 0.05 steps with Left and Right, and jumps to the ends with Home and End.
- `prefs-slider-reflects` shows the stored value when the window opens and follows outside changes.
- `prefs-reset` restores the default value of 1 with the reset button.
- `prefs-overview` makes the Overview use the new value the next time it opens.

## How to get to it (user POV)

- Open the Extensions app and choose the settings button for Hyperbolic Workspaces.
- Or run `gnome-extensions prefs hyperbolic-workspaces@deedlefake.github.io`.

## Driving it with hw

Preconditions:

- Baseline from the README. `focused-tile-size` is 1.0.

- **Whole journey.** Run `scripts/prove-prefs.sh`. It prints a `PASS` or `FAIL` line per check, ends with `ALL PASS`, and writes `prefs-journey.log`, `prefs-a11y.txt` and the screenshots below to `$EV`.
- **Open.** Run `hw prefs`. It prints `"Hyperbolic Workspaces"` as the focused window. `hw a11y value slider ''` reads `1.0`. Capture `hw shot prefs-open`.
- **Keyboard.** Press `hw key Tab` until `hw key End` moves the value. `hw gget focused-tile-size` reads `2.5`. Then press `Home`, followed by twenty presses of `Right`. The value reads `2.0` in both `gget` and `a11y value`.
- **Overview reflects it.** Run `hw prefs-close`, `hw overview show` and `hw probe-clicks`. The output is `"size":2,"clickable":[]`. Capture `overview-size-2`.
- **Reset.** Run `hw prefs`, then `hw a11y do button 'Reset to default'`. `gget` and the slider read `1.0`. After you reopen the Overview, `probe-clicks` shows `"size":1` with all four titles clickable.
- **AT-SPI value.** `hw a11y set slider '' 2.2` also writes the key, as a screen reader would.

## Gotchas

- The slider has no accessible name. The row's "Focused tile size" title is not linked to it. Match it by role (`slider`) with an empty name. That only works because it is the window's only slider.
- On a fresh open, keyboard focus is not on the slider. It took three `Tab` presses in this container. Tab until `End` changes the value instead of hardcoding a count.
- AT-SPI `set` does not snap to the 0.05 step: `2.2` is stored as `2.2000000000000002`. Keyboard input snaps.
- `hw a11y` searches only the `org.gnome.Shell.Extensions` app. The shell's own sliders (volume, brightness) match first otherwise. Set `A11Y_APP` to drive another app.
- Keys go to the focused window. While the Overview is open, they move the plane's focus instead of the slider, so `hw prefs` closes the Overview first.
- Proven end to end on 2026-11-02 in container `hw-verify` (GNOME Shell 51.1, `06445c6`), twice in a row with `ALL PASS`.
