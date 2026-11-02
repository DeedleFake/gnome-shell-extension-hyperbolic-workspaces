const {M, C, Tiling, lerpFrame, wrapAngle, emptyState, openWorkspace, nearestFree, removeWorkspace, moveWindow, dropWorkspace, components} = Hyper

const OPTIONS = {
  orient: {drift: "Drift", after: "Upright after move", blend: "Upright during move"},
  back: {visual: "Always visual direction", quick: "Opposite goes back if pressed right away", always: "Opposite always goes back"},
  backMs: {300: "300 ms", 600: "600 ms", 1000: "1000 ms"},
  snap: {on: "On", off: "Off"},
  moveMod: {shift: "Shift", alt: "Alt", ctrl: "Ctrl", ctrlalt: "Ctrl+Alt"},
}
const opt = {orient: "after", back: "visual", backMs: "600", snap: "on", moveMod: "shift"}
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
// A workspace's content frame is its tile's frame turned by `down` quarter
// turns (see openWorkspace); windows and the screen area are drawn in it. An
// empty tile has no content and uses its own frame.
const cq = (down) => M.rot(((down ?? 0) * Math.PI) / 2)
const content = (F, w) => M.compose(F, cq(w?.down))
const QUARTER = Math.PI / 2
const nearestQ = (alpha) => ((Math.round(alpha / QUARTER) % 4) + 4) % 4
// The edge of `tile` drawn nearest the bottom of the screen right now, as a
// down: a workspace started there looks upright.
function screenDown(tile) {
  const F = screenFrame(tile)
  return F ? nearestQ(-M.split(F).alpha) : 0
}
function rectPoly(u0, v0, u1, v1, n = 8) {
  const pts = []
  const edge = (a, b) => { for (let i = 0; i < n; i++) { const t = i / n; pts.push(T.local(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) } }
  edge([u0, v0], [u1, v0]); edge([u1, v0], [u1, v1]); edge([u1, v1], [u0, v1]); edge([u0, v1], [u0, v0])
  return pts
}
const VMAX = 0.96 * ASPECT * 1.7
const screenPoly = rectPoly(-0.96, -VMAX, 0.96, VMAX, 10)
// A window is {id, u, v, w, h, shade}: its top-left corner (u, v) and size in
// workspace content coordinates. A workspace's `windows` run bottom to top.
let nextWin = 1
function newWindow() {
  const id = nextWin++
  let seed = id * 9301 + 49297
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const w = 0.5 + rnd() * 0.8, h = 0.35 + rnd() * 0.5
  return {id, w, h, u: -0.9 + rnd() * (1.8 - w), v: VMAX - 0.12 - rnd() * (2 * VMAX - h - 0.2), shade: 200 + Math.floor(rnd() * 50)}
}
const BAR = 0.09
// A slot is where the overview draws a window: {u, v, w, h} like a window's
// own geometry, in its workspace's content coordinates.
const shapeCache = new WeakMap()
function slotShape(slot) {
  if (!shapeCache.has(slot)) shapeCache.set(slot, {body: rectPoly(slot.u, slot.v - slot.h, slot.u + slot.w, slot.v), bar: rectPoly(slot.u, slot.v - BAR, slot.u + slot.w, slot.v, 6)})
  return shapeCache.get(slot)
}
const lerpSlot = (a, b, t) => ({u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t})

// The overview spreads a workspace's windows out so none overlap, like GNOME
// Shell 51's UnalignedLayoutStrategy (js/ui/workspace.js): rows filled in
// order of window height on screen, each row in order of x, one scale for
// the whole layout capped at WINDOW_PREVIEW_MAXIMUM_SCALE, rows centered.
// It works in GNOME's y-down space: y = -v. Spacing and padding are content
// units (the screen area is 1.92 wide), GNOME's are pixels.
const SPREAD_MAX_SCALE = 0.95, SPREAD_SPACING = 0.06, SPREAD_PAD = 0.08
const SCALE_WEIGHT = 1, SPACE_WEIGHT = 0.1
const spreadCache = new Map()
function spreadSlots(windows) {
  const key = windows.map((w) => `${w.id}:${w.u},${w.v},${w.w},${w.h}`).sort().join(" ")
  if (spreadCache.has(key)) return spreadCache.get(key)
  if (spreadCache.size > 2000) spreadCache.clear()
  const area = {x: -0.96 + SPREAD_PAD, y: -VMAX + SPREAD_PAD, width: 1.92 - 2 * SPREAD_PAD, height: 2 * VMAX - 2 * SPREAD_PAD}
  // Windows in creation order, as GNOME sorts by stable sequence.
  const wins = [...windows].sort((a, b) => a.id - b.id).map((w) => ({w, bw: w.w, bh: w.h, cx: w.u + w.w / 2, cy: -w.v + w.h / 2}))
  // Short windows are bumped up to 1.5x so they don't end up tiny.
  const winScale = (x) => 1.5 + (1 - 1.5) * (x.bh / (2 * VMAX))
  const sp = SPREAD_SPACING

  function computeLayout(numRows) {
    const idealRowWidth = wins.reduce((t, x) => t + x.bw * winScale(x), 0) / numRows
    const sorted = [...wins].sort((a, b) => a.cy - b.cy)
    const rows = []
    let i = 0
    for (let r = 0; r < numRows; r++) {
      const row = {fullWidth: 0, fullHeight: 0, windows: []}
      rows.push(row)
      for (; i < sorted.length; i++) {
        const x = sorted[i], s = winScale(x), width = x.bw * s
        row.fullHeight = Math.max(row.fullHeight, x.bh * s)
        const keep = row.fullWidth + width <= idealRowWidth ||
          Math.abs(1 - (row.fullWidth + width) / idealRowWidth) < Math.abs(1 - row.fullWidth / idealRowWidth)
        if (!keep && r !== numRows - 1) break
        row.windows.push(x)
        row.fullWidth += width
      }
    }
    let maxRow = null, gridHeight = 0
    for (const row of rows) {
      row.windows.sort((a, b) => a.cx - b.cx)
      if (!maxRow || row.fullWidth > maxRow.fullWidth) maxRow = row
      gridHeight += row.fullHeight
    }
    return {numRows, rows, maxColumns: maxRow.windows.length, gridWidth: maxRow.fullWidth, gridHeight}
  }
  function scaleAndSpace(layout) {
    const hsp = (layout.maxColumns - 1) * sp, vsp = (layout.numRows - 1) * sp
    const scale = Math.min((area.width - hsp) / layout.gridWidth, (area.height - vsp) / layout.gridHeight, SPREAD_MAX_SCALE)
    const space = ((layout.gridWidth * scale + hsp) * (layout.gridHeight * scale + vsp)) / (area.width * area.height)
    layout.scale = scale
    return [scale, space]
  }
  function better(oldScale, oldSpace, scale, space) {
    const spacePower = (space - oldSpace) * SPACE_WEIGHT, scalePower = (scale - oldScale) * SCALE_WEIGHT
    if (scale > oldScale && space > oldSpace) return true
    if (scale > oldScale) return scalePower > spacePower
    if (space > oldSpace) return spacePower > scalePower
    return false
  }

  let layout = null, lastCols = -1, lastScale = 0, lastSpace = 0
  for (let numRows = 1; wins.length; numRows++) {
    const cols = Math.ceil(wins.length / numRows)
    if (cols === lastCols) break
    const l = computeLayout(numRows)
    const [scale, space] = scaleAndSpace(l)
    if (layout && !better(lastScale, lastSpace, scale, space)) break
    layout = l; lastCols = cols; lastScale = scale; lastSpace = space
  }

  const out = new Map()
  if (layout) {
    const {rows, scale} = layout
    for (const row of rows) { row.width = row.fullWidth * scale + (row.windows.length - 1) * sp; row.height = row.fullHeight * scale }
    const heightNoSp = rows.reduce((t, r) => t + r.height, 0), vsp = (rows.length - 1) * sp
    const addV = Math.min(1, (area.height - vsp) / heightNoSp)
    let comp = 0, y = 0
    for (const row of rows) {
      const hsp = (row.windows.length - 1) * sp, widthNoSp = row.width - hsp
      const addH = Math.min(1, (area.width - hsp) / widthNoSp)
      if (addH < addV) { row.add = addH; comp += (addV - addH) * row.height } else row.add = addV
      row.x = area.x + Math.max(area.width - (widthNoSp * row.add + hsp), 0) / 2
      row.y = area.y + Math.max(area.height - (heightNoSp + vsp), 0) / 2 + y
      y += row.height * row.add + sp
    }
    comp /= 2
    for (const row of rows) {
      const rowY = row.y + comp, rowH = row.height * row.add
      let x = row.x
      for (const win of row.windows) {
        let s = scale * winScale(win) * row.add
        const cellW = win.bw * s, cellH = win.bh * s
        s = Math.min(s, SPREAD_MAX_SCALE)
        const w = win.bw * s, h = win.bh * s
        const top = rows.length === 1 ? rowY + (rowH - h) / 2 : rowY + rowH - cellH
        out.set(win.w.id, {u: x + (cellW - w) / 2, v: -top, w, h})
        x += cellW + sp
      }
    }
  }
  spreadCache.set(key, out)
  return out
}

// The slots drawn now for workspace `w`. When its spread changes (a window
// opens, closes or moves in or out), windows glide to their new slots over
// GNOME's 200 ms; a new window appears in place.
const RELAYOUT_MS = 200
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t)
const shown = new Map()
function overviewSlots(w) {
  const target = spreadSlots(w.windows), t = now()
  const s = shown.get(w.id)
  if (!s) { shown.set(w.id, {target, from: null, t0: 0}); return target }
  if (s.target !== target) {
    shown.set(w.id, {target, from: slotsAt(s, t), t0: t})
    anims.push({kind: "relayout", t0: t, dur: RELAYOUT_MS})
    kick()
  }
  return slotsAt(shown.get(w.id), t)
}
function slotsAt(s, t) {
  const p = (t - s.t0) / RELAYOUT_MS
  if (!s.from || p >= 1) return s.target
  const e = easeOutQuad(Math.max(0, p)), out = new Map()
  for (const [id, b] of s.target) { const a = s.from.get(id); out.set(id, a ? lerpSlot(a, b, e) : b) }
  return out
}

