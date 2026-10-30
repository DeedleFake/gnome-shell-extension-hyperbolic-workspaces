// Random open/close/drag churn per removal policy; checks that no change ever leaves a hole.
const H = require("./hyper.js")
const {Tiling, emptyState, addWorkspace, removeWorkspace, dropWorkspace, holes, gaps, metrics} = H
const T = new Tiling(4, 5)
const OPS = +(process.argv[2] ?? 2000)
console.log(`## Random churn, ${OPS} ops per policy, seeded (45% add, 40% remove, 15% drag to a random tile up to 4 steps out; 1..30 workspaces)`)
console.log("policy | removals | avg moves/removal | max moves/removal | drags | avg moves/drag | max moves/drag | max radius | max excess | states with enclosed holes | states with gaps inside the radius | max center drift from tile 0 (99 = more than 6 steps)")
// Control for the hole check: never fills a hole, and recenters when the center goes.
H.REMOVAL_POLICIES.controlNoFill = {
  remove(T, s, order, idx) {
    const ws = s.ws.filter((_, i) => i !== idx)
    return {state: {...s, ws, anchor: idx === 0 && ws.length ? ws[0].tile : s.anchor}, moves: []}
  },
}
for (const policy of Object.keys(H.REMOVAL_POLICIES)) {
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  let s = emptyState()
  for (let i = 0; i < 3; i++) s = addWorkspace(T, s, "distance").state
  const st = {rem: 0, remMoves: 0, remMax: 0, drags: 0, dragMoves: 0, dragMax: 0, radius: 0, excess: 0, holey: 0, gappy: 0, drift: 0}
  for (let i = 0; i < OPS; i++) {
    const x = rnd()
    if (s.ws.length < 2 || (s.ws.length < 30 && x < 0.45)) s = addWorkspace(T, s, "distance").state
    else if (x < 0.85) {
      const r = removeWorkspace(T, s, "distance", policy, Math.floor(rnd() * s.ws.length))
      st.rem++; st.remMoves += r.moves.length; st.remMax = Math.max(st.remMax, r.moves.length); s = r.state
    } else {
      const w = s.ws[Math.floor(rnd() * s.ws.length)]
      const ring = [...T.rings(w.tile, 4)].filter(([, d]) => d > 0)
      const [tile] = ring[Math.floor(rnd() * ring.length)]
      const r = dropWorkspace(T, s, w.id, tile, policy)
      st.drags++; st.dragMoves += r.moves.length; st.dragMax = Math.max(st.dragMax, r.moves.length); s = r.state
    }
    const m = metrics(T, s, "distance")
    st.radius = Math.max(st.radius, m.radius); st.excess = Math.max(st.excess, m.excess)
    if (holes(T, s).length) st.holey++
    if (gaps(T, s).length || !s.ws.some((w) => w.tile === s.anchor)) st.gappy++
    st.drift = Math.max(st.drift, T.dist(0, s.anchor))
  }
  console.log([policy, st.rem, (st.remMoves / st.rem).toFixed(2), st.remMax, st.drags, (st.dragMoves / st.drags).toFixed(2), st.dragMax, st.radius.toFixed(3), st.excess.toFixed(3), st.holey, st.gappy, st.drift.toFixed(2)].join(" | "))
}
