const {M, C, Tiling, lerpFrame, wrapAngle, emptyState, openWorkspace, nearestFree, removeWorkspace, dropWorkspace, components} = Hyper

const OPTIONS = {
  orient: {drift: "Drift", after: "Upright after move", blend: "Upright during move"},
  back: {visual: "Always visual direction", quick: "Opposite goes back if pressed right away", always: "Opposite always goes back"},
  backMs: {300: "300 ms", 600: "600 ms", 1000: "1000 ms"},
  snap: {on: "On", off: "Off"},
  moveMod: {shift: "Shift", alt: "Alt", ctrl: "Ctrl", ctrlalt: "Ctrl+Alt"},
}
const opt = {orient: "blend", back: "visual", backMs: "600", snap: "on", moveMod: "shift"}
const params = new URLSearchParams(location.search)
for (const k of Object.keys(opt)) if (params.has(k)) opt[k] = params.get(k)
const DUR = +(params.get("dur") ?? 300)
// Held when a drag starts on a workspace, this moves the workspace instead of panning.
const MOVE_KEYS = {shift: ["shiftKey"], alt: ["altKey"], ctrl: ["ctrlKey"], ctrlalt: ["ctrlKey", "altKey"]}
const ORDER = "distance"

const T = new Tiling(4, 5)
const canvas = document.getElementById("c")
const ctx = canvas.getContext("2d")
let W = 0, H = 0, R = 0, cx = 0, cy = 0

let S = emptyState()
// The view is a root tile plus a residual map that keeps the root near the
// screen center; screen frame of tile t = view.R * frame(t relative to root).
const view = {root: 0, R: M.id()}
let focus = {tile: 0}
let active = null
const anims = []
let viewAnim = null
let dirty = true
const frameTimes = []
const logLines = []
const timers = new Set()

const now = () => performance.now()
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

function log(line) {
  logLines.unshift(line)
  logLines.length = Math.min(logLines.length, 40)
  document.getElementById("log").textContent = logLines.join("\n")
  console.log("LOG " + line)
}

