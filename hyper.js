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
  // A slide: a translation along some geodesic, with no fixed point in the disk
  // and so no turn about any point. Half the trace is Re(a); |Re(a)| < 1 is a
  // rotation, and tiling symmetries are never parabolic (|Re(a)| = 1).
  isSlide: (f) => Math.abs(f.a[0]) > 1 + 1e-9,
  // f^t for a slide f: the point t of the way along its one-parameter group,
  // so every frame of the motion is itself a slide along the same axis.
  slidePow: (f, t) => {
    if (f.a[0] < 0) f = {a: C.scale(f.a, -1), b: C.scale(f.b, -1)}
    const l = f.a[0] + Math.sqrt(f.a[0] * f.a[0] - 1), d = l - 1 / l
    const p = l ** t, q = l ** -t
    return M.norm({a: C.scale(C.add(C.scale(C.add(f.a, [-1 / l, 0]), p), C.scale(C.add(f.a, [-l, 0]), -q)), 1 / d), b: C.scale(f.b, (p - q) / d)})
  },
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
    this.tiles = [{id: 0, nbr: new Array(p).fill(-1), tw: new Array(p).fill(0), parent: -1, pk: 0, P: M.id()}]
    this.count = 1
    this.nextTile = 1
    this.origin = 0
    // Tiles by where they sit (frame P, relative to the origin tile), so a
    // tile reached around a gap in the links is still found, not duplicated.
    this.byPos = new Map()
    this.index(0)
    this.frameCache = new Map()
  }
  // Frame of `id` relative to the origin tile (tile 0 until a prune re-roots).
  abs(id) {
    return this.tiles[id].P
  }
  // Tiles are binned by polar position around the origin: distance in steps
  // of 0.5, angle in steps that shrink with distance, so a bin is about 0.5
  // across everywhere. A match is anything within 0.1 (tile centers are at
  // least 2 rE = 2.1 apart; rounding far out stays far below 0.1).
  polar(P) {
    const r = M.dist0(P), [x, y] = M.hyperXY(P)
    return [r, Math.atan2(y, x)]
  }
  binKey(ri, th) {
    const w = 0.5 / Math.sinh(Math.max(0.5, ri * 0.5))
    const n = ri === 0 ? 1 : Math.max(1, Math.floor((2 * Math.PI) / w))
    return [n, ((Math.floor(((th + Math.PI) / (2 * Math.PI)) * n) % n) + n) % n]
  }
  index(id) {
    const [r, th] = this.polar(this.tiles[id].P), ri = Math.floor(r / 0.5), k = `${ri},${this.binKey(ri, th)[1]}`
    const list = this.byPos.get(k)
    if (list) list.push(id); else this.byPos.set(k, [id])
  }
  // Known tile at frame P, if P is near enough the origin to compare.
  atPos(P) {
    if (C.abs2(P.a) > 1e9) return null
    const [r, th] = this.polar(P), r0 = Math.floor(r / 0.5)
    for (let ri = Math.max(0, r0 - 1); ri <= r0 + 1; ri++) {
      const [n, i] = this.binKey(ri, th)
      for (const dt of n < 3 ? [0, 1] : [-1, 0, 1]) {
        const list = this.byPos.get(`${ri},${(i + dt + n) % n}`)
        if (!list) continue
        for (const id of list) if (M.dist0(M.compose(M.inv(this.tiles[id].P), P)) < 0.1) return id
      }
    }
    return null
  }
  link(t, k, n, j) {
    const back = (((k + 2 - j) % this.p) + this.p) % this.p
    this.tiles[t].nbr[k] = n; this.tiles[t].tw[k] = j
    this.tiles[n].nbr[back] = t; this.tiles[n].tw[back] = (this.p - j) % this.p
  }
  // Edge of n that faces t across t's edge k.
  backEdge(t, k) {
    return (((k + 2 - this.tiles[t].tw[k]) % this.p) + this.p) % this.p
  }
  // The tile across edge k of `id`, found by walking the q tiles around one end
  // of that edge through existing links; with it, the edge of it facing `id`.
  // Around the vertex between edges a and a+1 of u, crossing edge a+1 reaches
  // a tile where the same vertex is between edges e and e+1, e the edge back
  // (and mirrored for the other end). q - 1 steps reach the tile across edge k.
  aroundVertex(id, k) {
    const p = this.p
    for (const dir of [1, -1]) {
      let u = id, a = k, ok = true
      for (let i = 0; i < this.q - 1; i++) {
        const c = (((a + dir) % p) + p) % p, n = this.tiles[u].nbr[c]
        if (n === -1) { ok = false; break }
        a = this.backEdge(u, c); u = n
      }
      if (!ok) continue
      const b = (((a + dir) % p) + p) % p
      if (this.tiles[u].nbr[b] === -1) return {n: u, b}
    }
    return null
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
  // The old way to find a tile across a gap: search every linked tile within
  // five tile widths. Only for far from the origin, where positions are too
  // coarse to compare.
  searchNear(id, k) {
    const G = this.step[k]
    for (const [c, F] of this.localFrames(id, 5 * this.rE * 2)) {
      const D = M.compose(M.inv(G), F)
      if (c !== id && M.dist0(D) < 0.01) return {n: c, j: ((Math.round(M.split(D).alpha / ((2 * Math.PI) / this.p)) % this.p) + this.p) % this.p}
    }
    return null
  }
  neighbors(id) {
    const t = this.tiles[id]
    if (t.nbr.includes(-1)) {
      for (let k = 0; k < this.p; k++) {
        if (t.nbr[k] !== -1) continue
        const G = this.step[k], P = M.compose(t.P, G)
        let found = -1, j = 0
        const v = this.aroundVertex(id, k)
        if (v) { found = v.n; j = (((k + 2 - v.b) % this.p) + this.p) % this.p }
        else {
          const at = C.abs2(P.a) <= 1e9 ? this.atPos(P) : null
          const near = at !== null || C.abs2(P.a) <= 1e9 ? null : this.searchNear(id, k)
          if (at !== null) {
            const D = M.compose(M.inv(P), this.tiles[at].P)
            found = at; j = ((Math.round(M.split(D).alpha / ((2 * Math.PI) / this.p)) % this.p) + this.p) % this.p
          } else if (near) ({n: found, j} = near)
        }
        if (found === -1) {
          found = this.nextTile++
          this.count++
          if (this.radialFrames) {
            const {alpha} = M.split(P)
            j = (((-Math.round(alpha / ((2 * Math.PI) / this.p))) % this.p) + this.p) % this.p
          }
          this.tiles[found] = {id: found, nbr: new Array(this.p).fill(-1), tw: new Array(this.p).fill(0), parent: id, pk: k, P: M.compose(P, M.rot((j * 2 * Math.PI) / this.p))}
          this.index(found)
        }
        this.link(id, k, found, j)
      }
    }
    return t.nbr
  }
  // Free tiles nobody needs, so the graph stays bounded over a long session.
  // `pins` is a list of [tile, depth]: every tile within `depth` edge steps of
  // a pinned tile is kept, and so is a shortest linked path from each pinned
  // tile to the first one, which becomes the new origin. The kept tiles stay
  // one linked piece, so walking links still finds every tile near another,
  // and positions are recomputed from the new origin, so they stay precise
  // near the group however far it wanders. Ids are never reused, so an id
  // held by someone who didn't pin it reads as gone (undefined), never as a
  // different tile. Every cache of frames is dropped.
  prune(pins) {
    const origin = pins[0][0], p = this.p
    const par = new Map([[origin, -1]])
    const q = [origin]
    for (let i = 0; i < q.length; i++) for (const n of this.tiles[q[i]].nbr) if (n !== -1 && !par.has(n)) { par.set(n, q[i]); q.push(n) }
    const keep = new Set()
    for (const [pin, depth] of pins) {
      if (!this.tiles[pin]) continue
      for (let t = pin; t !== undefined && t !== -1 && !keep.has(t); t = par.get(t)) keep.add(t)
      const ring = new Map([[pin, 0]]), fr = [pin]
      for (let i = 0; i < fr.length; i++) {
        keep.add(fr[i])
        if (ring.get(fr[i]) >= depth) continue
        for (const n of this.tiles[fr[i]].nbr) if (n !== -1 && !ring.has(n)) { ring.set(n, ring.get(fr[i]) + 1); fr.push(n) }
      }
    }
    const tiles = []
    for (const id of keep) tiles[id] = this.tiles[id]
    for (const id of keep) {
      const t = tiles[id]
      for (let k = 0; k < p; k++) if (t.nbr[k] !== -1 && !keep.has(t.nbr[k])) { t.nbr[k] = -1; t.tw[k] = 0 }
    }
    this.tiles = tiles
    this.count = keep.size
    this.origin = origin
    this.byPos = new Map()
    const o = tiles[origin]
    o.P = M.id(); o.parent = -1; o.pk = 0
    const seen = new Set([origin]), bq = [origin]
    for (let i = 0; i < bq.length; i++) {
      const t = tiles[bq[i]]
      this.index(bq[i])
      for (let k = 0; k < p; k++) {
        const n = t.nbr[k]
        if (n === -1 || seen.has(n)) continue
        seen.add(n); bq.push(n)
        const c = tiles[n]
        c.P = M.compose(t.P, this.rel[k][t.tw[k]]); c.parent = bq[i]; c.pk = k
      }
    }
    this.frameCache.clear()
    this.keyCache?.clear()
    this.seqCache?.clear()
    this.lastKept = keep.size
    this.prunes = (this.prunes ?? 0) + 1
  }
  // Prune when the graph has doubled since the last prune (and is past a
  // floor that keeps prunes rare), or when the first pin has wandered far
  // enough from the origin that positions start losing digits.
  maybePrune(pins, floor = 6000) {
    const far = this.tiles[pins[0][0]] && M.dist0(this.tiles[pins[0][0]].P) > 12
    if (far || this.count > Math.max(floor, 2 * (this.lastKept ?? 0))) { this.prune(pins); return true }
    return false
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
  // Frame of b relative to a from stored positions: builds no tiles. Precise
  // while both are within about 12 of the origin, which pruning keeps near
  // the group.
  relP(a, b) {
    return M.compose(M.inv(this.tiles[a].P), this.tiles[b].P)
  }
  // Hyperbolic distance between tile centers.
  dist(a, b) {
    return M.dist0(this.relP(a, b))
  }
}

// Clockwise from screen-right, in the anchor's frame.
function angleKey(T, anchor, id) {
  const F = T.relP(anchor, id)
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

// cmp with distances equal within 1e-9.
const cmpTol = (x, y) => {
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 1e-9) return x[i] < y[i] ? -1 : 1
  return 0
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
// A workspace's `down` (0-3) is its content frame: the tile's frame turned by
// that many quarter turns. Its windows live in that flat frame, so whatever
// moves the workspace carries `down` along and its windows never spin. A new
// one starts with `down` (the caller picks the edge drawn nearest the bottom).
function openWorkspace(T, s, tile, down = 0) {
  const w = {id: s.nextId, tile, down}
  const raw = [...s.ws, w]
  const {ws, fallbacks, via} = connect(T, {...s, ws: raw}, w.id)
  const f = finish(T, {...s, ws: raw}, ws, via)
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
// With `turns`, it also gets, for each tile u, the o with edge k of u going to
// edge (k + o) % 4 of u's image, which is how a down edge rides the symmetry.
function mapShape(T, tiles, from, to, turn, turns = null) {
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
  if (turns) for (const [u, [, o]] of img) turns.set(u, o)
  return new Map([...img].map(([u, [t]]) => [u, t]))
}

// Slide `piece` so it touches `main`, keeping its shape: try every tiling
// symmetry that is a slide (see M.isSlide) and lands it on free tiles next to
// `main`. Prefer a straight slide, whose axis runs through the center of one of
// the piece's workspaces: that one moves straight along its line of tiles and
// the rest keep beside it. A slide whose axis misses the piece is a slide too,
// but on screen it swings the piece around a far point, so it is only used
// when no straight one fits. Then the farthest-moving workspace moves least,
// then the least total travel, then the least turn against moving straight
// (which only differs among the quarter turns of a lone workspace). Symmetries
// that turn the piece about a point are never used, even when they would move
// it less.
// Every candidate puts some piece tile on a free tile bordering `main` (else
// the image can't touch it), so only those are tried: the search stays at the
// group's edge and builds no tiles beyond the ones next to it.
// With `near` (a tile), the nearest landing wins first, then a straight one,
// then the one farthest from `near`.
// Returns the tile map and the symmetry G, as a frame relative to piece[0].
function slidePiece(T, occ, main, piece, near = null) {
  const r = piece[0], own = new Set(piece), mainSet = new Set(main)
  // Frames of the piece's tiles relative to r, by walking the piece itself.
  const F = new Map([[r, M.id()]])
  for (const u of F.keys())
    T.neighbors(u).forEach((n, k) => { if (own.has(n) && !F.has(n)) F.set(n, M.compose(F.get(u), T.rel[k][T.tiles[u].tw[k]])) })
  const free = (t) => !occ.has(t) || own.has(t)
  const border = []
  for (const m of main) for (const n of T.neighbors(m)) if (free(n) && !mainSet.has(n) && !border.includes(n)) border.push(n)
  const seen = new Set()
  let best = null
  for (const u of piece) {
    const Fu = F.get(u), Pu = T.tiles[u].P
    for (const b of border) {
      const Pub = M.compose(M.inv(Pu), T.tiles[b].P)
      for (let turn = 0; turn < 4; turn++) {
        // The symmetry sending u to b, turned, seen from r.
        const G = M.compose(M.compose(Fu, M.compose(Pub, M.rot((turn * Math.PI) / 2))), M.inv(Fu))
        if (!M.isSlide(G)) continue
        // The same symmetry is reached from every tile of the piece it puts on
        // the border; G and -G are one map.
        const sg = G.a[0] < 0 ? -1 : 1, key0 = [...G.a, ...G.b].map((x) => (sg * x).toFixed(6)).join()
        if (seen.has(key0)) continue
        seen.add(key0)
        let far = 0, total = 0, bend = 0, straight = false
        for (const Fv of F.values()) {
          // Seen from v, G is a move to its new spot followed by a turn; no turn
          // means v's center is on the axis.
          const D = M.compose(M.inv(Fv), M.compose(G, Fv)), d = M.dist0(D), a = Math.abs(wrapAngle(M.split(D).alpha))
          far = Math.max(far, d); total += d; bend = Math.max(bend, a)
          if (a < 1e-6) straight = true
        }
        // A dropped workspace left on its own goes to the nearest spot instead
        // (see connect), on the far side from where it was picked up on a tie.
        const key = near === null ? [straight ? 0 : 1, far, total, bend] : [far, straight ? 0 : 1, -T.dist(near, b), bend]
        if (best && cmpTol(key, best.key) >= 0) continue
        // Where each piece tile would go, looked up by position: a tile not
        // built yet can't be occupied, so nothing is built until one wins.
        const g = M.compose(M.compose(T.tiles[b].P, M.rot((turn * Math.PI) / 2)), M.inv(Pu))
        let ok = true
        for (const v of piece) {
          const at = T.atPos(M.compose(g, T.tiles[v].P))
          if (at !== null && !free(at)) { ok = false; break }
        }
        if (!ok) continue
        best = {key, u, b, turn, G}
      }
    }
  }
  if (!best) return null
  const turns = new Map(), img = mapShape(T, piece, best.u, best.b, best.turn, turns)
  return {img, turns, root: r, G: best.G}
}

// Stay connected: while the group is split, the biggest piece stays put and the
// next biggest slides over to touch it. Ties keep the piece without `mover`
// (a dropped workspace), then the one on the center tile, then list order.
// `via` maps each workspace that slid to its piece's motion: the piece's root
// tile, the tile it slid from, its down edge there, and the symmetry G, so the
// whole piece can be animated as one rigid body. Its down edge rides G.
function connect(T, s, mover = null, from = null) {
  let ws = s.ws
  let fallbacks = 0
  const via = new Map()
  for (;;) {
    const comps = components(T, {...s, ws})
    if (comps.length < 2) return {ws, fallbacks, via}
    const moverTile = ws.find((w) => w.id === mover)?.tile
    const rank = (c) => [-c.length, c.includes(moverTile) ? 1 : 0, c.includes(s.anchor) ? 0 : 1]
    const order = comps.map((c, i) => ({c, k: [...rank(c), i]})).sort((x, y) => cmp(x.k, y.k)).map((x) => x.c)
    const [main, piece] = order
    const occ = new Set(ws.map((w) => w.tile))
    // A dropped workspace cut off on its own slides back to the nearest free
    // spot touching the group: ranked straight-first, the one straight slide
    // can lie across the group (five squares at a corner leave a lone tile
    // few straight lines), which reads as the drop being thrown away.
    const near = from !== null && piece.length === 1 && piece[0] === moverTile ? from : null
    const slid = slidePiece(T, occ, main, piece, near)
    const img = new Map(), motion = new Map()
    if (slid) for (const u of piece) { img.set(u, slid.img.get(u)); motion.set(u, slid) }
    else {
      // No slide fits within reach: move them one at a time instead.
      fallbacks++
      for (const u of piece) {
        occ.delete(u)
        const one = slidePiece(T, occ, main, [u])
        img.set(u, one.img.get(u)); motion.set(u, one)
        occ.add(one.img.get(u))
        main.push(one.img.get(u))
      }
    }
    for (const w of ws) if (img.has(w.tile)) via.set(w.id, {root: motion.get(w.tile).root, from: w.tile, down: w.down, G: motion.get(w.tile).G})
    ws = ws.map((w) => (img.has(w.tile) ? {...w, tile: img.get(w.tile), down: (w.down + motion.get(w.tile).turns.get(w.tile)) % 4} : w))
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

function finish(T, s, ws, via = new Map()) {
  const before = new Map(s.ws.map((w) => [w.id, w.tile]))
  const down = new Map(s.ws.map((w) => [w.id, w.down]))
  // A workspace that ends on its own tile can still have turned there (a drop
  // that slid back home); that is a move too.
  const moves = ws.filter((w) => before.get(w.id) !== w.tile || (before.has(w.id) && down.get(w.id) !== w.down)).map((w) => ({id: w.id, from: before.get(w.id), to: w.tile, down: [down.get(w.id), w.down], via: via.get(w.id)}))
  return {state: {...s, ws, anchor: followCenter(T, ws, s.anchor)}, moves}
}

// Every way a workspace goes away ends here.
function removeWorkspace(T, s, idx) {
  const raw = s.ws.filter((_, i) => i !== idx)
  const {ws, fallbacks, via} = connect(T, {...s, ws: raw})
  return {...finish(T, s, ws, via), removed: s.ws[idx], raw, fallbacks}
}

// Move one window from workspace `id` to `tile`. With `last`, it was the
// source's last window and the source leaves the group; an empty target joins
// it. Then the group is reconnected as for any open or close.
function moveWindow(T, s, id, tile, last, down = 0) {
  const src = s.ws.find((x) => x.id === id)
  const added = s.ws.some((x) => x.tile === tile) ? null : {id: s.nextId, tile, down}
  const raw = [...s.ws.filter((x) => !(last && x.id === id)), ...(added ? [added] : [])]
  const {ws, fallbacks, via} = connect(T, {...s, ws: raw}, added?.id ?? null)
  const f = finish(T, {...s, ws: raw}, ws, via)
  return {...f, state: {...f.state, nextId: s.nextId + (added ? 1 : 0)}, added, removed: last ? src : null, raw, fallbacks}
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
// off on its own. Each pushed workspace slides one tile straight on, a
// tiling symmetry, and its down edge rides it. The dropped one lands with
// `down`; by default, the edge nearest its old one carried straight over from
// its old tile, which depends only on the two tiles, never on where in the
// target the pointer is.
function dropWorkspace(T, s, id, tile, from = null, down = null) {
  const w = s.ws.find((x) => x.id === id)
  if (tile === w.tile) return {...finish(T, s, s.ws), landed: tile, landedDown: w.down, chain: [], raw: s.ws, fallbacks: 0}
  down ??= carryDown(T, w.tile, w.down, tile)
  const at = new Map(s.ws.filter((x) => x.id !== id).map((x) => [x.tile, x]))
  const to = new Map([[id, [tile, down]]])
  const chain = []
  if (at.has(tile)) {
    let prev = entryTile(T, tile, from ?? w.tile), cur = tile
    while (at.has(cur)) {
      const nb = T.neighbors(cur)
      const k = (nb.indexOf(prev) + 2) % 4, next = nb[k]
      // The step across edge k is the frame rel(k, tw[k]) = step[k] * rot(tw[k]
      // quarter turns); the slide alone, step[k], turns the content frame back
      // by tw[k] against the next tile's frame.
      chain.push(at.get(cur).id)
      to.set(at.get(cur).id, [next, (at.get(cur).down - T.tiles[cur].tw[k] + 4) % 4])
      prev = cur; cur = next
    }
  }
  const raw = s.ws.map((x) => (to.has(x.id) ? {...x, tile: to.get(x.id)[0], down: to.get(x.id)[1]} : x))
  const {ws, fallbacks, via} = connect(T, {...s, ws: raw}, id, w.tile)
  return {...finish(T, s, ws, via), landed: tile, landedDown: down, chain, raw, fallbacks}
}

// Down edge on tile `to` nearest to down edge `down` of tile `from` carried
// straight over (along the line between their centers).
function carryDown(T, from, down, to) {
  const F = T.relP(from, to)
  return ((Math.round(down - M.split(F).alpha / (Math.PI / 2)) % 4) + 4) % 4
}

const api = {C, M, wrapAngle, lerpFrame, Tiling, FILL_ORDERS, fillSequence, emptyState, openWorkspace, nearestFree, components, mapShape, connect, followCenter, removeWorkspace, moveWindow, entryTile, dropWorkspace, carryDown}
if (typeof module !== 'undefined') module.exports = api
else root.Hyper = api
})(this)
