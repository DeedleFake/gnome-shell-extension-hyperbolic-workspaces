// Throwaway math and placement logic for the hyperbolic workspaces prototype.
// Points are [re, im] in the Poincaré disk, math orientation (im up).
// A Möbius map in SU(1,1) is {a, b}: z -> (a z + b) / (conj(b) z + conj(a)).
// Classic script (not an ES module) so index.html works from file://.
(function (root) {
const C = {
  mul: (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]],
  add: (x, y) => [x[0] + y[0], x[1] + y[1]],
  conj: (x) => [x[0], -x[1]],
  abs2: (x) => x[0] * x[0] + x[1] * x[1],
  div: (x, y) => {
    const d = y[0] * y[0] + y[1] * y[1]
    return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d]
  },
  scale: (x, s) => [x[0] * s, x[1] * s],
  expi: (t) => [Math.cos(t), Math.sin(t)],
}

const M = {
  id: () => ({a: [1, 0], b: [0, 0]}),
  rot: (t) => ({a: C.expi(t / 2), b: [0, 0]}),
  // Translation along the geodesic through 0 that sends 0 to c.
  to: (c) => {
    const k = 1 / Math.sqrt(1 - C.abs2(c))
    return {a: [k, 0], b: C.scale(c, k)}
  },
  compose: (f, g) => M.norm({
    a: C.add(C.mul(f.a, g.a), C.mul(f.b, C.conj(g.b))),
    b: C.add(C.mul(f.a, g.b), C.mul(f.b, C.conj(g.a))),
  }),
  inv: (f) => ({a: C.conj(f.a), b: C.scale(f.b, -1)}),
  apply: (f, z) => C.div(C.add(C.mul(f.a, z), f.b), C.add(C.mul(C.conj(f.b), z), C.conj(f.a))),
  // Renormalise so |a|^2 - |b|^2 = 1; keeps rounding drift from accumulating.
  norm: (f) => {
    const k = 1 / Math.sqrt(C.abs2(f.a) - C.abs2(f.b))
    return {a: C.scale(f.a, k), b: C.scale(f.b, k)}
  },
  center: (f) => C.div(f.b, C.conj(f.a)),
  // f = to(p) ∘ rot(alpha)
  split: (f) => {
    const p = M.center(f)
    const r = M.compose(M.inv(M.to(p)), f)
    return {p, alpha: 2 * Math.atan2(r.a[1], r.a[0])}
  },
  // Hyperbolic distance from 0 to f(0); stable far from the origin.
  dist0: (f) => Math.acosh(Math.max(1, 2 * C.abs2(f.a) - 1)),
  // Hyperboloid x/y of f(0), used as a lookup key.
  hyperXY: (f) => C.scale(C.mul(f.a, f.b), 2),
}

const wrapAngle = (t) => Math.atan2(Math.sin(t), Math.cos(t))

// Frame along the geodesic from frame F0 to F1, t in [0,1]. The center moves on
// the geodesic; rotation interpolates by rotT (defaults to t).
function lerpFrame(F0, F1, t, rotT = t) {
  const D = M.compose(M.inv(F0), F1)
  const {p, alpha} = M.split(D)
  const r = Math.sqrt(C.abs2(p))
  const q = r < 1e-12 ? [0, 0] : C.scale(p, Math.tanh(t * Math.atanh(r)) / r)
  // Rotation that would carry F0's frame by pure transport to q.
  const T = M.to(q)
  const G = M.compose(F0, T)
  // Pure transport along the full geodesic leaves rotation `alpha` relative to F1;
  // interpolate it.
  return M.compose(G, M.rot(wrapAngle(alpha) * rotT))
}

