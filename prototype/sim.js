// Random churn under the stay-connected rule: open a first window on a random
// tile, close a workspace's last window, drag. Checks after every operation, from
// the outside: one connected group, the center on a tile with windows, no
// overlaps, no lost workspaces, and nothing moves except the insert chain, a
// newly opened far workspace, and pieces that were cut off (each sliding as one
// rigid shape).
const {Tiling, emptyState, openWorkspace, removeWorkspace, dropWorkspace, components} = require("./hyper.js")
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

// raw -> final may move only pieces cut off from some biggest piece, each rigidly.
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
    for (const a of ids) for (const b of ids)
      if (a < b && adjacent(before.get(a), before.get(b)) !== adjacent(after.get(a), after.get(b))) fail(`${what}: a piece changed shape`, {fb: final.fallbacks, c, a, b, ba: before.get(a), bb: before.get(b), aa: after.get(a), ab: after.get(b)})
  }
  return comps.length > 1
}

let s = emptyState()
const st = {opens: 0, joined: 0, firstAway: 0, removes: 0, splits: 0, slidRem: 0, maxPiece: 0, drops: 0, far: 0, slidBack: 0, inserts: 0, chainMax: 0, chainSum: 0, dropSplits: 0, fallbacks: 0, maxN: 0, noMove: 0, centerMoves: 0}
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
console.log(`## Stay connected, ${OPS} random ops, seed ${SEED} (40% open a first window on a free tile within 5 of the group, 30% close the last window, 30% drag within 5 tiles; up to 30 workspaces), ${Date.now() - t0} ms`)
console.log(`opens ${st.opens} (${st.joined} away from the group slid over to join it; ${st.firstAway} first windows on an empty plane, where the center moved to them), closes ${st.removes} (${st.splits} split the group; ${st.slidRem} workspaces slid, most in one close ${st.maxPiece})`)
console.log(`drops ${st.drops}: ${st.far} on empty tiles (${st.slidBack} slid back to the group), ${st.inserts} inserts (avg chain ${(st.chainSum / Math.max(1, st.inserts)).toFixed(2)}, max ${st.chainMax}); ${st.dropSplits} drops split the rest`)
console.log(`center moved ${st.centerMoves} times; fallbacks to one-at-a-time ${st.fallbacks}; max workspaces ${st.maxN}; every check passed`)
