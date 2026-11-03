---
name: verify-hyperbolic-workspaces
description: Launch GNOME Shell 51 headless in a private container with this checkout's Hyperbolic Workspaces extension, then drive the real Overview (windows, panning, tile focus, keys, workspace moves) and the extension's preferences window, and capture screenshots, logs and GSettings state as proof. Use when you need to prove extension or prefs behavior end to end, not just run unit tests.
---

# Verify Hyperbolic Workspaces

The extension runs inside GNOME Shell 51.1 in a Fedora 45 container. Everything goes through `scripts/hw`, run from anywhere in this checkout. The feature map in [`features/README.md`](features/README.md) lists what to drive and what proves it.

## Isolation

- Each run uses its own container, named by `HW_INSTANCE` (default `hw-verify`). Pick a unique name when another agent may be verifying at the same time: `export HW_INSTANCE=hw-$(date +%s)`.
- `hw` refuses the name `gs51`. That container belongs to ad hoc probes and the `tools/` scripts. Never stop or change it.
- The docker CLI on the box needs `DOCKER_HOST=tcp://127.0.0.1:2375`. `hw` sets it when unset.

## Launch

```sh
S=.cursor/skills/verify-hyperbolic-workspaces/scripts
$S/hw up          # builds image hyperbolic-gs51:verify once (a few minutes), then about 5 s
$S/hw scene       # windows Alpha..Delta, each alone on workspaces 1..4; workspace 0 is empty and active
```

`up` copies every tracked and unignored file in this checkout into the extension directory, as a clone would, enables only this extension, and starts `gnome-shell --headless --unsafe-mode --virtual-monitor 1280x800`. Set `HW_MONITORS` before `up` for other monitors, for example `HW_MONITORS='1280x800 1024x768'` for a second one on the right. It returns once the shell has finished starting and the extension state is `1` (ENABLED). After editing code, run `$S/hw install` to copy the tree again and restart the shell.

## Doctor

Run `$S/hw doctor` first, and again whenever something looks wrong. It is read-only. Healthy output:

```
hw-verify Up ... hyperbolic-gs51:verify
shell pid: 97
(true, '"51.1"')
(true, '"{\"state\":1,\"error\":\"\",\"ws\":2,\"overview\":true}"')
installed src matches checkout (06445c6)
```

A `state` other than 1 or a non-empty `error` means the extension failed to load. Read `$S/hw logs 200`. A `WARN installed src differs` line means you are about to verify stale code.

## Drive

| Command | Does |
| --- | --- |
| `hw overview show\|hide` | opens or closes the Overview and prints `Main.overview.visible` |
| `hw window TITLE [W H]` | opens a real Gtk4 Wayland window and waits for it |
| `hw workspaces` | `active=N 0:titles \| 1:titles ...` |
| `hw key KEYVAL [MOD_KEYVAL]` | virtual keyboard, Clutter keyval names: `Left`, `Page_Up`, `Home`, `Return`, `Tab`, `End`; modifier e.g. `Super_L` |
| `hw move X Y`, `hw click X Y` | virtual pointer in stage pixels (1280x800) |
| `hw drag X1 Y1 X2 Y2 [MOD_KEYVAL]` | press, ten motion steps, release; holds the modifier when given |
| `hw probe-plane` | `{focusTile, focus, active, size, tiles}`: which tile is focused and which windows each tile holds |
| `hw preview-center TITLE` | stage `X Y` of a window preview's center, for `click` and `drag` |
| `hw probe-clicks` | `{size, clickable, blocked}`: picks each visible window preview's center and reports which previews would take a click |
| `hw empty-tile-point` | stage `X Y` on an empty reachable tile where a click reaches the plane, the focused tile when it is empty, else `none` |
| `hw eval 'JS'` | `org.gnome.Shell.Eval`; `Main` and `global` are globals, `imports.gi` works, `import` does not |
| `hw gget KEY`, `hw gset get\|set\|reset SCHEMA KEY [V]` | GSettings, read as a second view of what the UI wrote |
| `hw prefs`, `hw prefs-close` | opens the prefs window through `gnome-extensions prefs` and focuses it, or closes it |
| `hw a11y tree\|value\|set\|do ...` | AT-SPI on the prefs window; see `scripts/container/a11y.py` |
| `hw shot NAME` | screenshot to `$EV/NAME.png` |
| `hw logs [N]`, `hw grab-logs` | tail the shell log, or copy it to `$EV/shell.log` |

Prefer user input (`key`, `click`, `drag`, AT-SPI actions) over `eval` that calls extension internals. Use `eval` to read state, not to cause it.

`scripts/prove-prefs.sh` is the full preferences journey and the model for writing others. It asserts each step and logs it. `scripts/prove-monitors.sh` checks that a second monitor and the plane agree when `workspaces-only-on-primary` is false.

## Evidence

Artifacts go to `$EV`, which is `HW_EVIDENCE` or `/workspace/hw-evidence/$HW_INSTANCE`. It lives outside the container and outside the repo, so `down` never removes it.

- Capture the action and the state after it: a screenshot plus the matching `gget`, `probe-clicks` or `workspaces` output.
- Check side effects on a second path. A slider move counts only when `gget` shows the new value, and an Overview change only when `probe-clicks` or a screenshot shows it.
- Record which entry point you used (keyboard, pointer or AT-SPI) for each check.

## Cleanup

```sh
$S/hw down        # copies shell.log into $EV if missing, then removes only $HW_INSTANCE
```

Run it after every run, failed ones included. It removes your container by exact name and never touches `gs51` or the image. Evidence survives. Remove the image with `docker rmi hyperbolic-gs51:verify` only when no other run is using it.

## What the container stands in for

A real desktop session differs in these ways. Treat these areas as unverified until a real session covers them.

- logind is faked with python-dbusmock, and there is no systemd, GDM or user session. Lock-screen and session-mode changes (which disable extensions) are not exercised.
- The AT-SPI bus is started by hand, and `toolkit-accessibility` is set to `true`.
- Rendering is software (llvmpipe) on one virtual 1280x800 monitor unless `HW_MONITORS` adds more. There is no GPU and no touch device.
- `--unsafe-mode` enables Eval and the screenshot API, which a normal session blocks.
- The extension is copied into `~/.local/share/gnome-shell/extensions/` and enabled through GSettings before the first start. It is not installed from a zip with `gnome-extensions install`.
- Input comes from Clutter virtual devices. These go through the same event path as a real keyboard and mouse, but no hardware is involved.