const EDGE_SUB = 12
const boundary = []
for (let k = 0; k < 4; k++) {
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
  const [u0, v0] = corners[k], [u1, v1] = corners[(k + 1) % 4]
  for (let i = 0; i < EDGE_SUB; i++) {
    const t = i / EDGE_SUB
    boundary.push(T.local(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t))
  }
}
const ASPECT = 9 / 16
function rectPoly(u0, v0, u1, v1, n = 8) {
  const pts = []
  const edge = (a, b) => { for (let i = 0; i < n; i++) { const t = i / n; pts.push(T.local(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) } }
  edge([u0, v0], [u1, v0]); edge([u1, v0], [u1, v1]); edge([u1, v1], [u0, v1]); edge([u0, v1], [u0, v0])
  return pts
}
const VMAX = 0.96 * ASPECT * 1.7
const screenPoly = rectPoly(-0.96, -VMAX, 0.96, VMAX, 10)
const winCache = new Map()
function windowLayouts(id) {
  if (winCache.has(id)) return winCache.get(id)
  let seed = id * 9301 + 49297
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const wins = []
  for (let i = 0; i < 6; i++) {
    const w = 0.5 + rnd() * 0.8, h = 0.35 + rnd() * 0.5
    const u0 = -0.9 + rnd() * (1.8 - w), v1 = VMAX - 0.12 - rnd() * (2 * VMAX - h - 0.2)
    wins.push({body: rectPoly(u0, v1 - h, u0 + w, v1), bar: rectPoly(u0, v1 - 0.09, u0 + w, v1, 6), shade: 200 + Math.floor(rnd() * 50)})
  }
  winCache.set(id, wins)
  return wins
}

function resize() {
  const r = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = r.width * dpr
  canvas.height = r.height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  W = r.width; H = r.height
  R = Math.min(W, H) / 2 - 12
  cx = W / 2; cy = H / 2
  dirty = true
}
window.addEventListener("resize", resize)

const toScreen = (z) => [cx + R * z[0], cy - R * z[1]]
const toDisk = (x, y) => [(x - cx) / R, -(y - cy) / R]

function path(F, pts) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = toScreen(M.apply(F, pts[i]))
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

// Fold whole tile steps into the root so the residual stays small.
function rebase() {
  for (let guard = 0; guard < 64; guard++) {
    const t = T.tiles[view.root]
    let best = -1, bd = C.abs2(M.center(view.R))
    const nb = T.neighbors(view.root)
    for (let k = 0; k < 4; k++) {
      const d = C.abs2(M.center(M.compose(view.R, T.rel[k][t.tw[k]])))
      if (d < bd - 1e-12) { bd = d; best = k }
    }
    if (best === -1) break
    view.R = M.norm(M.compose(view.R, T.rel[best][t.tw[best]]))
    view.root = nb[best]
  }
}

const DRAW_DEPTH = 7
let visCache = null
function visible() {
  rebase()
  const fr = T.frames(view.root, DRAW_DEPTH)
  const out = new Map()
  for (const [id, {F}] of fr) {
    const S = M.compose(view.R, F)
    if (C.abs2(M.center(S)) < 0.997 * 0.997) out.set(id, S)
  }
  visCache = out
  return out
}
// Screen frame of a tile, or null when it is too far from the view to draw.
function screenFrame(tile) {
  const F = T.relFrame(view.root, tile, DRAW_DEPTH)
  return F ? M.compose(view.R, F) : null
}

function wsAtTile() {
  const m = new Map()
  S.ws.forEach((w, i) => m.set(w.tile, {w, i}))
  return m
}

function drawWorkspace(F, w, alpha) {
  const scale = 1 - C.abs2(M.center(F))
  ctx.globalAlpha = alpha
  const hue = (w.id * 67) % 360
  path(F, boundary)
  ctx.fillStyle = `hsl(${hue} 35% 22%)`
  ctx.fill()
  path(F, screenPoly)
  ctx.fillStyle = `hsl(${hue} 45% 34%)`
  ctx.fill()
  if (scale * R > 25)
    for (const win of windowLayouts(w.id).slice(0, w.wins)) {
      path(F, win.body); ctx.fillStyle = `rgb(${win.shade},${win.shade},${win.shade + 5})`; ctx.fill()
      path(F, win.bar); ctx.fillStyle = "#2a2f37"; ctx.fill()
    }
  ctx.globalAlpha = 1
}

// A move is a list of segments, each from a tile-relative offset to another.
function animFrame(a, t) {
  let el = t - a.t0, seg = a.segs.at(-1), p = 1
  for (const sg of a.segs) { if (el <= sg.dur) { seg = sg; p = el / sg.dur; break } el -= sg.dur }
  const base = screenFrame(seg.fromTile)
  return base && M.compose(base, lerpFrame(seg.off, seg.rel, ease(p)))
}

function draw() {
  const t0 = now()
  ctx.fillStyle = "#05080c"
  ctx.fillRect(0, 0, W, H)
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fillStyle = "#0b1118"; ctx.fill()
  const vis = visible()
  const pv = drag?.ws && drag.preview
  // While a drag hovers, the plane shows the layout a drop would leave.
  const occ = pv ? new Map(pv.state.ws.map((w) => [w.tile, {w: S.ws.find((x) => x.id === w.id)}])) : wsAtTile()
  const hidden = new Set(anims.filter((a) => a.kind === "move").map((a) => a.id))
  if (drag?.ws) hidden.add(drag.ws)
  for (const [id, F] of vis) {
    const o = occ.get(id)
    if (o && !hidden.has(o.w.id)) drawWorkspace(F, o.w, pv && pv.moves.some((m) => m.id === o.w.id) ? 0.6 : 1)
    path(F, boundary)
    ctx.lineWidth = 1
    ctx.strokeStyle = "#2a3a4c"
    ctx.stroke()
  }
  const t = now()
  for (const a of anims) {
    const p = Math.min(1, (t - a.t0) / a.dur)
    if (a.kind === "move") {
      const w = S.ws.find((x) => x.id === a.id)
      const F = w && animFrame(a, t)
      if (F) drawWorkspace(F, w, 1)
    } else if (a.kind === "fade") {
      const F = screenFrame(a.tile)
      if (F) drawWorkspace(F, a.w, 1 - p)
    }
  }
  const cF = vis.get(S.anchor)
  if (cF) {
    const [x, y] = toScreen(M.center(cF))
    ctx.beginPath(); ctx.arc(x, y, R * (1 - C.abs2(M.center(cF))) * 0.05, 0, 2 * Math.PI)
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.stroke()
  }
  const fTile = focusTile()
  const fF = fTile !== null ? vis.get(fTile) ?? null : null
  if (fF) { path(fF, boundary); ctx.lineWidth = 3; ctx.strokeStyle = "#7fb6ff"; ctx.stroke() }
  if (drag?.ws) {
    const hover = drag.hover !== null ? vis.get(drag.hover) : null
    if (pv) {
      // Moved workspaces get a dashed outline; the dropped one's final tile a solid one.
      for (const m of pv.moves) {
        const F = vis.get(m.to)
        if (!F || m.id === drag.ws) continue
        ctx.setLineDash([4, 4]); path(F, boundary); ctx.lineWidth = 2; ctx.strokeStyle = "#ffb070"; ctx.stroke(); ctx.setLineDash([])
      }
      const end = pv.state.ws.find((x) => x.id === drag.ws).tile
      const Fe = vis.get(end)
      if (Fe) {
        drawWorkspace(Fe, S.ws.find((x) => x.id === drag.ws), 0.35)
        path(Fe, boundary); ctx.lineWidth = 3; ctx.strokeStyle = "#8be28b"; ctx.stroke()
      }
    }
    if (hover) { ctx.setLineDash([6, 4]); path(hover, boundary); ctx.lineWidth = 2.5; ctx.strokeStyle = "#ffd36b"; ctx.stroke(); ctx.setLineDash([]) }
    const w = S.ws.find((x) => x.id === drag.ws)
    drawWorkspace(drag.frame, w, 0.85)
  }
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.lineWidth = 1; ctx.strokeStyle = "#3b4d61"; ctx.stroke()
  for (const a of anims) if (a.kind === "enter") drawEnter(a, Math.min(1, (t - a.t0) / a.dur))
  const dt = now() - t0
  frameTimes.push(dt); if (frameTimes.length > 60) frameTimes.shift()
  const avg = frameTimes.reduce((x, y) => x + y, 0) / frameTimes.length
  const alpha = fF ? M.split(fF).alpha : 0
  document.getElementById("status").textContent =
    `workspaces with windows ${S.ws.length}  pieces ${components(T, S).length}\n` +
    `tiles drawn ${vis.size}  generated ${T.tiles.length}  view tile ${view.root}\n` +
    `draw ${dt.toFixed(1)} ms (avg ${avg.toFixed(1)})\n` +
    `active ${active === null ? "none" : tileLabel(active)}\n` +
    `focus ${focusLabel()}  rotation ${Math.round(wrapAngle(alpha) * 180 / Math.PI)} deg`
  window.__stats = {drawMs: dt, avgMs: avg, tiles: vis.size, generated: T.tiles.length, root: view.root, R: view.R}
}

function drawEnter(a, p) {
  const [x0, y0] = toScreen(M.center(a.F))
  const s = 1 - C.abs2(M.center(a.F))
  const w0 = R * s * 0.9, h0 = w0 * ASPECT
  const q = ease(Math.min(1, p * 1.6))
  const w = w0 + (W - w0) * q, h = h0 + (H - h0) * q
  const x = x0 + (W / 2 - x0) * q, y = y0 + (H / 2 - y0) * q
  ctx.globalAlpha = p < 0.7 ? 0.9 : 0.9 * (1 - (p - 0.7) / 0.3)
  ctx.fillStyle = a.w ? `hsl(${(a.w.id * 67) % 360} 45% 34%)` : "#1a2532"
  ctx.fillRect(x - w / 2, y - h / 2, w, h)
  ctx.font = "600 34px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
  ctx.fillStyle = "#fff"; ctx.fillText(`Entered ${a.label}`, x, y)
  ctx.globalAlpha = 1
}

function focusTile() {
  if (focus.ws !== undefined) {
    const w = S.ws.find((x) => x.id === focus.ws)
    return w ? w.tile : null
  }
  return focus.tile
}
const wsLabel = (w) => `workspace with ${w.wins} window${w.wins === 1 ? "" : "s"}`
function tileLabel(tile) {
  const w = S.ws.find((x) => x.tile === tile)
  return w ? wsLabel(w) : "empty workspace"
}
const focusLabel = () => { const t = focusTile(); return t === null ? "none" : tileLabel(t) }
const focusedWs = () => S.ws.find((x) => x.id === focus.ws) ?? null

function setFocusTile(tile) {
  const w = S.ws.find((x) => x.tile === tile)
  focus = w ? {ws: w.id} : {tile}
}

// Animate the view so `tile` ends at the center. A tile too far away to draw
// from here is brought in from just past the disk edge.
function goTo(tile, {upright = false} = {}) {
  let F0 = screenFrame(tile)
  if (!F0) { F0 = M.to([0.97, 0]); log(`jump: tile ${tile} is out of drawing range, sliding it in from the edge`) }
  const c = M.center(F0)
  const drift = M.compose(M.inv(M.to(c)), F0)
  const d = M.dist0(F0)
  const dur = DUR * Math.min(2, 0.75 + 0.25 * d / (2 * T.rE))
  const orient = upright ? "blend" : opt.orient
  let phases
  if (orient === "drift") phases = [{from: F0, to: drift, dur, rot: false}]
  else if (orient === "blend") phases = [{from: F0, to: M.id(), dur, rot: true}]
  else phases = [{from: F0, to: drift, dur, rot: false}, {from: drift, to: M.id(), dur: DUR * 0.7, rot: true}]
  viewAnim = {tile, phases, t0: now()}
  setFocusTile(tile)
  kick()
}

function stepView() {
  if (!viewAnim) return false
  let t = now() - viewAnim.t0
  view.root = viewAnim.tile
  for (const ph of viewAnim.phases) {
    if (t <= ph.dur) {
      const p = ease(t / ph.dur)
      view.R = lerpFrame(ph.from, ph.to, p, ph.rot ? p : 0)
      return true
    }
    t -= ph.dur
  }
  view.R = viewAnim.phases.at(-1).to
  viewAnim = null
  return true
}
function applyMoves(moves, {follow = true, starts = new Map()} = {}) {
  for (const m of moves) {
    const st = starts.get(m.id)
    const fromTile = st?.tile ?? m.from
    const rel = T.relFrame(fromTile, m.to, DRAW_DEPTH) ?? M.id()
    // A drop away from the group lands on its tile first, then slides back.
    const segs = st && fromTile !== m.to
      ? [{fromTile, off: st.off, rel: M.id(), dur: DUR * 0.6}, {fromTile, off: M.id(), rel: M.id(), dur: DUR * 0.4}, {fromTile, off: M.id(), rel, dur: DUR * 1.5}]
      : [{fromTile, off: st?.off ?? M.id(), rel, dur: DUR * 1.2}]
    anims.push({kind: "move", id: m.id, segs, t0: now(), dur: segs.reduce((x, g) => x + g.dur, 0)})
    if (follow && focus.ws === m.id && !viewAnim) {
      const screen = screenFrame(m.from)
      if (screen) anims.push({kind: "follow", fromTile: m.from, rel, screen, t0: now(), dur: DUR * 1.2})
    }
  }
  kick()
}

function stepAnims() {
  const t = now()
  let any = false
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i]
    const p = Math.min(1, (t - a.t0) / a.dur)
    if (a.kind === "follow") {
      // Keep the focused workspace still on screen; slide the plane under it.
      view.root = a.fromTile
      view.R = M.compose(a.screen, M.inv(lerpFrame(M.id(), a.rel, ease(p))))
    }
    if (p >= 1) anims.splice(i, 1)
    any = true
  }
  return any
}

