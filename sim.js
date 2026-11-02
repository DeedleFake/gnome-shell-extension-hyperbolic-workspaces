// Random churn under the stay-connected rule: open a first window on a random
// tile, close a workspace's last window, drag a workspace, move one window.
// Checks after every operation, from the outside: one connected group, the
// center on a tile with windows, no overlaps, no lost workspaces, and nothing
// moves except the insert chain, a newly opened far workspace, and pieces that
// were cut off (each sliding as one rigid shape, never turning).
const H = require("./hyper.js")
const {M, wrapAngle, Tiling, components, mapShape, emptyState} = H
// Time spent in the placement calls alone (what the shell would run), and
// the tiles they build, apart from the checks around them.
let callMs = 0, callTiles = 0
const timed = (f) => (...a) => { const t = process.hrtime.bigint(), n = T.count, r = f(...a); callMs += Number(process.hrtime.bigint() - t) / 1e6; callTiles += T.count - n; return r }
const [openWorkspace, removeWorkspace, moveWindow, dropWorkspace] = [H.openWorkspace, H.removeWorkspace, H.moveWindow, H.dropWorkspace].map(timed)
const T = new Tiling(4, 5)
const OPS = +(process.argv[2] ?? 5000)
const SEED = +(process.argv[3] ?? 7)
let seed = SEED
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
const fail = (msg, extra) => { console.log("FAIL", msg, JSON.stringify(extra)); process.exit(1) }
// Frame of b relative to a from the tiles' stored positions: no ball of tiles
// built (and cached) around a, which is what made the checks themselves leak.
const relP = (a, b) => M.compose(M.inv(T.tiles[a].P), T.tiles[b].P)
const adjacent = (a, b) => T.neighbors(a).includes(b)
const tilesOf = (ws) => new Map(ws.map((w) => [w.id, w.tile]))

function checkGroup(s, what) {
  const tiles = s.ws.map((w) => w.tile)
  if (new Set(tiles).size !== tiles.length) fail(`${what}: two workspaces on one tile`, tiles)
  if (s.ws.length && components(T, s).length !== 1) fail(`${what}: group is split`, tiles)
  if (s.ws.length && !tiles.includes(s.anchor)) fail(`${what}: center tile has no windows`, {anchor: s.anchor, tiles})
}

// The tiling symmetry that takes c[0] to `to`, turned by `turn` quarter turns.
const symmetry = (c, to, turn) => M.compose(relP(c[0], to), M.rot((turn * Math.PI) / 2))
// Is the center of the tile at frame Fu (relative to the symmetry's frame) on G's axis?
// How far it turns against moving straight to its new spot, in degrees.
const bend = (G, Fu) => (Math.abs(wrapAngle(M.split(M.compose(M.inv(Fu), M.compose(G, Fu))).alpha)) * 180) / Math.PI
const onAxis = (G, Fu) => bend(G, Fu) < 1e-4
// The turns of the symmetry taking c[0] to `to` that send every member to `dest`'s tile.
const rigidTurns = (c, to, dest) => [0, 1, 2, 3].filter((turn) => { const img = mapShape(T, c, c[0], to, turn); return c.every((u) => img.get(u) === dest(u)) })

// Symmetries that move every member of `c` to an edge-adjacent tile and leave it
// on free tiles touching the rest of the group.
function oneStepSlides(c, others) {
  const out = []
  for (const n of T.neighbors(c[0])) for (let turn = 0; turn < 4; turn++) {
    if (!M.isSlide(symmetry(c, n, turn))) continue
    const img = mapShape(T, c, c[0], n, turn)
    if (c.every((u) => adjacent(u, img.get(u)) && !others.has(img.get(u))) && c.some((u) => T.neighbors(img.get(u)).some((x) => others.has(x)))) out.push(img)
  }
  return out
}

