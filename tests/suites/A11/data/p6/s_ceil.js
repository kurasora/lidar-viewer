const P = window.__pcd, S = P.S, f = S.files[0];
const M = P.world.matrixWorld.elements, c = S.hideCeil && S.ceil;
const bands = [-99, -1, 0.5, 2.0, 2.8, 3.5, 5.0, 6.5, 99], hid = new Array(bands.length - 1).fill(0), tot = hid.slice();
for (let i = 0; i < f.n; i++) {
  const x = f.positions[3 * i], y = f.positions[3 * i + 1], z = f.positions[3 * i + 2];
  const w = [0, 1, 2].map(k => M[k] * x + M[4 + k] * y + M[8 + k] * z + M[12 + k]);
  let b = 0; while (z + S.offset[2] >= bands[b + 1]) b++;   // 帯はファイルの z で分ける
  tot[b]++;
  if (c && c.n.x * w[0] + c.n.y * w[1] + c.n.z * w[2] > c.d) hid[b]++;
}
const share = tot.map((t, i) => t ? `${bands[i]}〜${bands[i + 1]}: ${(100 * hid[i] / t).toFixed(0)}% / ${t}` : null).filter(Boolean);
return { level: S.levelInfo && { tilt: +S.levelInfo.tiltDeg.toFixed(2), yaw: +S.levelInfo.yawDeg.toFixed(2), floorZ: S.levelInfo.floorZ }, levelMsg: H.text('levelResult'), ceilZ: S.ceilZ, hideCeil: S.hideCeil, hiddenByFileZ: share, totalHidden: hid.reduce((a, b) => a + b, 0) / f.n };