let raf = 0
function kick() { dirty = true; if (!raf) raf = requestAnimationFrame(frame) }
function frame() {
  raf = 0
  const a = stepView()
  const b = stepAnims()
  if (dirty || a || b) draw()
  dirty = false
  if (a || b || viewAnim || anims.length) kick()
}

function later(fn, ms) {
  const id = setTimeout(() => { timers.delete(id); fn() }, ms)
  timers.add(id)
}

let loggedCenter = 0
function report(what, r) {
  const center = r.state.anchor !== loggedCenter ? `, center moved to tile ${r.state.anchor}` : ""
  loggedCenter = r.state.anchor
  log(`${what}: moved ${r.moves.length}${center}, pieces ${components(T, r.state).length}, tiles ${r.state.ws.map((w) => w.tile).join(",")}`)
}

// Every tile is a workspace. The first window on an empty tile makes it part of
// the group; off on its own, it slides over to the nearest tile touching the
// group, and the view follows it.
function openWindow() {
  const tile = focusTile()
  if (tile === null) return
  const w = S.ws.find((x) => x.tile === tile)
  if (w) {
    S = {...S, ws: S.ws.map((x) => (x.id === w.id ? {...x, wins: x.wins + 1} : x))}
    log(`open a window, now a ${wsLabel({wins: w.wins + 1})}`)
    kick()
    return
  }
  const r = openWorkspace(T, S, tile)
  S = {...r.state, ws: r.state.ws.map((x) => (x.id === r.added.id ? {...x, wins: 1} : x))}
  focus = {ws: r.added.id}
  report(`open the first window on tile ${tile}`, r)
  applyMoves(r.moves)
}

