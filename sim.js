// Random churn under the stay-connected rule: open a first window on a random
// tile, close a workspace's last window, drag a workspace, move one window.
// Checks after every operation, from the outside: one connected group, the
// center on a tile with windows, no overlaps, no lost workspaces, and nothing
// moves except the insert chain, a newly opened far workspace, and pieces that
// were cut off (each sliding as one rigid shape, never turning).
const {M, wrapAngle, Tiling, emptyState, openWorkspace, removeWorkspace, moveWindow, dropWorkspace, components, mapShape} = require("./hyper.js")
const T = new Tiling(4, 5)
const OPS = +(process.argv[2] ?? 5000)
const SEED = +(process.argv[3] ?? 7)
let seed = SEED
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
const fail = (msg, extra) => { console.log("FAIL", msg, JSON.stringify(extra)); process.exit(1) }
const adjacent = (a, b) => T.neighbors(a).includes(b)
const tilesOf = (ws) => new Map(ws.map((w) => [w.id, w.tile]))

function checkGroup(s, what) {
  const tiles = s.ws.map((w) => w.tile)
  if (new Set(tiles).size !== tiles.length) fail(`${what}: two workspaces on one tile`, tiles)
  if (s.ws.length && components(T, s).length !== 1) fail(`${what}: group is split`, tiles)
  if (s.ws.length && !tiles.includes(s.anchor)) fail(`${what}: center tile has no windows`, {anchor: s.anchor, tiles})
}

// The tiling symmetry that takes c[0] to `to`, turned by `turn` quarter turns.
const symmetry = (c, to, turn) => M.compose(T.relFrame(c[0], to, 8), M.rot((turn * Math.PI) / 2))
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
      if (!slides.some((G) => c.some((u) => onAxis(G, T.relFrame(c[0], u, 8))))) {
        st.offAxis++; if (c.length === 1) st.offAxisLone++
        st.maxBend = Math.max(st.maxBend, Math.min(...slides.map((G) => Math.max(...c.map((u) => bend(G, T.relFrame(c[0], u, 8)))))))
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

let s = emptyState()
const st = {opens: 0, joined: 0, firstAway: 0, removes: 0, splits: 0, slidRem: 0, maxPiece: 0, drops: 0, far: 0, slidBack: 0, inserts: 0, chainMax: 0, chainSum: 0, dropSplits: 0, fallbacks: 0, maxN: 0, noMove: 0, centerMoves: 0, oneStep: 0, winMoves: 0, winLast: 0, winNew: 0, winSplits: 0, pieces: 0, pieceTiles: 0, offAxis: 0, offAxisLone: 0, maxBend: 0}
const t0 = Date.now()
for (let i = 0; i < OPS; i++) {
  const x = rnd()
  const before = tilesOf(s.ws)
  const anchorBefore = s.anchor
  if (s.ws.length < 1 || (s.ws.length < 30 && x < 0.4)) {
    const occ = new Set(s.ws.map((v) => v.tile))
    const near = s.ws.length ? [...T.rings(pick(s.ws).tile, 5).keys()] : [...T.rings(0, 4).keys()]
    const tile = pick(near.filter((t) => !occ.has(t)))
    const r = openWorkspace(T, s, tile)
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
    const r = moveWindow(T, s, w.id, target, last)
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
  if (s.anchor !== anchorBefore) st.centerMoves++
  st.maxN = Math.max(st.maxN, s.ws.length)
}
console.log(`## Stay connected, ${OPS} random ops, seed ${SEED} (40% open a first window on a free tile within 5 of the group, 30% close the last window, 15% drag within 5 tiles, 15% move one window to a tile within 5; up to 30 workspaces), ${Date.now() - t0} ms`)
console.log(`opens ${st.opens} (${st.joined} away from the group slid over to join it; ${st.firstAway} first windows on an empty plane, where the center moved to them), closes ${st.removes} (${st.splits} split the group; ${st.slidRem} workspaces slid, most in one close ${st.maxPiece})`)
console.log(`drops ${st.drops}: ${st.far} on empty tiles (${st.slidBack} slid back to the group), ${st.inserts} inserts (avg chain ${(st.chainSum / Math.max(1, st.inserts)).toFixed(2)}, max ${st.chainMax}); ${st.dropSplits} drops split the rest`)
console.log(`window moves ${st.winMoves}: ${st.winLast} took the source's last window, ${st.winNew} opened an empty tile; ${st.winSplits} split the group`)
console.log(`${st.pieces} cut-off pieces moved (${st.pieceTiles} workspaces), each by one slide with no turn (${st.offAxis} along an axis that misses the piece, because no straight slide fit; ${st.offAxisLone} of them lone workspaces; most turn against moving straight ${st.maxBend.toFixed(1)} deg); ${st.oneStep} two-piece splits had a one-tile slide, and took it`)
console.log(`center moved ${st.centerMoves} times; fallbacks to one-at-a-time ${st.fallbacks}; max workspaces ${st.maxN}; every check passed`)