// Tiles are graph nodes with integer identity. Neighbor k of tile t has frame
// frame(t) * rel(k, tw[k]), where rel(k, j) = step[k] * rot(j * 90 deg) comes
// from a fixed table. Positions are only ever composed along short paths from
// a nearby tile, so far-out tiles keep full precision.
class Tiling {
  constructor(p = 4, q = 5, {radialFrames = false} = {}) {
    this.radialFrames = radialFrames
    this.p = p
    this.q = q
    const coshV = 1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q))
    const coshE = Math.cos(Math.PI / q) / Math.sin(Math.PI / p)
    this.rV = Math.acosh(coshV)
    this.rE = Math.acosh(coshE)
    this.kleinHalf = Math.tanh(this.rE) // Klein half-side for p = 4
    this.step = []
    for (let k = 0; k < p; k++) {
      const th = (2 * Math.PI * k) / p
      this.step.push(M.compose(M.compose(M.rot(th), M.to([Math.tanh(this.rE), 0])), M.rot(-th)))
    }
    this.rel = this.step.map((S) => [0, 1, 2, 3].map((j) => M.compose(S, M.rot((j * 2 * Math.PI) / p))))
    this.tiles = [{id: 0, nbr: new Array(p).fill(-1), tw: new Array(p).fill(0), parent: -1, pk: 0}]
    this.frameCache = new Map()
  }
  // Frame of `id` relative to tile 0, along its creation path. Only meaningful
  // near tile 0; kept for the earlier scripts and for radial frames.
  abs(id) {
    let F = M.id()
    for (let t = this.tiles[id]; t.parent !== -1; t = this.tiles[t.parent]) {
      const pt = this.tiles[t.parent]
      F = M.compose(this.rel[t.pk][pt.tw[t.pk]], F)
    }
    return F
  }
  link(t, k, n, j) {
    const back = (((k + 2 - j) % this.p) + this.p) % this.p
    this.tiles[t].nbr[k] = n; this.tiles[t].tw[k] = j
    this.tiles[n].nbr[back] = t; this.tiles[n].tw[back] = (this.p - j) % this.p
  }
  // Existing tiles near `id` by following links only, with frames relative to it.
  localFrames(id, maxDist) {
    const out = new Map([[id, M.id()]])
    const queue = [id]
    for (let i = 0; i < queue.length; i++) {
      const t = this.tiles[queue[i]], F = out.get(queue[i])
      if (M.dist0(F) > maxDist) continue
      for (let k = 0; k < this.p; k++) {
        const n = t.nbr[k]
        if (n === -1 || out.has(n)) continue
        out.set(n, M.compose(F, this.rel[k][t.tw[k]]))
        queue.push(n)
      }
    }
    return out
  }
  neighbors(id) {
    const t = this.tiles[id]
    if (t.nbr.includes(-1)) {
      const near = this.localFrames(id, 5 * this.rE * 2)
      for (let k = 0; k < this.p; k++) {
        if (t.nbr[k] !== -1) continue
        const G = this.step[k]
        let found = -1, j = 0
        for (const [c, F] of near) {
          const D = M.compose(M.inv(G), F)
          if (c !== id && M.dist0(D) < 0.01) {
            found = c
            j = ((Math.round(M.split(D).alpha / ((2 * Math.PI) / this.p)) % this.p) + this.p) % this.p
            break
          }
        }
        if (found === -1) {
          found = this.tiles.length
          this.tiles.push({id: found, nbr: new Array(this.p).fill(-1), tw: new Array(this.p).fill(0), parent: id, pk: k})
          j = 0
          if (this.radialFrames) {
            const {alpha} = M.split(M.compose(this.abs(id), G))
            j = (((-Math.round(alpha / ((2 * Math.PI) / this.p))) % this.p) + this.p) % this.p
          }
        }
        this.link(id, k, found, j)
        near.set(found, M.compose(G, M.rot((j * 2 * Math.PI) / this.p)))
      }
    }
    return t.nbr
  }
  // Frames of every tile within `depth` edge steps of `id`, relative to it.
  frames(id, depth = 6) {
    const key = `${id}:${depth}`
    let out = this.frameCache.get(key)
    if (out) return out
    out = new Map([[id, {F: M.id(), ring: 0}]])
    let frontier = [id]
    for (let d = 1; d <= depth; d++) {
      const next = []
      for (const t of frontier) {
        const nb = this.neighbors(t), F = out.get(t).F
        for (let k = 0; k < this.p; k++)
          if (!out.has(nb[k])) {
            out.set(nb[k], {F: M.compose(F, this.rel[k][this.tiles[t].tw[k]]), ring: d})
            next.push(nb[k])
          }
      }
      frontier = next
    }
    if (this.frameCache.size > 64) this.frameCache.delete(this.frameCache.keys().next().value)
    this.frameCache.set(key, out)
    return out
  }
  // Frame of b relative to a, or null if b is more than `depth` steps away.
  relFrame(a, b, depth = 6) {
    return this.frames(a, depth).get(b)?.F ?? null
  }
  // Breadth-first rings by edge adjacency. Returns Map id -> ring.
  rings(start, depth) {
    const ring = new Map([[start, 0]])
    let frontier = [start]
    for (let d = 1; d <= depth; d++) {
      const next = []
      for (const id of frontier)
        for (const n of this.neighbors(id))
          if (!ring.has(n)) {
            ring.set(n, d)
            next.push(n)
          }
      frontier = next
    }
    return ring
  }
  // Point inside the tile for content coords (u, v) in [-1, 1]^2 (p = 4 only).
  // Uses the Klein model, where the tile is a Euclidean square.
  local(u, v) {
    const k = [u * this.kleinHalf, v * this.kleinHalf]
    const s = 1 + Math.sqrt(1 - C.abs2(k))
    return [k[0] / s, k[1] / s]
  }
  // Is a disk point (already in this tile's local frame) inside the central tile?
  insideLocal(z) {
    const d = 1 + C.abs2(z)
    const k = [(2 * z[0]) / d, (2 * z[1]) / d]
    return Math.abs(k[0]) <= this.kleinHalf && Math.abs(k[1]) <= this.kleinHalf
  }
  // Hyperbolic distance between tile centers; far pairs fall back to ring count.
  dist(a, b) {
    const F = this.relFrame(a, b)
    return F ? M.dist0(F) : 99
  }
}