function closeWindow(all = false) {
  const w = focusedWs()
  if (!w) return
  const n = all ? 0 : w.wins - 1
  log(`close ${all ? "all windows" : "a window"} in a ${wsLabel(w)} (${n} left)`)
  if (n > 0) { S = {...S, ws: S.ws.map((x) => (x.id === w.id ? {...x, wins: n} : x))}; kick(); return }
  doRemove(S.ws.indexOf(w))
}

function enter(tile) {
  const F = screenFrame(tile)
  const w = S.ws.find((x) => x.tile === tile) ?? null
  active = tile
  anims.push({kind: "enter", w, label: tileLabel(tile), F: F ?? M.id(), t0: now(), dur: DUR * 3})
  log(`entered ${tileLabel(tile)}`)
  kick()
}

// Every way a workspace loses its last window ends here. The tile stays where
// it is, now empty; a piece it cut off slides back.
function doRemove(idx) {
  const r = removeWorkspace(T, S, idx)
  anims.push({kind: "fade", w: r.removed, tile: r.removed.tile, t0: now(), dur: DUR})
  if (focus.ws === r.removed.id) focus = {tile: r.removed.tile}
  S = r.state
  report("close the last window in a workspace", r)
  applyMoves(r.moves)
}

let lastMove = null
function neighborMove(dirAngle) {
  const from = focusTile() ?? S.anchor
  const t = now()
  const opposite = lastMove && lastMove.to === from && Math.abs(wrapAngle(dirAngle - lastMove.dir - Math.PI)) < 0.1
  const quick = lastMove && t - lastMove.t < +opt.backMs
  if (opposite && (opt.back === "always" || (opt.back === "quick" && quick))) {
    log(`arrow: opposite of last move, going back to tile ${lastMove.from}`)
    lastMove = {from, to: lastMove.from, dir: dirAngle, t}
    goTo(lastMove.to)
    return
  }
  // Measure against the tiles as drawn this frame, mid-animation included, so a
  // pending upright rotation can't flip the directions.
  const base = screenFrame(from) ?? M.id()
  const c = M.center(base)
  const tt = T.tiles[from], nb = T.neighbors(from)
  let best = -1, err = 9
  for (let k = 0; k < 4; k++) {
    const z = M.center(M.compose(base, T.rel[k][tt.tw[k]]))
    const e = Math.abs(wrapAngle(Math.atan2(z[1] - c[1], z[0] - c[0]) - dirAngle))
    if (e < err) { err = e; best = nb[k] }
  }
  log(`arrow: visual neighbor tile ${best}`)
  lastMove = {from, to: best, dir: dirAngle, t}
  goTo(best)
}

