const {M, C, Tiling, lerpFrame, wrapAngle, FILL_ORDERS, REMOVAL_POLICIES, emptyState, addWorkspace, removeWorkspace, settle, metrics, fillSequence} = Hyper

const OPTIONS = {
  order: {distance: "Hyperbolic distance", rings: "Edge rings"},
  policy: {list: "Linear list", shorter: "Shorter side", plug: "Plug, recenter", plugKeep: "Plug, center fixed"},
  orient: {drift: "Drift", after: "Upright after move", blend: "Upright during move"},
  settleMode: {immediate: "After a pause", leave: "When you leave it", never: "Never"},
  snap: {on: "On", off: "Off"},
  back: {on: "On", off: "Off"},
}
const opt = {order: "distance", policy: "plugKeep", orient: "blend", settleMode: "leave", snap: "on", back: "on"}
const params = new URLSearchParams(location.search)
for (const k of Object.keys(opt)) if (params.has(k)) opt[k] = params.get(k)
const DUR = +(params.get("dur") ?? 300)

const T = new Tiling(4, 5)
const canvas = document.getElementById("c")
const ctx = canvas.getContext("2d")
let W = 0, H = 0, R = 0, cx = 0, cy = 0

let S = emptyState()
let V = M.id()
let focus = {tile: 0}
let viewRoot = 0
const anims = [] // {kind, ...}
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

