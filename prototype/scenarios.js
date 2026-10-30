// Runs the placement scenarios headlessly and prints the numbers per policy.
const H = require("./hyper.js")
const {Tiling, M, fillSequence, FILL_ORDERS, REMOVAL_POLICIES, emptyState, addWorkspace, removeWorkspace, settle, metrics} = H

const T = new Tiling(4, 5)
const out = []
const log = (...a) => out.push(a.join(" "))

const seqD = fillSequence(T, 0, "distance", 120)
const seqR = fillSequence(T, 0, "rings", 120)
const firstDiff = (a, b) => a.findIndex((x, i) => x !== b[i])
log("## Fill orders around tile 0")
log("distance vs rings: first difference at position", firstDiff(seqD, seqR))
const d0 = (id) => T.dist(0, id).toFixed(3)
for (const [name, s] of [["distance", seqD], ["rings", seqR]]) log(`${name} first 17 (tile:dist):`, s.slice(0, 17).map((id) => `${id}:${d0(id)}`).join(" "))
for (const n of [5, 13, 17, 30, 60]) log(`radius needed for ${n} workspaces: distance ${d0(seqD[n - 1])}, rings ${d0(seqR.slice(0, n).sort((a, b) => d0(b) - d0(a))[0])}`)

function build(n, order) {
  let s = emptyState()
  for (let i = 0; i < n; i++) s = addWorkspace(T, s, order).state
  return s
}

log("\n## Removal scenarios")
log("order | policy | scenario | moves | distance moved | radius after | excess over ideal | center moved")
for (const order of ["distance", "rings"])
  for (const policy of Object.keys(REMOVAL_POLICIES)) {
    const run = (name, n, idx) => {
      const s = build(n, order)
      const r = removeWorkspace(T, s, order, policy, idx)
      const m = metrics(T, r.state, order, r.moves)
      log(order, "|", policy, "|", name, "|", m.moves, "|", m.moved, "|", m.radius, "|", m.excess, "|", r.state.anchor !== s.anchor)
    }
    run("12, remove center (#1)", 12, 0)
    run("10, remove #2", 10, 1)
    run("10, remove #9", 10, 8)
    run("13, remove #5", 13, 4)
  }

log("\n## Create far out with 5 workspaces, then settle")
for (const order of ["distance", "rings"]) {
  let s = build(5, order)
  const far = [...T.rings(0, 4)].find(([, r]) => r === 4)[0]
  const a = addWorkspace(T, s, order, far)
  const st = settle(T, a.state, order, a.added.id)
  log(order, ": created at tile", far, "dist", d0(far), "-> settles to tile", st.moves[0]?.to, "dist", d0(st.moves[0]?.to), "travel", metrics(T, st.state, order, st.moves).moved)
}

log("\n## Random churn, 400 ops, seeded (60% add, 40% remove random, 1..20 workspaces)")
log("order | policy | removals | avg moves/removal | max moves | avg distance moved/removal | avg radius excess | center changes")
for (const order of ["distance", "rings"])
  for (const policy of Object.keys(REMOVAL_POLICIES)) {
    let seed = 42
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    let s = build(3, order)
    let rem = 0, moves = 0, maxMoves = 0, moved = 0, excess = 0, ops = 0, centerChanges = 0
    for (let i = 0; i < 400; i++) {
      const doAdd = s.ws.length < 2 || (s.ws.length < 20 && rnd() < 0.6)
      if (doAdd) s = addWorkspace(T, s, order).state
      else {
        const idx = Math.floor(rnd() * s.ws.length)
        const r = removeWorkspace(T, s, order, policy, idx)
        const m = metrics(T, r.state, order, r.moves)
        if (r.state.anchor !== s.anchor) centerChanges++
        rem++; moves += m.moves; moved += m.moved; maxMoves = Math.max(maxMoves, m.moves)
        s = r.state
      }
      excess += metrics(T, s, order).excess; ops++
    }
    log(order, "|", policy, "|", rem, "|", (moves / rem).toFixed(2), "|", maxMoves, "|", (moved / rem).toFixed(2), "|", (excess / ops).toFixed(3), "|", centerChanges)
  }

log("\n## Orientation drift (keyboard neighbor moves, no re-orientation)")
const dirs = {R: 0, U: Math.PI / 2, L: Math.PI, D: -Math.PI / 2}
function walk(path) {
  let V = M.id(), focus = 0
  for (const ch of path) {
    let best = -1, bestErr = 9, c = null
    for (const n of T.neighbors(focus)) {
      const z = M.center(M.compose(V, T.abs(n)))
      const err = Math.abs(H.wrapAngle(Math.atan2(z[1], z[0]) - dirs[ch]))
      if (err < bestErr) { bestErr = err; best = n; c = z }
    }
    V = M.compose(M.inv(M.to(c)), V)
    focus = best
  }
  const {alpha} = M.split(M.compose(V, T.abs(focus)))
  return {focus, deg: Math.round((H.wrapAngle(alpha) * 180) / Math.PI)}
}
for (const p of ["RL", "RU", "RULD", "RULDR", "RURU", "RRUULLDD", "RDLU", "RULDRULD"]) {
  const r = walk(p)
  log(`path ${p}: ends on tile ${r.focus}, content rotated ${r.deg} deg`)
}
// Shortest arrow loops that return to the start tile.
const loops = []
const letters = "RULD"
for (let len = 2; len <= 6 && loops.length < 6; len++) {
  const rec = (p) => {
    if (p.length === len) { const r = walk(p); if (r.focus === 0) loops.push(`${p}:${r.deg}`); return }
    for (const c of letters) rec(p + c)
  }
  rec("")
}
log("closed loops back to the start tile (path:rotation deg):", loops.filter((x) => !/^(RL|LR|UD|DU)/.test(x) || true).slice(0, 40).join(" "))
console.log(out.join("\n"))