function listMove(delta) {
  if (!S.ws.length) return
  const i = focus.ws !== undefined ? S.ws.findIndex((w) => w.id === focus.ws) : -1
  const j = i < 0 ? 0 : Math.max(0, Math.min(S.ws.length - 1, i + delta))
  goTo(S.ws[j].tile)
}

function goHome() {
  log(`center: back to tile ${S.anchor}`)
  goTo(S.anchor, {upright: true})
}

// n workspaces with windows, each on the free tile touching the group nearest the center.
function build(n) {
  for (const id of timers) clearTimeout(id)
  timers.clear()
  S = emptyState(); view.root = 0; view.R = M.id(); anims.length = 0; viewAnim = null; lastMove = null
  for (let i = 0; i < n; i++) {
    const r = openWorkspace(T, S, nearestFree(T, S))
    S = {...r.state, ws: r.state.ws.map((x) => (x.id === r.added.id ? {...x, wins: 1 + ((x.id * 7) % 3)} : x))}
  }
  active = S.anchor
  loggedCenter = S.anchor
  focus = S.ws.length ? {ws: S.ws[0].id} : {tile: S.anchor}
  kick()
}
const reset = () => build(1)

const RUN = {
  openWindow, closeWindow: () => closeWindow(false), closeAll: () => closeWindow(true), reset, center: goHome,
  enterFocused: () => { const t = focusTile(); if (t !== null) enter(t) },
  fill12: () => build(12),
  scCloseCenter: () => {
    build(12)
    later(() => { setFocusTile(S.anchor); closeWindow(true) }, 400)
  },
}