// Clockwise from screen-right, in the anchor's frame.
function angleKey(T, anchor, id) {
  const F = T.relFrame(anchor, id)
  if (!F) return 0
  const z = M.center(F)
  if (C.abs2(z) < 1e-18) return 0
  let a = -Math.atan2(z[1], z[0])
  if (a < -1e-9) a += 2 * Math.PI
  return Math.round(a * 1e6) / 1e6
}

const rd = (x) => Math.round(x * 1e6) / 1e6

// Fill orders: each returns a sort key (array, compared lexicographically).
const FILL_ORDERS = {
  distance: {
    label: "hyperbolic distance",
    keyer: (T, anchor) => (id) => [rd(T.dist(anchor, id)), angleKey(T, anchor, id)],
  },
  rings: {
    label: "edge rings, then angle",
    keyer: (T, anchor) => {
      const ring = T.rings(anchor, 8)
      return (id) => [ring.get(id) ?? 99, angleKey(T, anchor, id)]
    },
  },
}

const cmp = (x, y) => {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return 0
}

// Tiles near the anchor in fill order. Ring depth grows until enough are found.
function keyerFor(T, anchor, order) {
  T.keyCache ??= new Map()
  const k = `${order}:${anchor}`
  if (!T.keyCache.has(k)) T.keyCache.set(k, FILL_ORDERS[order].keyer(T, anchor))
  return T.keyCache.get(k)
}

function fillSequence(T, anchor, order, count, exclude = new Set()) {
  T.seqCache ??= new Map()
  const k = `${order}:${anchor}`
  let seq = T.seqCache.get(k)
  if (!seq) {
    const keyOf = keyerFor(T, anchor, order)
    seq = [...T.frames(anchor, 6).keys()].map((id) => ({id, k: keyOf(id)})).sort((x, y) => cmp(x.k, y.k)).map((x) => x.id)
    T.seqCache.set(k, seq)
  }
  const out = []
  for (const id of seq) if (!exclude.has(id) && out.push(id) >= count) break
  return out
}

// Placement state: the list order is Mutter's workspace order. The center
// (anchor) starts as the first workspace's tile; policies decide where it goes.
function emptyState() {
  return {anchor: 0, ws: [], nextId: 1}
}

const occupied = (s) => new Set(s.ws.map((w) => w.tile))

function addWorkspace(T, s, order, at = null) {
  const tile = at ?? (s.ws.length === 0 ? s.anchor : fillSequence(T, s.anchor, order, 1, occupied(s))[0])
  const w = {id: s.nextId, tile, far: at !== null}
  const ws = [...s.ws, w]
  return {state: {...s, ws, nextId: s.nextId + 1, anchor: s.ws.length ? s.anchor : tile}, moves: [], added: w}
}

function rankKey(T, s, order) {
  return keyerFor(T, s.anchor, order)
}

// Move a far-out workspace inward if a better free tile exists.
function settle(T, s, order, wsId) {
  const w = s.ws.find((x) => x.id === wsId)
  if (!w) return {state: s, moves: []}
  const occ = occupied(s)
  occ.delete(w.tile)
  const best = fillSequence(T, s.anchor, order, 1, occ)[0]
  const keyOf = rankKey(T, s, order)
  if (best === w.tile || cmp(keyOf(best), keyOf(w.tile)) >= 0)
    return {state: {...s, ws: s.ws.map((x) => (x.id === wsId ? {...x, far: false} : x))}, moves: []}
  const ws = s.ws.map((x) => (x.id === wsId ? {...x, tile: best, far: false} : x))
  return {state: {...s, ws}, moves: [{id: wsId, from: w.tile, to: best}]}
}