// Precomputed local geometry (central tile).
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
const screenPoly = rectPoly(-0.96, -0.96 * ASPECT * 1.7, 0.96, 0.96 * ASPECT * 1.7, 10)
const winCache = new Map()
function windowsFor(id) {
  if (winCache.has(id)) return winCache.get(id)
  let seed = id * 9301 + 49297
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const n = 1 + Math.floor(rnd() * 3)
  const wins = []
  const vmax = 0.96 * ASPECT * 1.7
  for (let i = 0; i < n; i++) {
    const w = 0.5 + rnd() * 0.8, h = 0.35 + rnd() * 0.5
    const u0 = -0.9 + rnd() * (1.8 - w), v1 = vmax - 0.12 - rnd() * (2 * vmax - h - 0.2)
    const body = rectPoly(u0, v1 - h, u0 + w, v1)
    const bar = rectPoly(u0, v1 - 0.09, u0 + w, v1, 6)
    wins.push({body, bar, shade: 200 + Math.floor(rnd() * 50)})
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

function visibleTiles() {
  // Walk the root toward the view center, then flood outward.
  for (;;) {
    let best = viewRoot, bd = C.abs2(M.center(M.compose(V, T.tiles[viewRoot].M)))
    for (const n of T.neighbors(viewRoot)) {
      const d = C.abs2(M.center(M.compose(V, T.tiles[n].M)))
      if (d < bd) { bd = d; best = n }
    }
    if (best === viewRoot) break
    viewRoot = best
  }
  const seen = new Set([viewRoot])
  const out = [viewRoot]
  for (let i = 0; i < out.length && out.length < 3000; i++)
    for (const n of T.neighbors(out[i])) {
      if (seen.has(n)) continue
      seen.add(n)
      const z = M.center(M.compose(V, T.tiles[n].M))
      if (C.abs2(z) < 0.997 * 0.997) out.push(n)
    }
  return out
}

function wsAtTile() {
  const m = new Map()
  S.ws.forEach((w, i) => m.set(w.tile, {w, i}))
  return m
}

function drawWorkspace(F, w, index, alpha) {
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
    for (const win of windowsFor(w.id)) {
      path(F, win.body); ctx.fillStyle = `rgb(${win.shade},${win.shade},${win.shade + 5})`; ctx.fill()
      path(F, win.bar); ctx.fillStyle = "#2a2f37"; ctx.fill()
    }
  const fs = R * scale * 0.22
  if (fs > 6) {
    const [x, y] = toScreen(M.center(F))
    ctx.font = `600 ${fs}px system-ui`
    ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.lineWidth = fs * 0.12; ctx.strokeStyle = "rgba(0,0,0,.7)"
    ctx.strokeText(String(index + 1), x, y)
    ctx.fillStyle = "#fff"; ctx.fillText(String(index + 1), x, y)
  }
  ctx.globalAlpha = 1
}

function draw() {
  const t0 = now()
  ctx.fillStyle = "#05080c"
  ctx.fillRect(0, 0, W, H)
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fillStyle = "#0b1118"; ctx.fill()
  const tiles = visibleTiles()
  const occ = wsAtTile()
  const moving = new Set(anims.filter((a) => a.kind === "move").map((a) => a.id))
  const nextFill = S.ws.length ? fillSequence(T, S.anchor, opt.order, 1, new Set(S.ws.map((w) => w.tile)))[0] : S.anchor
  for (const id of tiles) {
    const F = M.compose(V, T.tiles[id].M)
    const o = occ.get(id)
    if (o && !moving.has(o.w.id)) drawWorkspace(F, o.w, o.i, o.w.far ? 0.85 : 1)
    path(F, boundary)
    ctx.lineWidth = 1
    ctx.strokeStyle = "#2a3a4c"
    ctx.stroke()
    if (!o && id === nextFill) {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = "#5f7d9c"; ctx.lineWidth = 1.5; path(F, boundary); ctx.stroke(); ctx.setLineDash([])
    }
  }
  const t = now()
  for (const a of anims) {
    const p = Math.min(1, (t - a.t0) / a.dur)
    if (a.kind === "move") {
      const w = S.ws.find((x) => x.id === a.id)
      if (!w) continue
      drawWorkspace(M.compose(V, lerpFrame(a.from, a.to, ease(p))), w, S.ws.indexOf(w), 1)
    } else if (a.kind === "fade") {
      drawWorkspace(M.compose(V, a.at), a.w, a.index, 1 - p)
    }
  }
  // Focus ring.
  const fTile = focusTile()
  if (fTile !== null) {
    path(M.compose(V, T.tiles[fTile].M), boundary)
    ctx.lineWidth = 3; ctx.strokeStyle = "#7fb6ff"; ctx.stroke()
  }
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.lineWidth = 1; ctx.strokeStyle = "#3b4d61"; ctx.stroke()
  const dt = now() - t0
  frameTimes.push(dt); if (frameTimes.length > 60) frameTimes.shift()
  const avg = frameTimes.reduce((x, y) => x + y, 0) / frameTimes.length
  const {alpha} = fTile !== null ? M.split(M.compose(V, T.tiles[fTile].M)) : {alpha: 0}
  const m = metrics(T, S, opt.order)
  document.getElementById("status").textContent =
    `workspaces ${m.n}  radius ${m.radius}  excess ${m.excess}\n` +
    `tiles drawn ${tiles.length}  generated ${T.tiles.length}\n` +
    `draw ${dt.toFixed(1)} ms (avg ${avg.toFixed(1)})\n` +
    `focus ${focusLabel()}  rotation ${Math.round(wrapAngle(alpha) * 180 / Math.PI)} deg`
  window.__stats = {drawMs: dt, avgMs: avg, tiles: tiles.length, generated: T.tiles.length}
}

function focusTile() {
  if (focus.ws !== undefined) {
    const w = S.ws.find((x) => x.id === focus.ws)
    return w ? w.tile : null
  }
  return focus.tile
}
function focusLabel() {
  if (focus.ws !== undefined) {
    const i = S.ws.findIndex((x) => x.id === focus.ws)
    return i >= 0 ? `workspace ${i + 1}` : "none"
  }
  return `empty tile ${focus.tile}`
}

function setFocusTile(tile) {
  const prev = focus.ws !== undefined ? S.ws.find((x) => x.id === focus.ws) : null
  const w = S.ws.find((x) => x.tile === tile)
  focus = w ? {ws: w.id} : {tile}
  if (prev && prev.far && prev.id !== focus.ws && opt.settleMode === "leave") later(() => doSettle(prev.id), DUR)
}

// Animate the view so `tile` ends at the center.
function goTo(tile, durScale = 1) {
  const Mt = T.tiles[tile].M
  const F0 = M.compose(V, Mt)
  const c = M.center(F0)
  const drift = M.compose(M.inv(M.to(c)), F0)
  const d = M.dist0(F0)
  const dur = DUR * durScale * Math.min(2, 0.75 + 0.25 * d / (2 * T.rE))
  if (opt.orient === "drift") viewAnim = {Mt, phases: [{from: F0, to: drift, dur, rot: false}]}
  else if (opt.orient === "blend") viewAnim = {Mt, phases: [{from: F0, to: M.id(), dur, rot: true}]}
  else viewAnim = {Mt, phases: [{from: F0, to: drift, dur, rot: false}, {from: drift, to: M.id(), dur: DUR * 0.7, rot: true}]}
  viewAnim.t0 = now()
  setFocusTile(tile)
  kick()
}

function stepView() {
  if (!viewAnim) return false
  let t = now() - viewAnim.t0
  for (const ph of viewAnim.phases) {
    if (t <= ph.dur) {
      const p = ease(t / ph.dur)
      V = M.compose(lerpFrame(ph.from, ph.to, p, ph.rot ? p : 0), M.inv(viewAnim.Mt))
      return true
    }
    t -= ph.dur
  }
  const last = viewAnim.phases.at(-1)
  V = M.compose(last.to, M.inv(viewAnim.Mt))
  viewAnim = null
  return true
}

function applyMoves(moves, follow = true) {
  for (const m of moves) {
    anims.push({kind: "move", id: m.id, from: T.tiles[m.from].M, to: T.tiles[m.to].M, t0: now(), dur: DUR * 1.2})
    if (follow && focus.ws === m.id) {
      // Keep the focused workspace still on screen; slide the plane under it.
      const Fscreen = M.compose(V, T.tiles[m.from].M)
      anims.push({kind: "follow", id: m.id, from: T.tiles[m.from].M, to: T.tiles[m.to].M, screen: Fscreen, t0: now(), dur: DUR * 1.2})
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
    if (a.kind === "follow") V = M.compose(a.screen, M.inv(lerpFrame(a.from, a.to, ease(p))))
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

function report(what, r) {
  const m = metrics(T, r.state, opt.order, r.moves)
  log(`${what} [${opt.order}/${opt.policy}] moves ${m.moves}, moved ${m.moved}, radius ${m.radius}, excess ${m.excess}, tiles ${r.state.ws.map((w) => w.tile).join(",")}`)
}

function doAdd(at = null, focusIt = false) {
  const r = addWorkspace(T, S, opt.order, at)
  S = r.state
  anims.push({kind: "fade", w: r.added, index: S.ws.length - 1, at: T.tiles[r.added.tile].M, t0: now(), dur: 1})
  report(at === null ? "add" : `create far out at tile ${at}`, r)
  if (focusIt) goTo(r.added.tile)
  if (at !== null && opt.settleMode === "immediate") later(() => doSettle(r.added.id), 700)
  kick()
  return r.added
}

function doSettle(id) {
  if (opt.settleMode === "never") return
  const r = settle(T, S, opt.order, id)
  S = r.state
  if (r.moves.length) { report("settle", r); applyMoves(r.moves) }
  kick()
}

function doRemove(idx) {
  if (idx < 0 || idx >= S.ws.length) return
  const wasFocused = focus.ws === S.ws[idx].id
  const r = removeWorkspace(T, S, opt.order, opt.policy, idx)
  anims.push({kind: "fade", w: r.removed, index: idx, at: T.tiles[r.removed.tile].M, t0: now(), dur: DUR})
  S = r.state
  report(`remove #${idx + 1}`, r)
  if (wasFocused) {
    const hole = r.removed.tile
    const filler = S.ws.find((w) => w.tile === hole)
    const next = filler ?? S.ws[Math.min(idx, S.ws.length - 1)]
    focus = next ? {ws: next.id} : {tile: S.anchor}
    applyMoves(r.moves, false)
    if (next && !filler) later(() => goTo(next.tile), DUR * 0.3)
  } else applyMoves(r.moves)
  kick()
}

let lastMove = null
function neighborMove(dirAngle) {
  const from = focusTile() ?? S.anchor
  // After re-orienting, the tile you came from may no longer sit opposite the
  // arrow you pressed; this makes the opposite arrow go back anyway.
  if (opt.back === "on" && lastMove && lastMove.to === from && Math.abs(wrapAngle(dirAngle - lastMove.dir - Math.PI)) < 0.1) {
    lastMove = {from, to: lastMove.from, dir: dirAngle}
    goTo(lastMove.to)
    return
  }
  let best = -1, err = 9
  for (const n of T.neighbors(from)) {
    const z = M.center(M.compose(V, T.tiles[n].M))
    const e = Math.abs(wrapAngle(Math.atan2(z[1], z[0]) - dirAngle))
    if (e < err) { err = e; best = n }
  }
  lastMove = {from, to: best, dir: dirAngle}
  goTo(best)
}

function listMove(delta) {
  if (!S.ws.length) return
  const i = focus.ws !== undefined ? S.ws.findIndex((w) => w.id === focus.ws) : -1
  const j = i < 0 ? 0 : Math.max(0, Math.min(S.ws.length - 1, i + delta))
  goTo(S.ws[j].tile)
}

function reset() {
  for (const id of timers) clearTimeout(id)
  timers.clear()
  S = emptyState(); V = M.id(); focus = {tile: 0}; viewRoot = 0; anims.length = 0; viewAnim = null
  doAdd(); focus = {ws: S.ws[0].id}
  kick()
}

const RUN = {
  add: () => doAdd(),
  add12: () => { for (let i = 0; i < 12; i++) doAdd() },
  removeFocused: () => doRemove(S.ws.findIndex((w) => w.id === focus.ws)),
  reset,
  scRemoveCenter: () => { reset(); for (let i = 1; i < 12; i++) doAdd(); later(() => doRemove(0), 400) },
  scRemove2: () => { reset(); for (let i = 1; i < 10; i++) doAdd(); later(() => doRemove(1), 400) },
  scFar: () => {
    reset(); for (let i = 1; i < 5; i++) doAdd()
    const far = [...T.rings(S.anchor, 3)].find(([, r]) => r === 3)[0]
    later(() => doAdd(far, true), 300)
  },
}

// Input.
let drag = null
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId)
  drag = {x: e.clientX, y: e.clientY, last: toDisk(e.offsetX, e.offsetY), moved: false, rotate: e.shiftKey || e.button === 2}
  viewAnim = null
})
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true
  if (!drag.moved) return
  const p = toDisk(e.offsetX, e.offsetY)
  const clamp = (z) => { const r = Math.sqrt(C.abs2(z)); return r > 0.95 ? C.scale(z, 0.95 / r) : z }
  if (drag.rotate) {
    const da = Math.atan2(p[1], p[0]) - Math.atan2(drag.last[1], drag.last[0])
    V = M.compose(M.rot(da), V)
  } else {
    V = M.compose(M.compose(M.to(clamp(p)), M.inv(M.to(clamp(drag.last)))), V)
  }
  drag.last = p
  kick()
})
canvas.addEventListener("pointerup", (e) => {
  const d = drag
  drag = null
  if (!d) return
  if (d.moved) {
    if (opt.snap === "on") { visibleTiles(); goTo(viewRoot) }
    return
  }
  const z = toDisk(e.offsetX, e.offsetY)
  if (C.abs2(z) >= 1) return
  const hit = hitTest(z)
  if (hit === null) return
  const occ = wsAtTile().get(hit)
  if (occ) goTo(hit)
  else doAdd(hit === nextFillTile() ? null : hit, true)
})
canvas.addEventListener("contextmenu", (e) => e.preventDefault())
canvas.addEventListener("wheel", (e) => { e.preventDefault(); V = M.compose(M.rot(-e.deltaY * 0.003), V); kick() }, {passive: false})

