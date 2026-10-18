const P = window.__pcd, S = P.S, f = S.files[0];
// 床の点（部屋の座標で z≈0）は、表示中に隠れていないか: 天井の面の上にある点の割合を数える
const M = P.world.matrixWorld.elements;
let hid = 0, tot = 0, zs = [];
const ceil = S.hideCeil && S.ceil;
for (let i = 0; i < f.n; i++) {
  const x = f.positions[3 * i], y = f.positions[3 * i + 1], z = f.positions[3 * i + 2];
  const wx = M[0] * x + M[4] * y + M[8] * z + M[12], wy = M[1] * x + M[5] * y + M[9] * z + M[13], wz = M[2] * x + M[6] * y + M[10] * z + M[14];
  tot++; if (ceil && ceil.n.x * wx + ceil.n.y * wy + ceil.n.z * wz > ceil.d) hid++;
}
return { msg: H.text('statMsg'), levelResult: H.text('levelResult'), ceilZ: S.ceilZ, hideCeil: S.hideCeil, hiddenShare: hid / tot, n: f.n };