// raw -> final may move only pieces cut off from some biggest piece, each as the
// rigid image of its own tiles under one tiling symmetry that is a slide
// (a translation, no turn about any point). With exactly two pieces, a one-tile
// slide wins whenever one reconnects them.
function checkRejoin(raw, final, what) {
  const before = tilesOf(raw), after = tilesOf(final)
  if (before.size !== after.size || [...before.keys()].some((id) => !after.has(id))) fail(`${what}: lost a workspace`)
  const comps = components(T, {ws: raw})
  if (!comps.length) return false
  const byTile = new Map(raw.map((w) => [w.tile, w.id]))
  const still = (c) => c.every((t) => after.get(byTile.get(t)) === t)
  const big = Math.max(...comps.map((c) => c.length))
  if (!comps.some((c) => c.length === big && still(c))) fail(`${what}: a biggest piece moved`)
  for (const c of comps) {
    const ids = c.map((t) => byTile.get(t))
    const dest = (u) => after.get(byTile.get(u))
    if (!still(c)) {
      const turns = rigidTurns(c, dest(c[0]), dest)
      if (!turns.length) fail(`${what}: a piece moved but not as one rigid block`, {c, to: c.map(dest)})
      const slides = turns.map((turn) => symmetry(c, dest(c[0]), turn)).filter(M.isSlide)
      if (!slides.length) fail(`${what}: a piece turned instead of sliding`, {c, to: c.map(dest)})
      st.pieces++; st.pieceTiles += c.length
      if (!slides.some((G) => c.some((u) => onAxis(G, relP(c[0], u))))) {
        st.offAxis++; if (c.length === 1) st.offAxisLone++
        st.maxBend = Math.max(st.maxBend, Math.min(...slides.map((G) => Math.max(...c.map((u) => bend(G, relP(c[0], u)))))))
      }
      if (comps.length === 2) {
        const others = new Set(comps.find((x) => x !== c))
        const slides = oneStepSlides(c, others)
        if (slides.length && !slides.some((img) => c.every((u) => img.get(u) === dest(u)))) fail(`${what}: a one-tile slide was possible but not chosen`, {c, to: c.map(dest)})
        if (slides.length) st.oneStep++
      }
    }
    for (const a of ids) for (const b of ids)
      if (a < b && adjacent(before.get(a), before.get(b)) !== adjacent(after.get(a), after.get(b))) fail(`${what}: a piece changed shape`, {fb: final.fallbacks, c, a, b, ba: before.get(a), bb: before.get(b), aa: after.get(a), ab: after.get(b)})
  }
  return comps.length > 1
}

// No spin: each moved workspace's down edge must be the image of its old one
// under the motion. Stage one is a push one tile straight on (an insert
// chain), whose motion is the slide to the neighbor, or a drop, which may turn
// to the nearest edge (at most 45 deg); stage two is its piece's slide G.
// The content frame carried by the motion has to equal the new tile's frame
// turned by the new down: no leftover turn, no offset. `was` counts how often
// windows turned when they took the new tile's own frame (down always 0).
const qr = (q) => M.rot((q * Math.PI) / 2)
function leftover(D, from, q0, to, q1) {
  const rel = relP(from, to)
  if (!rel) return null
  const X = M.compose(M.inv(M.compose(D, qr(q0))), M.compose(rel, qr(q1)))
  return {off: M.dist0(X), turn: Math.abs(wrapAngle(M.split(X).alpha))}
}
function checkDown(prev, r, what, dropped = null) {
  const old = new Map(prev.ws.map((w) => [w.id, w]))
  const moved = new Map(r.moves.map((m) => [m.id, m]))
  for (const w of r.state.ws) {
    if (![0, 1, 2, 3].includes(w.down)) fail(`${what}: bad down`, w)
    if (!moved.has(w.id) && old.has(w.id) && old.get(w.id).tile === w.tile && old.get(w.id).down !== w.down) fail(`${what}: down changed without a move`, w)
  }
  for (const m of r.moves) {
    const stages = []
    const mid = m.via ? m.via.from : m.to, qMid = m.via ? m.via.down : m.down[1]
    if (mid !== m.from) stages.push({kind: m.id === dropped ? "drop" : "push", from: m.from, q0: m.down[0], to: mid, q1: qMid})
    else if (qMid !== m.down[0]) fail(`${what}: down changed before the slide`, m)
    if (m.via) stages.push({kind: "slide", from: mid, q0: qMid, to: m.to, q1: m.down[1]})
    for (const g of stages) {
      let D
      if (g.kind === "slide") { const Fu = relP(m.via.root, g.from); if (!Fu) { st.downFar++; continue } D = M.compose(M.inv(Fu), M.compose(m.via.G, Fu)) }
      else { const rel = relP(g.from, g.to); if (!rel) { st.downFar++; continue } D = M.to(M.center(rel)) }
      const now = leftover(D, g.from, g.q0, g.to, g.q1), was = leftover(D, g.from, 0, g.to, 0)
      if (!now) { st.downFar++; continue }
      if (now.off > 1e-6) fail(`${what}: ${g.kind} landed off its tile`, {m, now})
      if (g.kind === "drop") { if (now.turn > Math.PI / 4 + 1e-6) fail(`${what}: drop turned more than 45 deg`, {m, now}); st.drops2++; continue }
      st[g.kind + "s2"]++
      if (now.turn > 1e-6) fail(`${what}: windows spun on a ${g.kind}`, {m, turn: now.turn})
      if (was.turn > 1e-6) st[g.kind + "Was"]++
    }
  }
}