function nextFillTile() {
  return fillSequence(T, S.anchor, opt.order, 1, new Set(S.ws.map((w) => w.tile)))[0]
}

// Clicks go through the inverse map: find the tile whose local square contains the point.
function hitTest(z) {
  for (const id of visibleTiles()) {
    const local = M.apply(M.inv(M.compose(V, T.tiles[id].M)), z)
    if (T.insideLocal(local)) return id
  }
  return null
}

window.addEventListener("keydown", (e) => {
  const dirs = {ArrowRight: 0, ArrowUp: Math.PI / 2, ArrowLeft: Math.PI, ArrowDown: -Math.PI / 2}
  if (e.key in dirs) { e.preventDefault(); neighborMove(dirs[e.key]) }
  else if (e.key === "PageDown") { e.preventDefault(); listMove(1) }
  else if (e.key === "PageUp") { e.preventDefault(); listMove(-1) }
  else if (e.key === "a") doAdd()
  else if (e.key === "x" || e.key === "Delete") RUN.removeFocused()
})

// Panel.
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
  remove: (i) => doRemove(i),
  addAt: (tile, focusIt = true) => doAdd(tile, focusIt),
  goTo, T, M, get S() { return S }, get V() { return V }, setV: (v) => { V = v; kick() },
  idle: () => !viewAnim && anims.length === 0 && timers.size === 0,
  redraw: () => { draw() },
}

resize()
reset()
