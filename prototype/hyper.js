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
    this.vertexMaps = []
    for (let k = 0; k < p; k++) {
      const th = Math.PI / p + (2 * Math.PI * k) / p
      this.vertexMaps.push(M.to(C.scale(C.expi(th), Math.tanh(this.rV / 2))))
    }
    this.tiles = []
    this.index = new Map()
    this.add(M.id(), 0)
  }
  key(f) {
    const [x, y] = M.hyperXY(f)
    return [Math.round(x * 100), Math.round(y * 100)]
  }
  find(f) {
    const [kx, ky] = this.key(f)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const id = this.index.get(`${kx + dx},${ky + dy}`)
        if (id !== undefined && this.distBetween(this.tiles[id].M, f) < 0.01) return id
      }
    return -1
  }
  add(F, depth) {
    if (this.radialFrames) {
      // Of the tile's p symmetric frames, keep the one closest to "up as seen from
      // the origin" (parallel transport along the radius).
      const {alpha} = M.split(F)
      const k = Math.round(-alpha / ((2 * Math.PI) / this.p))
      F = M.compose(F, M.rot((k * 2 * Math.PI) / this.p))
    }
    const id = this.tiles.length
    const [kx, ky] = this.key(F)
    this.tiles.push({id, M: F, depth, nbr: new Array(this.p).fill(-1)})
    this.index.set(`${kx},${ky}`, id)
    return id
  }
  distBetween(F, G) {
    return M.dist0(M.compose(M.inv(F), G))
  }
  neighbors(id) {
    const t = this.tiles[id]
    if (t.nbr[0] === -1) {
      for (let k = 0; k < this.p; k++) {
        const G = M.compose(t.M, this.step[k])
        let n = this.find(G)
        if (n === -1) n = this.add(G, t.depth + 1)
        t.nbr[k] = n
      }
    }
    return t.nbr
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
  vertexKeys(id) {
    return this.vertexMaps.map((V) => this.key(M.compose(this.tiles[id].M, V)).join(","))
  }
  sharesVertex(a, b) {
    const ka = new Set(this.vertexKeys(a))
    return this.vertexKeys(b).some((k) => ka.has(k))
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
}

// Clockwise from screen-right, in the anchor's frame.
function angleKey(T, anchor, id) {
  const z = M.center(M.compose(M.inv(T.tiles[anchor].M), T.tiles[id].M))
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
    keyer: (T, anchor) => (id) => [rd(T.distBetween(T.tiles[anchor].M, T.tiles[id].M)), angleKey(T, anchor, id)],
  },
  rings: {
    label: "edge rings, then angle",
    keyer: (T, anchor) => {
      const ring = T.rings(anchor, 8)
      return (id) => [ring.get(id) ?? 99, angleKey(T, anchor, id)]
    },
  },
  corners: {
    label: "corner rings, then angle",
    keyer: (T, anchor) => {
      // Rings where tiles that share only a corner also count as adjacent.
      const ring = new Map([[anchor, 0]])
      let frontier = [anchor]
      for (let d = 1; d <= 6; d++) {
        const next = []
        for (const id of frontier) {
          const near = T.rings(id, 2)
          for (const [n, r] of near)
            if (!ring.has(n) && (r === 1 || (r === 2 && T.sharesVertex(id, n)))) {
              ring.set(n, d)
              next.push(n)
            }
        }
        frontier = next
      }
      return (id) => [ring.get(id) ?? 99, rd(T.distBetween(T.tiles[anchor].M, T.tiles[id].M)), angleKey(T, anchor, id)]
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
  const keyOf = keyerFor(T, anchor, order)
  for (let depth = 2; ; depth++) {
    const ids = [...T.rings(anchor, depth).keys()].filter((id) => !exclude.has(id))
    if (ids.length >= count + 8 || depth > 10) {
      // Two extra rings so a hyperbolically closer tile in a later ring isn't missed.
      const wide = [...T.rings(anchor, depth + 2).keys()].filter((id) => !exclude.has(id))
      return wide.map((id) => ({id, k: keyOf(id)})).sort((x, y) => cmp(x.k, y.k)).slice(0, count).map((x) => x.id)
    }
  }
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
  shorter: {
    label: "list, shorter side shifts",
    remove(T, s, order, idx) {
      const before = idx
      const after = s.ws.length - 1 - idx
      let ws
      if (after <= before) {
        ws = s.ws.map((w, i) => (i > idx ? {...w, tile: s.ws[i - 1].tile} : w)).filter((_, i) => i !== idx)
      } else {
        ws = s.ws.map((w, i) => (i < idx ? {...w, tile: s.ws[i + 1].tile} : w)).filter((_, i) => i !== idx)
      }
      return finish(s, ws, ws.length ? ws[0].tile : s.anchor)
    },
  },
  plug: {
    label: "plug the hole with the outermost",
    remove(T, s, order, idx) {
      const hole = s.ws[idx].tile
      let ws = s.ws.filter((_, i) => i !== idx)
      if (idx === 0 || ws.length === 0) return finish(s, ws, ws.length ? ws[0].tile : s.anchor)
      const keyOf = rankKey(T, s, order)
      let worst = -1
      for (let i = 1; i < ws.length; i++) if (worst === -1 || cmp(keyOf(ws[i].tile), keyOf(ws[worst].tile)) > 0) worst = i
      if (worst !== -1 && cmp(keyOf(ws[worst].tile), keyOf(hole)) > 0) ws = ws.map((w, i) => (i === worst ? {...w, tile: hole} : w))
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
  const A = T.tiles[s.anchor].M
  const d = (id) => T.distBetween(A, T.tiles[id].M)
  const radius = s.ws.length ? Math.max(...s.ws.map((w) => d(w.tile))) : 0
  const ideal = s.ws.length ? Math.max(...fillSequence(T, s.anchor, order, s.ws.length).map(d)) : 0
  const moved = moves.reduce((acc, m) => acc + T.distBetween(T.tiles[m.from].M, T.tiles[m.to].M), 0)
  return {n: s.ws.length, moves: moves.length, moved: +moved.toFixed(2), radius: +radius.toFixed(3), excess: +(radius - ideal).toFixed(3)}
}

const api = {C, M, wrapAngle, lerpFrame, Tiling, FILL_ORDERS, fillSequence, emptyState, addWorkspace, settle, REMOVAL_POLICIES, removeWorkspace, metrics}
if (typeof module !== 'undefined') module.exports = api
else root.Hyper = api
})(this)
