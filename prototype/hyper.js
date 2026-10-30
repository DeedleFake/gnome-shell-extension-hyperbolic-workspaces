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

// Placement state: `ws` holds the workspaces that have windows, in the order
// their first window opened. The center (anchor) starts on the origin tile and
// follows the group (see followCenter).
function emptyState() {
  return {anchor: 0, ws: [], nextId: 1}
}

const occupied = (s) => new Set(s.ws.map((w) => w.tile))

// Every tile is a workspace; only tiles with windows are in `ws`. Opening the first window on an empty tile adds it; one
// that doesn't touch the group slides over to the nearest tile that does.
function openWorkspace(T, s, tile) {
  const w = {id: s.nextId, tile}
  const raw = [...s.ws, w]
  const {ws, fallbacks} = connect(T, {...s, ws: raw}, w.id)
  const f = finish(T, {...s, ws: raw}, ws)
  return {...f, state: {...f.state, nextId: s.nextId + 1}, added: w, raw, fallbacks}
}

// Free tile touching the group nearest the center (the center if the group is empty).
function nearestFree(T, s, order = "distance") {
  if (!s.ws.length) return s.anchor
  const occ = occupied(s), keyOf = keyerFor(T, s.anchor, order)
  let best = null
  for (const w of s.ws)
    for (const n of T.neighbors(w.tile))
      if (!occ.has(n) && (best === null || cmp(keyOf(n), keyOf(best)) < 0)) best = n
  return best
}

// Groups of edge-adjacent tiles, in list order of their first workspace.
function components(T, s) {
  const occ = occupied(s), seen = new Set(), out = []
  for (const w of s.ws) {
    if (seen.has(w.tile)) continue
    const tiles = [w.tile]
    seen.add(w.tile)
    for (let i = 0; i < tiles.length; i++)
      for (const n of T.neighbors(tiles[i])) if (occ.has(n) && !seen.has(n)) { seen.add(n); tiles.push(n) }
    out.push(tiles)
  }
  return out
}

// Image of `tiles` under the tiling symmetry that sends `from` to `to` and
// edge k of `from` to edge (k + turn) % 4 of `to`. Exact: it only follows links.
function mapShape(T, tiles, from, to, turn) {
  const set = new Set(tiles)
  const img = new Map([[from, [to, turn]]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i], [t, o] = img.get(u)
    const nu = T.neighbors(u), nt = T.neighbors(t)
    for (let k = 0; k < 4; k++) {
      const n = nu[k]
      if (!set.has(n) || img.has(n)) continue
      const m = nt[(k + o) % 4]
      img.set(n, [m, (T.neighbors(m).indexOf(t) - T.neighbors(n).indexOf(u) + 8) % 4])
      queue.push(n)
    }
  }
  return new Map([...img].map(([u, [t]]) => [u, t]))
}

// Slide `piece` so it touches `main`, keeping its shape: try every tiling
// symmetry that lands it on free tiles next to `main` and keep the one with the
// least total travel (sum of hyperbolic distances each workspace moves).
function slidePiece(T, occ, main, piece) {
  const r = piece[0], own = new Set(piece), mainSet = new Set(main)
  // Frames of the piece's tiles relative to r, by walking the piece itself.
  const F = new Map([[r, M.id()]])
  for (const u of F.keys())
    T.neighbors(u).forEach((n, k) => { if (own.has(n) && !F.has(n)) F.set(n, M.compose(F.get(u), T.rel[k][T.tiles[u].tw[k]])) })
  let best = null
  for (const [t, {F: Ft}] of T.frames(r, piece.length === 1 ? 8 : 7)) {
    if (occ.has(t) && !own.has(t)) continue
    for (let turn = 0; turn < (piece.length === 1 ? 1 : 4); turn++) {
      const img = mapShape(T, piece, r, t, turn)
      let ok = true, touches = false
      for (const v of img.values()) {
        if (occ.has(v) && !own.has(v)) { ok = false; break }
        if (!touches && T.neighbors(v).some((n) => mainSet.has(n))) touches = true
      }
      if (!ok || !touches) continue
      const G = M.compose(Ft, M.rot((turn * Math.PI) / 2))
      let cost = 0
      for (const Fu of F.values()) cost += M.dist0(M.compose(M.inv(Fu), M.compose(G, Fu)))
      if (cost < (best?.cost ?? Infinity) - 1e-9) best = {cost, img}
    }
  }
  return best?.img ?? null
}