function resize() {
  const r = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = r.width * dpr
  canvas.height = r.height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  W = r.width; H = r.height
  R = Math.min(W, H) / 2 - 26
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

// Screen angle of any tile, however far. Composes the steps up the creation
// tree from the view tile to the common ancestor and back down to `tile`.
// Matrices aren't renormalised (|a|^2 - |b|^2 cancels to noise far out); a
// positive rescale each step keeps them finite and leaves the angle exact.
function screenAngle(tile) {
  const near = screenFrame(tile)
  let F = near
  if (!F) {
    const step = (t) => T.rel[T.tiles[t].pk][T.tiles[T.tiles[t].parent].tw[T.tiles[t].pk]]
    const up = new Map()
    for (let t = view.root; t !== -1; t = T.tiles[t].parent) up.set(t, up.size)
    const down = []
    let lca = tile
    for (; !up.has(lca); lca = T.tiles[lca].parent) down.push(lca)
    const mul = (f, g) => {
      const a = C.add(C.mul(f.a, g.a), C.mul(f.b, C.conj(g.b))), b = C.add(C.mul(f.a, g.b), C.mul(f.b, C.conj(g.a)))
      const k = 1 / Math.sqrt(C.abs2(a))
      return {a: C.scale(a, k), b: C.scale(b, k)}
    }
    F = view.R
    for (let t = view.root; t !== lca; t = T.tiles[t].parent) F = mul(F, M.inv(step(t)))
    for (let i = down.length - 1; i >= 0; i--) F = mul(F, step(down[i]))
  }
  const z = M.center(F)
  return Math.atan2(z[1], z[0])
}

// The rim arrow toward the group aims for full opacity once the group's largest
// workspace is drawn at four rings' size (scale 0.06), where window contents
// stop being drawn, and for none at three rings' size (0.15). The shown opacity
// eases toward that over RIM_FADE_MS, so a fast slide doesn't make it pop.
const RIM_SHOW = 0.06, RIM_HIDE = 0.15, RIM_FADE_MS = 200
let rim = null
function groupIndicator(vis) {
  let s = 0
  for (const w of S.ws) { const F = vis.get(w.tile); if (F) s = Math.max(s, 1 - C.abs2(M.center(F))) }
  const target = S.ws.length ? Math.max(0, Math.min(1, (RIM_HIDE - s) / (RIM_HIDE - RIM_SHOW))) : 0
  const t = now(), prev = rim ?? {alpha: 0, t}
  const k = Math.min(1, (t - prev.t) / RIM_FADE_MS)
  const alpha = target > prev.alpha ? Math.min(target, prev.alpha + k) : Math.max(target, prev.alpha - k)
  const angle = alpha > 0 && S.ws.length ? screenAngle(S.anchor) : prev.angle ?? null
  return {alpha, target, angle, size: s, t}
}
function drawRim(ind) {
  if (!ind || ind.alpha <= 0) return
  const u = [Math.cos(ind.angle), -Math.sin(ind.angle)], v = [-u[1], u[0]]
  const at = (r, side) => [cx + u[0] * r + v[0] * side, cy + u[1] * r + v[1] * side]
  ctx.globalAlpha = ind.alpha
  ctx.beginPath(); ctx.arc(cx, cy, R, -ind.angle - 0.12, -ind.angle + 0.12); ctx.lineWidth = 3; ctx.strokeStyle = "#ffd36b"; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(...at(R + 20, 0)); ctx.lineTo(...at(R + 5, -9)); ctx.lineTo(...at(R + 5, 9)); ctx.closePath()
  ctx.fillStyle = "#ffd36b"; ctx.fill()
  ctx.globalAlpha = 1
}

function wsAtTile() {
  const m = new Map()
  S.ws.forEach((w, i) => m.set(w.tile, {w, i}))
  return m
}

const showsWindows = (F) => (1 - C.abs2(M.center(F))) * R > 25
function drawWorkspace(F, w, alpha) {
  ctx.globalAlpha = alpha
  const hue = (w.id * 67) % 360
  path(F, boundary)
  ctx.fillStyle = `hsl(${hue} 35% 22%)`
  ctx.fill()
  path(F, screenPoly)
  ctx.fillStyle = `hsl(${hue} 45% 34%)`
  ctx.fill()
  if (showsWindows(F)) {
    const slots = overviewSlots(w)
    for (const win of w.windows) {
      if (win.id === drag?.win?.id) continue
      const {body, bar} = slotShape(slots.get(win.id))
      path(F, body); ctx.fillStyle = `rgb(${win.shade},${win.shade},${win.shade + 5})`; ctx.fill()
      path(F, bar); ctx.fillStyle = "#2a2f37"; ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

// A move is a list of segments, each from a content frame to another, both
// relative to `fromTile`'s frame. A segment with `rigid` moves the workspace
// with its whole piece: every member follows the same partial slide G^e (in
// the piece root's frame), so the piece keeps its shape every frame and never
// turns about a point. Its down edge rides G, so `turn` (the leftover spin onto
// the new content frame) is 0 up to rounding.
function segRel(seg, e) {
  if (!seg.rigid) return lerpFrame(seg.off, seg.rel, e)
  const {Fu, G, turn} = seg.rigid
  return M.compose(M.compose(M.inv(Fu), M.slidePow(G, e)), M.compose(Fu, M.compose(seg.off, M.rot(turn * e))))
}
function animFrame(a, t) {
  let el = t - a.t0, seg = a.segs.at(-1), p = 1
  for (const sg of a.segs) { if (el <= sg.dur) { seg = sg; p = el / sg.dur; break } el -= sg.dur }
  const base = screenFrame(seg.fromTile)
  return base && M.compose(base, segRel(seg, ease(p)))
}

// Path of a slide from `fromTile` with down q0 to `to` with down q1: rigid
// with its piece when `via` starts there, else straight along the line
// between the two centers (a one-tile push is exactly that slide).
function slideSeg(fromTile, q0, to, q1, via, dur) {
  const off = cq(q0), rel = M.compose(T.relFrame(fromTile, to, DRAW_DEPTH) ?? M.id(), cq(q1))
  const Fu = via && via.from === fromTile && T.relFrame(via.root, fromTile, DRAW_DEPTH)
  if (!Fu) return {fromTile, off, rel, dur}
  const D = M.compose(M.compose(M.inv(Fu), M.compose(via.G, Fu)), off)
  return {fromTile, off, rel, dur, rigid: {Fu, G: via.G, turn: wrapAngle(M.split(M.compose(M.inv(D), rel)).alpha)}}
}

function draw() {
  const t0 = now()
  if (desk?.phase === "on") { drawDesk({x: 0, y: 0, w: W, h: H}); return }
  ctx.fillStyle = "#05080c"
  ctx.fillRect(0, 0, W, H)
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fillStyle = "#0b1118"; ctx.fill()
  const vis = visible()
  const pv = drag?.ws && drag.preview
  // While a drag hovers, the plane shows the layout a drop would leave.
  const occ = pv ? new Map(pv.state.ws.map((w) => [w.tile, {w: {...S.ws.find((x) => x.id === w.id), down: w.down}}])) : wsAtTile()
  const hidden = new Set(anims.filter((a) => a.kind === "move").map((a) => a.id))
  if (drag?.ws) hidden.add(drag.ws)
  const near = reach()
  for (const [id, F] of vis) {
    const o = occ.get(id)
    if (o && !hidden.has(o.w.id)) drawWorkspace(content(F, o.w), o.w, pv && pv.moves.some((m) => m.id === o.w.id) ? 0.6 : 1)
    path(F, boundary)
    ctx.lineWidth = 1
    ctx.strokeStyle = near.has(id) ? "#3f5873" : "#2a3a4c"
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
      if (F) drawWorkspace(content(F, a.w), a.w, 1 - p)
    }
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
      const pw = pv.state.ws.find((x) => x.id === drag.ws), end = pw.tile
      const Fe = vis.get(end)
      if (Fe) {
        drawWorkspace(content(Fe, pw), S.ws.find((x) => x.id === drag.ws), 0.35)
        path(Fe, boundary); ctx.lineWidth = 3; ctx.strokeStyle = "#8be28b"; ctx.stroke()
      }
    }
    if (hover) { ctx.setLineDash([6, 4]); path(hover, boundary); ctx.lineWidth = 2.5; ctx.strokeStyle = "#ffd36b"; ctx.stroke(); ctx.setLineDash([]) }
    const w = S.ws.find((x) => x.id === drag.ws)
    drawWorkspace(drag.frame, w, 0.85)
  }
  if (drag?.win) {
    const hover = drag.hover !== null ? vis.get(drag.hover) : null
    if (hover) { ctx.setLineDash([6, 4]); path(hover, boundary); ctx.lineWidth = 2.5; ctx.strokeStyle = "#ffd36b"; ctx.stroke(); ctx.setLineDash([]) }
    const poly = (pts) => { ctx.beginPath(); for (const [x, y] of pts) ctx.lineTo(x + drag.dx, y + drag.dy); ctx.closePath() }
    ctx.globalAlpha = 0.85
    poly(drag.win.pts); ctx.fillStyle = `rgb(${drag.win.shade},${drag.win.shade},${drag.win.shade + 5})`; ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = "#ffd36b"; ctx.stroke()
    poly(drag.win.bar); ctx.fillStyle = "#2a2f37"; ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.lineWidth = 1; ctx.strokeStyle = "#3b4d61"; ctx.stroke()
  rim = groupIndicator(vis)
  drawRim(rim)
  if (rim.alpha !== rim.target) kick()
  if (desk) drawDesk(deskRect())
  const dt = now() - t0
  frameTimes.push(dt); if (frameTimes.length > 60) frameTimes.shift()
  const avg = frameTimes.reduce((x, y) => x + y, 0) / frameTimes.length
  const alpha = fF ? M.split(content(fF, wsAtTile().get(fTile)?.w)).alpha : 0
  document.getElementById("status").textContent =
    `workspaces with windows ${S.ws.length}  pieces ${components(T, S).length}\n` +
    `tiles drawn ${vis.size}  generated ${T.count}  view tile ${view.root}\n` +
    `draw ${dt.toFixed(1)} ms (avg ${avg.toFixed(1)})\n` +
    `active ${active === null ? "none" : tileLabel(active)}\n` +
    `focus ${focusLabel()}  rotation ${Math.round(wrapAngle(alpha) * 180 / Math.PI)} deg`
  window.__stats = {drawMs: dt, avgMs: avg, tiles: vis.size, generated: T.count, prunes: T.prunes ?? 0, root: view.root, R: view.R}
}

// The entered workspace drawn as a desktop filling rect r. Content
// coordinates map linearly onto it. Windows sit at their real places once
// entered and glide between those and their overview slots while zooming.
function deskLayout(r) {
  const X = (u) => r.x + (u + 0.96) / 1.92 * r.w, Y = (v) => r.y + (VMAX - v) / (2 * VMAX) * r.h
  const w = S.ws.find((x) => x.tile === desk.tile)
  const q = deskProgress(), slots = q < 1 && w ? spreadSlots(w.windows) : null
  return (w?.windows ?? []).map((win) => {
    const g = slots ? lerpSlot(slots.get(win.id), win, q) : win
    const x = X(g.u), y = Y(g.v), wd = X(g.u + g.w) - x, ht = Y(g.v - g.h) - y, bar = Y(g.v - BAR) - y
    return {win, x, y, w: wd, h: ht, bar, close: {x: x + wd - bar, y, w: bar, h: bar}}
  })
}
const DESK_BUTTONS = [{run: "leave", label: "Overview"}, {run: "open", label: "+ Window"}]
const deskButtons = () => DESK_BUTTONS.map((b, i) => ({...b, x: W - 124 * (i + 1), y: 12, w: 112, h: 34}))
const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

function drawDesk(r) {
  const w = S.ws.find((x) => x.tile === desk.tile)
  const k = r.h / H
  ctx.save()
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip()
  ctx.fillStyle = w ? `hsl(${(w.id * 67) % 360} 45% 34%)` : "#1a2532"
  ctx.fillRect(r.x, r.y, r.w, r.h)
  const wins = deskLayout(r)
  if (!wins.length) {
    ctx.font = `600 ${Math.max(8, 28 * k)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillText("No windows", r.x + r.w / 2, r.y + r.h / 2)
  }
  wins.forEach((b, i) => {
    const top = i === wins.length - 1, sh = b.win.shade
    ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 18 * k
    ctx.fillStyle = `rgb(${sh},${sh},${sh + 5})`; ctx.fillRect(b.x, b.y, b.w, b.h)
    ctx.shadowBlur = 0
    ctx.fillStyle = top ? "#2f4f78" : "#2a2f37"; ctx.fillRect(b.x, b.y, b.w, b.bar)
    ctx.fillStyle = "#c94f4f"; ctx.fillRect(b.close.x + b.bar * 0.2, b.close.y + b.bar * 0.2, b.bar * 0.6, b.bar * 0.6)
    ctx.font = `${Math.max(6, b.bar * 0.42)}px system-ui`; ctx.textBaseline = "middle"
    ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText("×", b.close.x + b.bar / 2, b.close.y + b.bar / 2)
    ctx.textAlign = "left"; ctx.fillStyle = "#e6edf5"; ctx.fillText(`Window ${b.win.id}`, b.x + b.bar * 0.35, b.y + b.bar / 2)
    if (top) {
      ctx.lineWidth = desk.phase === "in" && desk.picked === b.win.id ? 4 : 2
      ctx.strokeStyle = desk.phase === "in" && desk.picked === b.win.id ? "#ffd36b" : "#7fb6ff"
      ctx.strokeRect(b.x, b.y, b.w, b.h)
    }
  })
  if (desk.phase === "on")
    for (const b of deskButtons()) {
      ctx.fillStyle = "rgba(13,19,27,.85)"; ctx.fillRect(b.x, b.y, b.w, b.h)
      ctx.lineWidth = 1; ctx.strokeStyle = "#4b8ad6"; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1)
      ctx.font = "13px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#d8e2ee"
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2)
    }
  ctx.restore()
}

// Screen rect of a tile's content area as drawn now.
function tileRect(tile) {
  const F = screenFrame(tile)
  if (!F) return {x: W / 2 - 20, y: H / 2 - 12, w: 40, h: 24}
  const Fc = content(F, wsAtTile().get(tile)?.w)
  const pts = screenPoly.map((pt) => toScreen(M.apply(Fc, pt)))
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x = Math.min(...xs), y = Math.min(...ys)
  return {x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y}
}
// Zooming in grows the tile's rect to the whole canvas; zooming out shrinks it
// back onto wherever the tile is drawn now.
// How far the zoom is toward the desktop: 0 is the overview, 1 the desktop.
function deskProgress() {
  if (desk.phase === "on") return 1
  const p = ease(Math.min(1, (now() - desk.t0) / desk.dur))
  return desk.phase === "in" ? p : 1 - p
}
function deskRect() {
  const full = {x: 0, y: 0, w: W, h: H}
  if (desk.phase === "on") return full
  const a = desk.phase === "in" ? desk.from : tileRect(desk.tile), q = deskProgress()
  return {x: a.x + (full.x - a.x) * q, y: a.y + (full.y - a.y) * q, w: a.w + (full.w - a.w) * q, h: a.h + (full.h - a.h) * q}
}

function focusTile() {
  if (focus.ws !== undefined) {
    const w = S.ws.find((x) => x.id === focus.ws)
    return w ? w.tile : null
  }
  return focus.tile
}
const wsLabel = (w) => `workspace with ${w.windows.length} window${w.windows.length === 1 ? "" : "s"}`
function tileLabel(tile) {
  const w = S.ws.find((x) => x.tile === tile)
  return w ? wsLabel(w) : "empty workspace"
}
const focusLabel = () => { const t = focusTile(); return t === null ? "none" : tileLabel(t) }
// Tiles whose windows take clicks: the focused one and every tile sharing an
// edge or a corner with it.
const CORNERS = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([u, v]) => T.local(u, v))
const reachCache = new Map()
function reach() {
  const f = focusTile()
  if (f === null) return new Set()
  if (!reachCache.has(f)) {
    const near = (a, b) => C.abs2(C.add(a, C.scale(b, -1))) < 1e-9
    const out = new Set()
    for (const [t, {F}] of T.frames(f, 2)) if (CORNERS.some((c) => CORNERS.some((d) => near(M.apply(F, d), c)))) out.add(t)
    reachCache.set(f, out)
  }
  return reachCache.get(f)
}
const focusedWs = () => S.ws.find((x) => x.id === focus.ws) ?? null

function setFocusTile(tile) {
  const w = S.ws.find((x) => x.tile === tile)
  focus = w ? {ws: w.id} : {tile}
}

// Animate the view so `tile` ends at the center. A tile too far away to draw
// from here is brought in from just past the disk edge.
function goTo(tile, {upright = false} = {}) {
  let F0 = screenFrame(tile)
  if (!F0) {
    const a = screenAngle(tile)
    F0 = M.to([0.97 * Math.cos(a), 0.97 * Math.sin(a)])
    log(`jump: tile ${tile} is out of drawing range, sliding it in from the edge it lies past`)
  }
  const c = M.center(F0)
  const drift = M.compose(M.inv(M.to(c)), F0)
  const d = M.dist0(F0)
  const dur = DUR * Math.min(2, 0.75 + 0.25 * d / (2 * T.rE))
  const orient = upright ? "blend" : opt.orient
  // Upright puts the workspace's down edge at the bottom of the screen.
  const up = M.inv(cq(wsAtTile().get(tile)?.w.down))
  let phases
  if (orient === "drift") phases = [{from: F0, to: drift, dur, rot: false}]
  else if (orient === "blend") phases = [{from: F0, to: up, dur, rot: true}]
  else phases = [{from: F0, to: drift, dur, rot: false}, {from: drift, to: up, dur: DUR * 0.7, rot: true}]
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
// Each move animates the motion its down edge rode (m.down is [old, new]): a
// push one tile on, then its piece's slide when it has one (`via`, starting
// at via.from with down via.down). A dropped workspace (in `starts`) first
// settles from where it was let go onto its landing tile's nearest edge.
function applyMoves(moves, {follow = true, starts = new Map()} = {}) {
  for (const m of moves) {
    const st = starts.get(m.id)
    const fromTile = st?.tile ?? m.from
    const [q0, q1] = m.down
    const viaQ = m.via?.down ?? q1
    // A drop away from the group lands on its tile first, then slides back.
    const segs = st && fromTile !== m.to
      ? [{fromTile, off: st.off, rel: cq(st.down), dur: DUR * 0.6}, {fromTile, off: cq(st.down), rel: cq(st.down), dur: DUR * 0.4}, slideSeg(fromTile, st.down, m.to, q1, m.via, DUR * 1.5)]
      : st ? [{fromTile, off: st.off, rel: M.compose(T.relFrame(fromTile, m.to, DRAW_DEPTH) ?? M.id(), cq(q1)), dur: DUR * 1.2}]
      : m.via && m.via.from !== m.from ? [slideSeg(m.from, q0, m.via.from, viaQ, null, DUR * 0.6), slideSeg(m.via.from, viaQ, m.to, q1, m.via, DUR * 1.2)]
      : [slideSeg(m.from, q0, m.to, q1, m.via, DUR * 1.2)]
    anims.push({kind: "move", id: m.id, segs, t0: now(), dur: segs.reduce((x, g) => x + g.dur, 0)})
    if (follow && focus.ws === m.id && !viewAnim) {
      const screen = screenFrame(m.from) && M.compose(screenFrame(m.from), cq(q0))
      if (screen) anims.push({kind: "follow", fromTile: m.from, seg: segs[0], screen, t0: now(), dur: DUR * 1.2})
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
      view.R = M.compose(a.screen, M.inv(segRel(a.seg, ease(p))))
    }
    if (p >= 1) { anims.splice(i, 1); a.done?.() }
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
  else if (!drag && !desk) prune()
}

// Free tiles nobody can see or reach, once nothing is moving. Everything that
// holds a tile is pinned: the center (with the ball the fill order reads), the
// view (with what it draws), each workspace and the tiles around it, and the
// focus and last-move tiles. Anything cached by tile is dropped with them.
function prune() {
  const pins = [[S.anchor, 6], [view.root, DRAW_DEPTH + 1], ...S.ws.map((w) => [w.tile, 2])]
  for (const t of [focus.tile, active, lastMove?.from, lastMove?.to]) if (t !== undefined && t !== null) pins.push([t, 2])
  if (T.maybePrune(pins)) { reachCache.clear(); visCache = null }
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
  if (desk) { if (desk.phase === "on") deskOpen(); return }
  const tile = focusTile()
  if (tile === null) return
  const w = S.ws.find((x) => x.tile === tile)
  if (w) {
    S = {...S, ws: S.ws.map((x) => (x.id === w.id ? {...x, windows: [...x.windows, newWindow()]} : x))}
    log(`open a window, now a ${wsLabel({windows: [...w.windows, null]})}`)
    kick()
    return
  }
  const r = openWorkspace(T, S, tile, screenDown(tile))
  S = {...r.state, ws: r.state.ws.map((x) => (x.id === r.added.id ? {...x, windows: [newWindow()]} : x))}
  focus = {ws: r.added.id}
  report(`open the first window on tile ${tile}`, r)
  applyMoves(r.moves)
}

function closeWindow(all = false) {
  if (desk) {
    const w = S.ws.find((x) => x.tile === desk.tile)
    if (desk.phase === "on" && w?.windows.length) for (const v of all ? [...w.windows] : [w.windows.at(-1)]) deskClose(v.id)
    return
  }
  const w = focusedWs()
  if (!w) return
  const n = all ? 0 : w.windows.length - 1
  log(`close ${all ? "all windows" : "a window"} in a ${wsLabel(w)} (${n} left)`)
  if (n > 0) { S = {...S, ws: S.ws.map((x) => (x.id === w.id ? {...x, windows: x.windows.slice(0, n)} : x))}; kick(); return }
  doRemove(S.ws.indexOf(w))
}

// The entered workspace: its tile, the zoom in flight ("in", "out") or "on",
// and the window picked to enter it. While entered, its workspace stays in the
// state even with no windows; leaving applies the usual close or open rules.
let desk = null
let deskDrag = null

// Enter `tile`; `win` is the window clicked to pick it (its index and screen
// outline), or null to keep the workspace's focused window.
function enter(tile, win = null) {
  if (desk) return
  const from = tileRect(tile)
  const w = S.ws.find((x) => x.tile === tile)
  if (win && w) raise(w.id, win.id)
  active = tile
  if (tile !== focusTile()) goTo(tile)
  desk = {tile, phase: "in", t0: now(), dur: DUR * 1.5, from, picked: win?.id ?? null, pickedIndex: win ? win.i : null, added: null}
  anims.push({kind: "desk", t0: desk.t0, dur: desk.dur, done: () => { desk.phase = "on" }})
  log(`entered ${tileLabel(tile)}${win ? `, focused window ${win.i + 1} of ${win.n}` : ""}`)
  kick()
}

function leave() {
  if (desk?.phase !== "on") return
  deskDrag = null
  setFocusTile(desk.tile)
  Object.assign(desk, {phase: "out", t0: now()})
  anims.push({kind: "desk", t0: desk.t0, dur: desk.dur, done: () => { const {tile, added} = desk; desk = null; settleDesk(tile, added) }})
  log(`back to the overview from ${tileLabel(desk.tile)}`)
  kick()
}

// Apply what was held back while entered: an emptied workspace closes; one
// opened on an empty tile joins the group like any first window.
function settleDesk(tile, added) {
  const i = S.ws.findIndex((x) => x.tile === tile)
  if (i < 0) return
  const w = S.ws[i]
  if (!w.windows.length) { doRemove(i); return }
  if (w.id !== added) return
  const r = openWorkspace(T, {...S, ws: S.ws.filter((x) => x !== w), nextId: w.id}, tile, w.down)
  S = {...r.state, nextId: S.nextId, ws: r.state.ws.map((x) => (x.id === w.id ? {...x, windows: w.windows} : x))}
  focus = {ws: w.id}
  report(`open the first window on tile ${tile}`, r)
  applyMoves(r.moves)
}

function setWindows(id, fn) {
  S = {...S, ws: S.ws.map((x) => (x.id === id ? {...x, windows: fn(x.windows)} : x))}
  kick()
}
function raise(wsId, winId) {
  setWindows(wsId, (ws) => [...ws.filter((v) => v.id !== winId), ws.find((v) => v.id === winId)])
}
function deskOpen() {
  const w = S.ws.find((x) => x.tile === desk.tile)
  if (w) { setWindows(w.id, (ws) => [...ws, newWindow()]); log(`open a window, now a ${wsLabel(S.ws.find((x) => x.id === w.id))}`); return }
  desk.added = S.nextId
  S = {...S, ws: [...S.ws, {id: S.nextId, tile: desk.tile, down: screenDown(desk.tile), windows: [newWindow()]}], nextId: S.nextId + 1}
  log(`open the first window on tile ${desk.tile}; it joins the group when you leave`)
  kick()
}
function deskClose(winId) {
  const w = S.ws.find((x) => x.tile === desk.tile)
  if (!w) return
  setWindows(w.id, (ws) => ws.filter((v) => v.id !== winId))
  log(`close window ${winId}, ${S.ws.find((x) => x.id === w.id).windows.length} left`)
}

function deskDown(e) {
  if (desk.phase !== "on") return
  const x = e.offsetX, y = e.offsetY
  const b = deskButtons().find((r) => inRect(r, x, y))
  if (b) { if (b.run === "leave") leave(); else deskOpen(); return }
  const hit = deskLayout({x: 0, y: 0, w: W, h: H}).findLast((r) => inRect(r, x, y))
  if (!hit) return
  const w = S.ws.find((v) => v.tile === desk.tile)
  if (inRect(hit.close, x, y)) { deskClose(hit.win.id); return }
  raise(w.id, hit.win.id)
  if (y < hit.y + hit.bar) deskDrag = {ws: w.id, id: hit.win.id, x, y, u: hit.win.u, v: hit.win.v}
}
function deskMove(e) {
  if (!deskDrag) return
  const d = deskDrag
  setWindows(d.ws, (ws) => ws.map((v) => {
    if (v.id !== d.id) return v
    const u = d.u + (e.offsetX - d.x) / W * 1.92, nv = d.v - (e.offsetY - d.y) / H * 2 * VMAX
    return {...v, u: Math.max(-0.96 - v.w + 0.1, Math.min(0.86, u)), v: Math.max(-VMAX + BAR, Math.min(VMAX, nv))}
  }))
}

// Screen outlines of the windows drawn in `tile`, bottom to top.
function windowOutlines(tile) {
  const F = (visCache ?? visible()).get(tile), w = wsAtTile().get(tile)?.w
  if (!F || !w || !showsWindows(F)) return []
  const Fc = content(F, w), slots = overviewSlots(w)
  return w.windows.map((win, i) => {
    const {body, bar} = slotShape(slots.get(win.id))
    return {i, n: w.windows.length, id: win.id, ws: w.id, shade: win.shade, pts: body.map((pt) => toScreen(M.apply(Fc, pt))), bar: bar.map((pt) => toScreen(M.apply(Fc, pt)))}
  })
}
function windowAt(tile, x, y) {
  const inside = (pts) => {
    let c = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j]
      if ((yi > y) !== (yj > y) && x < xi + (xj - xi) * (y - yi) / (yj - yi)) c = !c
    }
    return c
  }
  return windowOutlines(tile).findLast((o) => inside(o.pts)) ?? null
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
  // Tile 0 may have been freed; the origin never is.
  S = emptyState(T.origin); nextWin = 1; shown.clear(); desk = null; deskDrag = null; view.root = T.origin; view.R = M.id(); anims.length = 0; viewAnim = null; lastMove = null
  for (let i = 0; i < n; i++) {
    const tile = nearestFree(T, S)
    const r = openWorkspace(T, S, tile, screenDown(tile))
    S = {...r.state, ws: r.state.ws.map((x) => (x.id === r.added.id ? {...x, windows: Array.from({length: 1 + ((x.id * 7) % 3)}, newWindow)} : x))}
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
  if (desk) { deskDown(e); return }
  const z = toDisk(e.offsetX, e.offsetY)
  const hit = C.abs2(z) < 1 ? hitTest(z) : null
  const occ = hit !== null ? wsAtTile().get(hit) : null
  const rotate = e.button === 2
  const move = !rotate && MOVE_KEYS[opt.moveMod].every((k) => e[k])
  const grab = !move && !rotate && hit !== null && reach().has(hit) ? windowAt(hit, e.offsetX, e.offsetY) : null
  drag = {x: e.clientX, y: e.clientY, ox: e.offsetX, oy: e.offsetY, last: z, start: z, startTile: hit, moved: false, rotate, ws: null, hover: null, frame: null, candidate: move ? occ?.w.id ?? null : null, grab, win: null}
})
canvas.addEventListener("pointermove", (e) => {
  if (desk) { deskMove(e); return }
  if (!drag) return
  const p = toDisk(e.offsetX, e.offsetY)
  if (drag.ws !== null) {
    const clamp = (z) => { const r = Math.sqrt(C.abs2(z)); return r > 0.98 ? C.scale(z, 0.98 / r) : z }
    const z = clamp(p)
    const hover = hitTest(z)
    if (hover !== drag.hover) {
      drag.from = hover === null ? null : entryFrom(hover, drag.lastZ ?? z)
      drag.hover = hover
      drag.preview = hover === null ? null : dropWorkspace(T, S, drag.ws, hover, drag.from)
    }
    // Over a tile it is drawn as it will land there, slid off to the pointer:
    // releasing only slides it home, with no turn.
    const land = hover === null ? null : drag.preview?.landedDown ?? S.ws.find((w) => w.id === drag.ws).down
    const F = land === null ? null : screenFrame(hover)
    drag.frame = F ? slideTo(M.compose(F, cq(land)), z) : M.compose(M.to(z), M.rot(M.split(drag.frame).alpha))
    drag.lastZ = z
    drag.moved = true
    kick()
    return
  }
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true
  if (!drag.moved) return
  if (drag.grab) {
    drag.win = drag.grab
    drag.dx = e.offsetX - drag.ox; drag.dy = e.offsetY - drag.oy
    drag.hover = C.abs2(p) < 1 ? hitTest(p) : null
    kick()
    return
  }
  if (drag.candidate !== null) {
    drag.ws = drag.candidate
    drag.hover = drag.startTile
    drag.frame = M.compose(M.to(drag.start), M.rot(M.split(content(screenFrame(drag.startTile), S.ws.find((w) => w.id === drag.ws))).alpha))
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
  if (desk) { deskDrag = null; return }
  const d = drag
  drag = null
  if (!d) return
  if (d.ws !== null) { drop(d); return }
  if (d.win) { dropWindow(d); return }
  if (d.moved) {
    if (opt.snap === "on") { rebase(); goTo(view.root) }
    return
  }
  const z = toDisk(e.offsetX, e.offsetY)
  if (C.abs2(z) >= 1) {
    // The rim arrow leads back to the center.
    if (rim?.alpha > 0.5 && Math.abs(wrapAngle(Math.atan2(z[1], z[0]) - rim.angle)) < 0.15 && C.abs2(z) < 1.2) goHome()
    return
  }
  const hit = hitTest(z)
  if (hit === null) return
  const win = reach().has(hit) ? windowAt(hit, e.offsetX, e.offsetY) : null
  if (win || hit === focusTile()) enter(hit, win)
  else goTo(hit)
})
canvas.addEventListener("contextmenu", (e) => e.preventDefault())
canvas.addEventListener("wheel", (e) => { e.preventDefault(); if (desk) return; view.R = M.compose(M.rot(-e.deltaY * 0.003), view.R); kick() }, {passive: false})

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

// Frame F moved along the line from its center to disk point z, so it ends
// centered on z with no turn of its own.
function slideTo(F, z) {
  const A = M.to(M.center(F))
  return M.compose(M.compose(M.compose(A, M.to(M.apply(M.inv(A), z))), M.inv(A)), F)
}

function drop(d) {
  const w = S.ws.find((x) => x.id === d.ws)
  const target = d.hover ?? w.tile
  const r = d.hover !== null && d.preview ? d.preview : dropWorkspace(T, S, w.id, target, d.from ?? null)
  const base = screenFrame(target)
  const starts = new Map()
  if (base) starts.set(w.id, {tile: target, down: r.landedDown, off: M.compose(M.inv(base), d.frame)})
  if (!r.moves.some((m) => m.id === w.id)) r.moves.push({id: w.id, from: w.tile, to: w.tile, down: [w.down, w.down]})
  S = r.state
  report(`drop a ${wsLabel(w)} on tile ${target}${r.chain.length ? ` (insert, pushed ${r.chain.length})` : ""}`, r)
  applyMoves(r.moves, {follow: false, starts})
}

function dropWindow(d) {
  const src = S.ws.find((x) => x.id === d.win.ws), target = d.hover
  if (!src || target === null || target === src.tile) { kick(); return }
  const win = src.windows.find((x) => x.id === d.win.id)
  const occupant = S.ws.find((x) => x.tile === target)
  // The window keeps its place in content coordinates, so it lies in the
  // target's flat space, square to the target's down edge.
  const r = moveWindow(T, S, src.id, target, src.windows.length === 1, screenDown(target))
  const dest = occupant?.id ?? r.added.id
  S = {...r.state, ws: r.state.ws.map((x) => (x.id === src.id ? {...x, windows: x.windows.filter((v) => v !== win)} : x.id === dest ? {...x, windows: [...(x.windows ?? []), win]} : x))}
  if (r.removed) {
    anims.push({kind: "fade", w: {...r.removed, windows: []}, tile: r.removed.tile, t0: now(), dur: DUR})
    if (focus.ws === r.removed.id) focus = {tile: r.removed.tile}
  }
  report(`move a window to ${occupant ? "a workspace" : "an empty tile"} on tile ${target}${r.removed ? ", its last" : ""}`, r)
  applyMoves(r.moves)
}

function hitTest(z) {
  for (const [id, F] of visCache ?? visible()) {
    if (T.insideLocal(M.apply(M.inv(F), z))) return id
  }
  return null
}

window.addEventListener("keydown", (e) => {
  if (desk) {
    if (e.key === "Escape") leave()
    else if (e.key === "o") openWindow()
    else if (e.key === "c") closeWindow(false)
    return
  }
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
  idle: () => !viewAnim && anims.length === 0 && timers.size === 0 && (!rim || rim.alpha === rim.target),
  redraw: () => { draw() },
  pieces: () => components(T, S).length,
  windows: () => S.ws.map((w) => ({id: w.id, tile: w.tile, down: w.down, wins: w.windows.map((x) => x.id)})),
  // Screen content frame of a workspace as drawn now, moving or not.
  contentFrame: (id) => { const a = anims.find((x) => x.kind === "move" && x.id === id); if (a) return animFrame(a, now()); const w = S.ws.find((x) => x.id === id), F = w && screenFrame(w.tile); return F && content(F, w) },
  get drag() { return drag },
  get rim() { return rim },
  screenAngle,
  windowOutlines,
  reach: () => [...reach()],
  tileAt: (x, y) => hitTest(toDisk(x, y)),
  enters: () => (desk?.phase === "in" ? [{tile: desk.tile, win: desk.pickedIndex}] : []),
  get desk() { return desk && {tile: desk.tile, phase: desk.phase, picked: desk.picked, added: desk.added} },
  deskLayout: () => (desk ? deskLayout(deskRect()).map(({win, x, y, w, h, bar, close}) => ({id: win.id, u: win.u, v: win.v, x, y, w, h, bar, close})) : []),
  deskButtons,
  get deskRect() { return desk && deskRect() },
  spreadSlots: (id) => { const w = S.ws.find((x) => x.id === id); return w ? [...spreadSlots(w.windows)].map(([wid, g]) => ({id: wid, ...g})) : [] },
  movingFrames: () => anims.filter((a) => a.kind === "move").map((a) => ({id: a.id, F: animFrame(a, now())})),
}

resize()
reset()