// Min-cost assignment of n rows to m >= n columns (Hungarian, O(n^2 m)).
function assign(cost) {
  const n = cost.length, m = cost[0].length
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0)
  const p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(m + 1).fill(Infinity), used = new Array(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity, j1 = 0
      for (let j = 1; j <= m; j++)
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
          if (minv[j] < delta) { delta = minv[j]; j1 = j }
        }
      for (let j = 0; j <= m; j++)
        if (used[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta
      j0 = j1
    } while (p[j0] !== 0)
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1 } while (j0)
  }
  const rowTo = new Array(n)
  for (let j = 1; j <= m; j++) if (p[j]) rowTo[p[j] - 1] = j - 1
  return rowTo
}

function tileDist(T, a, b) {
  T.distCache ??= new Map()
  const k = a < b ? `${a},${b}` : `${b},${a}`
  let d = T.distCache.get(k)
  if (d === undefined) { d = T.dist(a, b); T.distCache.set(k, d) }
  return d
}

// A compact clump of n around `anchor`: every tile closer than the outermost
// distance shell is filled, and the rest sit somewhere on that shell.
function shells(T, anchor, n) {
  if (n === 0) return {inner: [], outer: []}
  const r = rd(tileDist(T, anchor, fillSequence(T, anchor, "distance", n)[n - 1]))
  for (let extra = 24; ; extra *= 2) {
    const seq = fillSequence(T, anchor, "distance", n + extra)
    if (rd(tileDist(T, anchor, seq.at(-1))) > r) {
      const inner = [], outer = []
      for (const id of seq) {
        const d = rd(tileDist(T, anchor, id))
        if (d < r) inner.push(id)
        else if (d === r) outer.push(id)
      }
      return {inner, outer}
    }
  }
}

const MOVE_COST = 0.25
const BIG = 1000

// Settle every workspace into a compact clump around one of `anchors`, moving
// them as little as possible. `pin` = {id, tile, weight} pulls one workspace
// toward a tile (a drop target).
function coalesce(T, s, anchors, pin = null) {
  const n = s.ws.length
  if (n === 0) return finish(s, [], s.anchor)
  let best = null
  for (const A of anchors) {
    const {inner, outer} = shells(T, A, n)
    const cols = [...inner, ...outer]
    const cost = s.ws.map((w) => cols.map((c, j) => {
      let x = c === w.tile ? 0 : tileDist(T, w.tile, c) + MOVE_COST
      if (pin && pin.id === w.id) x = pin.weight * tileDist(T, pin.tile, c) + 0.01 * x
      return x - (j < inner.length ? BIG : 0)
    }))
    const rowTo = assign(cost)
    const total = rowTo.reduce((acc, j, i) => acc + cost[i][j], 0) + BIG * inner.length
    if (!best || total < best.total - 1e-9) best = {total, A, tiles: rowTo.map((j) => cols[j])}
  }
  return finish(s, s.ws.map((w, i) => ({...w, tile: best.tiles[i], far: false})), best.A)
}

const nearAnchors = (T, s, depth = 2) => [...T.rings(s.anchor, depth).keys()]

const REMOVAL_POLICIES = {
  list: {
    label: "linear list (everything after shifts)",
    remove(T, s, order, idx) {
      const rest = s.ws.filter((_, i) => i !== idx)
      const slots = fillSequence(T, s.anchor, order, rest.length)
      const ws = rest.map((w, i) => ({...w, tile: slots[i], far: false}))
      return finish(s, ws, s.anchor)
    },
  },
  plugKeep: {
    label: "plug the hole, center never moves",
    remove(T, s, order, idx) {
      const hole = s.ws[idx].tile
      let ws = s.ws.filter((_, i) => i !== idx)
      if (ws.length === 0) return finish(s, ws, s.anchor)
      const keyOf = rankKey(T, s, order)
      let worst = 0
      for (let i = 1; i < ws.length; i++) if (cmp(keyOf(ws[i].tile), keyOf(ws[worst].tile)) > 0) worst = i
      if (cmp(keyOf(ws[worst].tile), keyOf(hole)) > 0) ws = ws.map((w, i) => (i === worst ? {...w, tile: hole} : w))
      return finish(s, ws, s.anchor)
    },
  },
  recenter: {
    label: "center removed: next in the list becomes the center, the rest settle around it",
    remove(T, s, order, idx) {
      const rest = {...s, ws: s.ws.filter((_, i) => i !== idx)}
      if (!rest.ws.length) return finish(s, [], s.anchor)
      const anchor = s.ws[idx].tile === s.anchor ? rest.ws[Math.min(idx, rest.ws.length - 1)].tile : s.anchor
      const r = coalesce(T, rest, [anchor])
      return finish(s, r.state.ws, r.state.anchor)
    },
  },
  bestFit: {
    label: "least movement, center may shift",
    remove(T, s, order, idx) {
      const rest = {...s, ws: s.ws.filter((_, i) => i !== idx)}
      if (!rest.ws.length) return finish(s, [], s.anchor)
      const r = coalesce(T, rest, nearAnchors(T, s))
      return finish(s, r.state.ws, r.state.anchor)
    },
  },
}