// Stay connected: while the group is split, the biggest piece stays put and the
// next biggest slides over to touch it. Ties keep the piece without `mover`
// (a dropped workspace), then the one on the center tile, then list order.
function connect(T, s, mover = null) {
  let ws = s.ws
  let fallbacks = 0
  for (;;) {
    const comps = components(T, {...s, ws})
    if (comps.length < 2) return {ws, fallbacks}
    const moverTile = ws.find((w) => w.id === mover)?.tile
    const rank = (c) => [-c.length, c.includes(moverTile) ? 1 : 0, c.includes(s.anchor) ? 0 : 1]
    const order = comps.map((c, i) => ({c, k: [...rank(c), i]})).sort((x, y) => cmp(x.k, y.k)).map((x) => x.c)
    const [main, piece] = order
    const occ = new Set(ws.map((w) => w.tile))
    let img = slidePiece(T, occ, main, piece)
    if (!img) {
      // No symmetry fits within reach: move them one at a time instead.
      fallbacks++
      img = new Map()
      for (const u of piece) {
        occ.delete(u)
        const one = slidePiece(T, occ, main, [u])
        img.set(u, one.get(u))
        occ.add(one.get(u))
        main.push(one.get(u))
      }
    }
    ws = ws.map((w) => (img.has(w.tile) ? {...w, tile: img.get(w.tile)} : w))
  }
}

// The center follows the group: when its tile has no windows but some tile
// does, it moves to the nearest such tile by edge steps. Ties go to the oldest
// workspace (first in `ws`). With no windows anywhere it stays put.
function followCenter(T, ws, anchor) {
  const age = new Map(ws.map((w, i) => [w.tile, i]))
  if (!ws.length || age.has(anchor)) return anchor
  const seen = new Set([anchor])
  for (let ring = [anchor]; ; ) {
    const next = []
    for (const t of ring) for (const n of T.neighbors(t)) if (!seen.has(n)) { seen.add(n); next.push(n) }
    const hits = next.filter((t) => age.has(t))
    if (hits.length) return hits.reduce((a, b) => (age.get(a) < age.get(b) ? a : b))
    ring = next
  }
}

function finish(T, s, ws) {
  const before = new Map(s.ws.map((w) => [w.id, w.tile]))
  const moves = ws.filter((w) => before.get(w.id) !== w.tile).map((w) => ({id: w.id, from: before.get(w.id), to: w.tile}))
  return {state: {...s, ws, anchor: followCenter(T, ws, s.anchor)}, moves}
}

// Every way a workspace goes away ends here.
function removeWorkspace(T, s, idx) {
  const raw = s.ws.filter((_, i) => i !== idx)
  const {ws, fallbacks} = connect(T, {...s, ws: raw})
  return {...finish(T, s, ws), removed: s.ws[idx], raw, fallbacks}
}

// Neighbor of `tile` that a drag entering it from `prev` crossed from: `prev`
// itself when adjacent, else the neighbor closest to `prev`.
function entryTile(T, tile, prev) {
  const nb = T.neighbors(tile)
  if (prev === null || nb.includes(prev)) return prev
  return nb.reduce((a, b) => (T.dist(b, prev) < T.dist(a, prev) ? b : a))
}

// Drop workspace `id` on `tile`, entering it from neighbor `from`. Any empty
// tile is fine. An occupied tile inserts: the occupant and everything behind it
// in a straight line (in at one edge, out the opposite one) shift one tile on,
// up to the first empty tile, which may be the one the dragged workspace left.
// Then the group is reconnected, with the dropped one sliding back if it is
// off on its own.
function dropWorkspace(T, s, id, tile, from = null) {
  const w = s.ws.find((x) => x.id === id)
  if (tile === w.tile) return {...finish(T, s, s.ws), landed: tile, chain: [], raw: s.ws, fallbacks: 0}
  const at = new Map(s.ws.filter((x) => x.id !== id).map((x) => [x.tile, x]))
  const to = new Map([[id, tile]])
  const chain = []
  if (at.has(tile)) {
    let prev = entryTile(T, tile, from ?? w.tile), cur = tile
    while (at.has(cur)) {
      const nb = T.neighbors(cur)
      const next = nb[(nb.indexOf(prev) + 2) % 4]
      chain.push(at.get(cur).id)
      to.set(at.get(cur).id, next)
      prev = cur; cur = next
    }
  }
  const raw = s.ws.map((x) => (to.has(x.id) ? {...x, tile: to.get(x.id)} : x))
  const {ws, fallbacks} = connect(T, {...s, ws: raw}, id)
  return {...finish(T, s, ws), landed: tile, chain, raw, fallbacks}
}

const api = {C, M, wrapAngle, lerpFrame, Tiling, FILL_ORDERS, fillSequence, emptyState, openWorkspace, nearestFree, components, mapShape, connect, followCenter, removeWorkspace, entryTile, dropWorkspace}
if (typeof module !== 'undefined') module.exports = api
else root.Hyper = api
})(this)