let s = emptyState()
const st = {prunes: 0, downFar: 0, drops2: 0, slides2: 0, pushs2: 0, slideWas: 0, pushWas: 0, opens: 0, joined: 0, firstAway: 0, removes: 0, splits: 0, slidRem: 0, maxPiece: 0, drops: 0, far: 0, slidBack: 0, inserts: 0, chainMax: 0, chainSum: 0, dropSplits: 0, fallbacks: 0, maxN: 0, noMove: 0, centerMoves: 0, oneStep: 0, winMoves: 0, winLast: 0, winNew: 0, winSplits: 0, pieces: 0, pieceTiles: 0, offAxis: 0, offAxisLone: 0, maxBend: 0}
const t0 = Date.now()
const pruneMs = [], opMs = [], samples = [], callOnly = [], tilesBuilt = []
for (let i = 0; i < OPS; i++) {
  const tOp = process.hrtime.bigint()
  callMs = 0; callTiles = 0
  const x = rnd()
  const before = tilesOf(s.ws)
  const anchorBefore = s.anchor
  if (s.ws.length < 1 || (s.ws.length < 30 && x < 0.4)) {
    const occ = new Set(s.ws.map((v) => v.tile))
    const near = s.ws.length ? [...T.rings(pick(s.ws).tile, 5).keys()] : [...T.rings(0, 4).keys()]
    const tile = pick(near.filter((t) => !occ.has(t)))
    const r = openWorkspace(T, s, tile, (i * 3 + tile) % 4)
    checkDown(s, r, "open")
    const touching = T.neighbors(tile).some((n) => occ.has(n))
    if (r.moves.some((m) => m.id !== r.added.id)) fail("opening moved another workspace")
    const got = r.state.ws.find((v) => v.id === r.added.id).tile
    if ((touching || !s.ws.length) && got !== tile) fail("opened workspace moved although it needed no rejoin")
    if (!s.ws.length && tile !== s.anchor) st.firstAway++
    if (got !== tile) st.joined++
    checkRejoin(r.raw, r.state.ws, "open")
    s = r.state; st.opens++
  } else if (x < 0.7) {
    const r = removeWorkspace(T, s, Math.floor(rnd() * s.ws.length))
    checkDown(s, r, "remove")
    const split = checkRejoin(r.raw, Object.assign(r.state.ws, {fallbacks: r.fallbacks}), "remove")
    if (!split && r.moves.length) fail("remove moved something without a split")
    st.removes++; st.fallbacks += r.fallbacks
    if (split) { st.splits++; st.slidRem += r.moves.length; st.maxPiece = Math.max(st.maxPiece, r.moves.length) }
    s = r.state
  } else if (x >= 0.85) {
    const w = pick(s.ws), last = rnd() < 0.5
    const occ = new Set(s.ws.map((v) => v.tile))
    const ring = [...T.rings(w.tile, 5)].filter(([, d]) => d > 0).map(([t]) => t)
    const target = rnd() < 0.5 ? pick(ring.filter((t) => occ.has(t))) ?? pick(ring) : pick(ring)
    const r = moveWindow(T, s, w.id, target, last, (i * 3 + target) % 4)
    checkDown(s, r, "move window")
    const ids = new Set(r.state.ws.map((v) => v.id))
    if (r.state.ws.length !== s.ws.length - (last ? 1 : 0) + (occ.has(target) ? 0 : 1)) fail("move window: wrong workspace count")
    if (last === ids.has(w.id)) fail("move window: the source should leave exactly when it lost its last window")
    if (!occ.has(target) && !ids.has(r.added.id)) fail("move window: the target workspace is missing")
    if (occ.has(target) && !last && (r.moves.length || r.state.anchor !== s.anchor)) fail("move window between two workspaces that stay moved something")
    const split = checkRejoin(r.raw, r.state.ws, "move window")
    if (!split && r.moves.some((m) => m.id !== r.added?.id)) fail("move window moved another workspace without a split")
    st.winMoves++; if (last) st.winLast++; if (!occ.has(target)) st.winNew++; if (split) st.winSplits++
    st.fallbacks += r.fallbacks
    s = r.state
  } else {
    const w = pick(s.ws)
    const occ = new Set(s.ws.map((v) => v.tile))
    const ring = [...T.rings(w.tile, 5)].filter(([, d]) => d > 0).map(([t]) => t)
    const target = rnd() < 0.5 ? pick(ring.filter((t) => occ.has(t))) ?? pick(ring) : pick(ring)
    const from = pick(T.neighbors(target))
    const r = dropWorkspace(T, s, w.id, target, from)
    checkDown(s, r, "drop", w.id)
    st.drops++; st.fallbacks += r.fallbacks
    // raw: only the chain moved, each one tile on, in a straight line from `from`.
    const rawT = tilesOf(r.raw)
    for (const [id, t] of rawT) if (id !== w.id && t !== before.get(id) && !r.chain.includes(id)) fail("drop moved a workspace outside the chain")
    if (occ.has(target) && target !== w.tile) {
      st.inserts++; st.chainSum += r.chain.length; st.chainMax = Math.max(st.chainMax, r.chain.length)
      let prev = T.neighbors(target).includes(from) ? from : null, cur = target
      for (const id of r.chain) {
        if (before.get(id) !== cur) fail("chain is not a straight line", {chain: r.chain})
        const nb = T.neighbors(cur)
        if (prev !== null && rawT.get(id) !== nb[(nb.indexOf(prev) + 2) % 4]) fail("chain member did not move straight on")
        if (!adjacent(cur, rawT.get(id))) fail("chain member moved more than one tile")
        prev = cur; cur = rawT.get(id)
      }
      if ([...before].some(([id, t]) => t === cur && id !== w.id)) fail("chain ended on an occupied tile")
    } else if (r.chain.length) fail("chain on an empty-tile drop")
    if (rawT.get(w.id) !== target && target !== w.tile) fail("dropped workspace did not land on the target")
    const split = checkRejoin(r.raw, r.state.ws, "drop")
    if (!split && r.moves.some((m) => rawT.get(m.id) !== m.to)) fail("drop rejoined without a split")
    if (split) st.dropSplits++
    if (!occ.has(target) && tilesOf(r.state.ws).get(w.id) !== target) st.slidBack++
    if (!occ.has(target)) st.far++
    if (!r.moves.length) st.noMove++
    s = r.state
  }
  checkGroup(s, `op ${i}`)
  // What the shell would pin: the center's fill ball and each workspace's edge.
  const tP = process.hrtime.bigint()
  if (T.maybePrune([[s.anchor, 6], ...s.ws.map((w) => [w.tile, 2])])) { st.prunes++; pruneMs.push(Number(process.hrtime.bigint() - tP) / 1e6) }
  if (s.anchor !== anchorBefore) st.centerMoves++
  st.maxN = Math.max(st.maxN, s.ws.length)
  opMs.push(Number(process.hrtime.bigint() - tOp) / 1e6); callOnly.push(callMs); tilesBuilt.push(callTiles)
  if ((i + 1) % Math.max(1, Math.floor(OPS / 10)) === 0) samples.push(`${i + 1}:${T.count}`)
}
console.log(`## Stay connected, ${OPS} random ops, seed ${SEED} (40% open a first window on a free tile within 5 of the group, 30% close the last window, 15% drag within 5 tiles, 15% move one window to a tile within 5; up to 30 workspaces), ${Date.now() - t0} ms`)
console.log(`opens ${st.opens} (${st.joined} away from the group slid over to join it; ${st.firstAway} first windows on an empty plane, where the center moved to them), closes ${st.removes} (${st.splits} split the group; ${st.slidRem} workspaces slid, most in one close ${st.maxPiece})`)
console.log(`drops ${st.drops}: ${st.far} on empty tiles (${st.slidBack} slid back to the group), ${st.inserts} inserts (avg chain ${(st.chainSum / Math.max(1, st.inserts)).toFixed(2)}, max ${st.chainMax}); ${st.dropSplits} drops split the rest`)
console.log(`window moves ${st.winMoves}: ${st.winLast} took the source's last window, ${st.winNew} opened an empty tile; ${st.winSplits} split the group`)
console.log(`${st.pieces} cut-off pieces moved (${st.pieceTiles} workspaces), each by one slide with no turn (${st.offAxis} along an axis that misses the piece, because no straight slide fit; ${st.offAxisLone} of them lone workspaces; most turn against moving straight ${st.maxBend.toFixed(1)} deg); ${st.oneStep} two-piece splits had a one-tile slide, and took it`)
const pct = (a, b) => `${(100 * a / Math.max(1, b)).toFixed(1)}%`
console.log(`down edges: ${st.slides2} slides with a piece and ${st.pushs2} insert pushes each carried the down edge exactly (windows spun on 0); taking the new tile's own frame instead, windows would have turned on ${st.slideWas} slides (${pct(st.slideWas, st.slides2)}) and ${st.pushWas} pushes (${pct(st.pushWas, st.pushs2)}), ${pct(st.slideWas + st.pushWas, st.slides2 + st.pushs2)} overall; ${st.drops2} drops turned at most 45 deg to the nearest edge; ${st.downFar} stages too far to check`)
console.log(`center moved ${st.centerMoves} times; fallbacks to one-at-a-time ${st.fallbacks}; max workspaces ${st.maxN}; ${st.prunes} prunes; every check passed`)
const qs = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))].toFixed(1)
console.log(`placement calls alone: median ${qs(callOnly, 0.5)} ms, p90 ${qs(callOnly, 0.9)} ms, p99 ${qs(callOnly, 0.99)} ms, max ${Math.max(...callOnly).toFixed(1)} ms; tiles they built per op median ${qs(tilesBuilt, 0.5)}, p90 ${qs(tilesBuilt, 0.9)}, max ${Math.max(...tilesBuilt)}`)
console.log(`prunes ${pruneMs.length}: median ${qs(pruneMs.length ? pruneMs : [0], 0.5)} ms, max ${Math.max(0, ...pruneMs).toFixed(1)} ms`)
const q = (p) => [...opMs].sort((a, b) => a - b)[Math.min(opMs.length - 1, Math.floor(p * opMs.length))].toFixed(1)
console.log(`per op (ops and checks) median ${q(0.5)} ms, p90 ${q(0.9)} ms, p99 ${q(0.99)} ms, max ${Math.max(...opMs).toFixed(1)} ms; tiles after op ${samples.join(' ')}; heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`)