// Input.
let drag = null
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId)
  const z = toDisk(e.offsetX, e.offsetY)
  const hit = C.abs2(z) < 1 ? hitTest(z) : null
  const occ = hit !== null ? wsAtTile().get(hit) : null
  const rotate = e.button === 2
  const move = !rotate && MOVE_KEYS[opt.moveMod].every((k) => e[k])
  drag = {x: e.clientX, y: e.clientY, last: z, start: z, startTile: hit, moved: false, rotate, ws: null, hover: null, frame: null, candidate: move ? occ?.w.id ?? null : null}
})
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return
  const p = toDisk(e.offsetX, e.offsetY)
  if (drag.ws !== null) {
    const clamp = (z) => { const r = Math.sqrt(C.abs2(z)); return r > 0.98 ? C.scale(z, 0.98 / r) : z }
    const z = clamp(p)
    drag.frame = M.compose(M.to(z), M.rot(M.split(drag.frame).alpha))
    const hover = hitTest(z)
    if (hover !== drag.hover) {
      drag.from = hover === null ? null : entryFrom(hover, drag.lastZ ?? z)
      drag.hover = hover
      drag.preview = hover === null ? null : dropWorkspace(T, S, drag.ws, hover, drag.from)
    }
    drag.lastZ = z
    drag.moved = true
    kick()
    return
  }
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true
  if (!drag.moved) return
  if (drag.candidate !== null) {
    drag.ws = drag.candidate
    drag.hover = drag.startTile
    drag.frame = M.compose(M.to(drag.start), M.rot(M.split(screenFrame(drag.startTile)).alpha))
    log(`picked up a ${wsLabel(S.ws.find((w) => w.id === drag.ws))}`)
    kick()
    return
  }
  const clamp = (z) => { const r = Math.sqrt(C.abs2(z)); return r > 0.95 ? C.scale(z, 0.95 / r) : z }
  viewAnim = null
  if (drag.rotate) {
    const da = Math.atan2(p[1], p[0]) - Math.atan2(drag.last[1], drag.last[0])
    view.R = M.compose(M.rot(da), view.R)
  } else {
    view.R = M.compose(M.compose(M.to(clamp(p)), M.inv(M.to(clamp(drag.last)))), view.R)
  }
  rebase()
  drag.last = p
  kick()
})
canvas.addEventListener("pointerup", (e) => {
  const d = drag
  drag = null
  if (!d) return
  if (d.ws !== null) { drop(d); return }
  if (d.moved) {
    if (opt.snap === "on") { rebase(); goTo(view.root) }
    return
  }
  const z = toDisk(e.offsetX, e.offsetY)
  if (C.abs2(z) >= 1) return
  const hit = hitTest(z)
  if (hit === null) return
  const centered = !viewAnim && focusTile() === hit && C.abs2(M.center(screenFrame(hit))) < 1e-6
  if (centered) enter(hit)
  else goTo(hit)
})
canvas.addEventListener("contextmenu", (e) => e.preventDefault())
canvas.addEventListener("wheel", (e) => { e.preventDefault(); view.R = M.compose(M.rot(-e.deltaY * 0.003), view.R); kick() }, {passive: false})