// Drop workspace `id` on `tile`. An occupied tile swaps; anything else
// coalesces the whole clump, pulling the dropped one toward the drop. Only the
// best-fit policy lets the center shift.
function dropWorkspace(T, s, id, tile, policy = "bestFit") {
  const w = s.ws.find((x) => x.id === id)
  const other = s.ws.find((x) => x.tile === tile)
  if (other && other.id === id) return finish(s, s.ws, s.anchor)
  if (other) {
    const ws = s.ws.map((x) => (x.id === id ? {...x, tile} : x.id === other.id ? {...x, tile: w.tile} : x))
    return {...finish(s, ws, s.anchor), swapped: other.id}
  }
  const moved = {...s, ws: s.ws.map((x) => (x.id === id ? {...x, tile} : x))}
  const anchors = policy === "bestFit" ? nearAnchors(T, s) : [s.anchor]
  const r = coalesce(T, moved, anchors, {id, tile, weight: 2})
  return finish(s, r.state.ws, r.state.anchor)
}

// Empty tiles closer to the center than the farthest workspace.
function gaps(T, s) {
  if (!s.ws.length) return []
  const occ = occupied(s)
  const r = Math.max(...s.ws.map((w) => rd(tileDist(T, s.anchor, w.tile))))
  return fillSequence(T, s.anchor, "distance", s.ws.length + 64).filter((id) => !occ.has(id) && rd(tileDist(T, s.anchor, id)) < r)
}

// Empty tiles that can't reach the open plane through other empty tiles.
function holes(T, s) {
  if (!s.ws.length) return []
  const occ = occupied(s)
  const ring = T.rings(s.anchor, 6)
  const maxR = Math.max(...s.ws.map((w) => ring.get(w.tile) ?? 99))
  const region = T.rings(s.anchor, maxR + 2)
  const seen = new Set()
  const stack = [...region].filter(([, r]) => r === maxR + 2).map(([id]) => id)
  stack.forEach((id) => seen.add(id))
  while (stack.length) {
    const id = stack.pop()
    for (const nb of T.neighbors(id)) if (region.has(nb) && !occ.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb) }
  }
  return [...region.keys()].filter((id) => !occ.has(id) && !seen.has(id))
}

function finish(s, ws, anchor) {
  const before = new Map(s.ws.map((w) => [w.id, w.tile]))
  const moves = ws.filter((w) => before.get(w.id) !== w.tile).map((w) => ({id: w.id, from: before.get(w.id), to: w.tile}))
  return {state: {...s, ws, anchor}, moves}
}

function removeWorkspace(T, s, order, policy, idx) {
  const removed = s.ws[idx]
  return {...REMOVAL_POLICIES[policy].remove(T, s, order, idx), removed}
}

function metrics(T, s, order, moves = []) {
  const d = (id) => tileDist(T, s.anchor, id)
  const radius = s.ws.length ? Math.max(...s.ws.map((w) => d(w.tile))) : 0
  const ideal = s.ws.length ? Math.max(...fillSequence(T, s.anchor, order, s.ws.length).map(d)) : 0
  const moved = moves.reduce((acc, m) => acc + tileDist(T, m.from, m.to), 0)
  return {n: s.ws.length, moves: moves.length, moved: +moved.toFixed(2), radius: +radius.toFixed(3), excess: +(radius - ideal).toFixed(3)}
}

const api = {C, M, wrapAngle, lerpFrame, Tiling, FILL_ORDERS, fillSequence, emptyState, addWorkspace, settle, REMOVAL_POLICIES, removeWorkspace, dropWorkspace, coalesce, holes, gaps, metrics}
if (typeof module !== 'undefined') module.exports = api
else root.Hyper = api
})(this)
