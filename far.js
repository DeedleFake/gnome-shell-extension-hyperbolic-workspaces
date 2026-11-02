// Walks far out over the tiling and checks that tile identity stays exact.
const H = require("./hyper.js")
const {Tiling, M} = H
const T = new Tiling(4, 5)
let seed = 11
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
for (const steps of [50, 200]) {
  let cur = 0
  const path = []
  for (let i = 0; i < steps; i++) {
    T.frames(cur, 4)
    const k = Math.floor(rnd() * 4)
    path.push(k)
    cur = T.neighbors(cur)[k]
  }
  const far = cur
  let F = M.id(), t = 0
  for (const k of path) { F = M.compose(F, T.rel[k][T.tiles[t].tw[k]]); t = T.tiles[t].nbr[k] }
  const tilesAt = [0]
  for (const k of path) tilesAt.push(T.tiles[tilesAt.at(-1)].nbr[k])
  let home = far
  for (let i = path.length - 1; i >= 0; i--) {
    const from = tilesAt[i], k = path[i]
    home = T.tiles[home].nbr[(k + 2 - T.tiles[from].tw[k] + 4) % 4]
  }
  console.log(`walk back the same ${steps} steps: ends on tile ${home}`)
  console.log(`walk ${steps} random steps: far tile ${far}, about ${M.dist0(F).toFixed(0)} hyperbolic units from tile 0 (one transform multiplied along the whole path, the old way; NaN means it overflowed)`)
}
// Every vertex must close after exactly q tiles, and no two tiles may share a position.
let open = 0, checked = 0, dup = 0
for (const t of T.tiles) {
  if (t.nbr.includes(-1)) continue
  for (let k = 0; k < 4; k++) {
    let id = t.id, e = k, n = 0
    do {
      const tt = T.tiles[id]
      if (tt.nbr[e] === -1) { n = -1; break }
      const nx = tt.nbr[e]
      const backE = (e + 2 - tt.tw[e] + 4) % 4
      id = nx; e = (backE + 3) % 4; n++
    } while (!(id === t.id && e === k) && n < 12)
    if (n !== -1) { checked++; if (n !== 5) open++ }
  }
  const near = T.localFrames(t.id, 3)
  const pts = [...near.values()].map((F) => M.center(F))
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (H.C.abs2(H.C.add(pts[i], H.C.scale(pts[j], -1))) < 1e-6) dup++
}
console.log(`tiles ${T.tiles.length}, vertices checked ${checked}, not closing after 5 tiles ${open}, duplicate positions ${dup}`)