// Neighbor of `tile` on the side the pointer came from (disk point `z`).
function entryFrom(tile, z) {
  const F = screenFrame(tile)
  if (!F) return null
  const loc = M.apply(M.inv(F), z)
  const tt = T.tiles[tile], nb = T.neighbors(tile)
  let best = null, bd = Infinity
  for (let k = 0; k < 4; k++) {
    const c = M.center(T.rel[k][tt.tw[k]])
    const d = Math.atan2(c[1], c[0]) - Math.atan2(loc[1], loc[0])
    const e = Math.abs(wrapAngle(d))
    if (e < bd) { bd = e; best = nb[k] }
  }
  return best
}

function drop(d) {
  const w = S.ws.find((x) => x.id === d.ws)
  const target = d.hover ?? w.tile
  const r = d.hover !== null && d.preview ? d.preview : dropWorkspace(T, S, w.id, target, d.from ?? null)
  const base = screenFrame(target)
  const starts = new Map()
  if (base) starts.set(w.id, {tile: target, off: M.compose(M.inv(base), d.frame)})
  if (!r.moves.some((m) => m.id === w.id)) r.moves.push({id: w.id, from: w.tile, to: w.tile})
  S = r.state
  report(`drop a ${wsLabel(w)} on tile ${target}${r.chain.length ? ` (insert, pushed ${r.chain.length})` : ""}`, r)
  applyMoves(r.moves, {follow: false, starts})
}

function hitTest(z) {
  for (const [id, F] of visCache ?? visible()) {
    if (T.insideLocal(M.apply(M.inv(F), z))) return id
  }
  return null
}

window.addEventListener("keydown", (e) => {
  const dirs = {ArrowRight: 0, ArrowUp: Math.PI / 2, ArrowLeft: Math.PI, ArrowDown: -Math.PI / 2}
  if (e.key in dirs) { e.preventDefault(); neighborMove(dirs[e.key]) }
  else if (e.key === "PageDown") { e.preventDefault(); listMove(1) }
  else if (e.key === "PageUp") { e.preventDefault(); listMove(-1) }
  else if (e.key === "Home") { e.preventDefault(); goHome() }
  else if (e.key === "Enter") RUN.enterFocused()
  else if (e.key === "o") openWindow()
  else if (e.key === "c") closeWindow(false)
  else if (e.key === "x" || e.key === "Delete") closeWindow(true)
})

for (const el of document.querySelectorAll("[data-opt]")) {
  const k = el.dataset.opt
  for (const [v, label] of Object.entries(OPTIONS[k])) {
    const b = document.createElement("button")
    b.textContent = label
    b.dataset.v = v
    b.onclick = () => { opt[k] = v; syncPanel(); kick() }
    el.appendChild(b)
  }
}
function syncPanel() {
  for (const el of document.querySelectorAll("[data-opt]"))
    for (const b of el.children) b.classList.toggle("on", opt[el.dataset.opt] === b.dataset.v)
}
for (const b of document.querySelectorAll("[data-run]")) b.onclick = () => RUN[b.dataset.run]()
syncPanel()

window.app = {
  run: (k) => RUN[k](),
  set: (k, v) => { opt[k] = v; syncPanel(); kick() },
  goTo, goHome, T, M, view, build,
  get S() { return S }, get focus() { return focus },
  screenOf: (tile) => { const F = screenFrame(tile); return F && toScreen(M.center(F)) },
  setFocus: (id) => { focus = {ws: id} },
  idle: () => !viewAnim && anims.length === 0 && timers.size === 0,
  redraw: () => { draw() },
  pieces: () => components(T, S).length,
  get drag() { return drag },
}

resize()
reset()
