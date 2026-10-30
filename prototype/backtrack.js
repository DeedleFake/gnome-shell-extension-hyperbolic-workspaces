// Does pressing an arrow then its opposite always return you, per orientation mode?
const H = require("./hyper.js")
const {Tiling, M} = H
for (const radialFrames of [false, true]) {
const T = new Tiling(4, 5, {radialFrames})
console.log(radialFrames ? 'frames: closest to radial transport' : 'frames: first found by BFS')
const dirs = {R: 0, U: Math.PI / 2, L: Math.PI, D: -Math.PI / 2}
const opp = {R: "L", L: "R", U: "D", D: "U"}
function step(V, focus, ch, upright) {
  let best = -1, err = 9, c = null
  for (const n of T.neighbors(focus)) {
    const z = M.center(M.compose(V, T.tiles[n].M))
    const e = Math.abs(H.wrapAngle(Math.atan2(z[1], z[0]) - dirs[ch]))
    if (e < err) { err = e; best = n; c = z }
  }
  V = upright ? M.inv(T.tiles[best].M) : M.compose(M.inv(M.to(c)), V)
  return [V, best]
}
for (const upright of [false, true]) {
  let fails = 0, total = 0, rot = {}
  for (let start = 0; start < 300; start++)
    for (const ch of "RULD") {
      let V = upright ? M.inv(T.tiles[start].M) : M.inv(T.tiles[start].M)
      let f = start
      ;[V, f] = step(V, f, ch, upright)
      ;[V, f] = step(V, f, opp[ch], upright)
      total++
      if (f !== start) fails++
    }
  // How often is the neighbor's canonical frame rotated relative to the step direction?
  for (let t = 0; t < 300; t++) for (const n of T.neighbors(t)) {
    const k = T.tiles[t].nbr.indexOf(n)
    const transported = M.compose(T.tiles[t].M, T.step[k])
    const a = Math.round(H.wrapAngle(M.split(M.compose(M.inv(transported), T.tiles[n].M)).alpha) * 180 / Math.PI)
    rot[a] = (rot[a] || 0) + 1
  }
  console.log(upright ? "upright" : "drift", `arrow then opposite fails to return: ${fails}/${total}`, upright ? "" : `neighbor frame vs transported frame (deg:count): ${JSON.stringify(rot)}`)
}
}
