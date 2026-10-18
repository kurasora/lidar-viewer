import { workerFns } from '../regress/lib/workerfns.mjs';
import { show } from './lib.mjs';
const W = workerFns();
const g = (() => { let s = 4242; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; })();
const gauss = () => { let u = 0, v = 0; while (!u) u = g(); while (!v) v = g(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ---- fieldStats
show('fieldStats [1..5]', W.fieldStats(new Float32Array([1, 2, 3, 4, 5])));
show('fieldStats NaN を含む', W.fieldStats(new Float32Array([1, 2, NaN, 2, 1])));
show('fieldStats 全部 NaN', W.fieldStats(new Float32Array([NaN, NaN])));
show('fieldStats カテゴリ {0,100}', W.fieldStats(new Float32Array([0, 100, 0, 100])));
show('fieldStats 0 個', W.fieldStats(new Float32Array(0)));
// ---- shuffle: 順列になっているか・欄と色が一緒に動くか
{
  const n = 1000, P = new Float32Array(3 * n), C = new Uint8Array(3 * n), F = new Float32Array(n);
  for (let i = 0; i < n; i++) { P[3 * i] = i; P[3 * i + 1] = -i; P[3 * i + 2] = 2 * i; C[3 * i] = i & 255; C[3 * i + 1] = i >> 8; F[i] = i; }
  const ds = { n, positions: P, rgb: C, fields: { f: F } };
  W.shuffle(ds);
  let bad = 0; const seen = new Set();
  for (let i = 0; i < n; i++) { const id = F[i]; seen.add(id); if (P[3 * i] !== id || P[3 * i + 1] !== -id || P[3 * i + 2] !== 2 * id || C[3 * i] !== (id & 255) || C[3 * i + 1] !== (id >> 8)) bad++; }
  show('shuffle: 順列・欄と色が一緒に動く', `ずれ ${bad}、種類 ${seen.size}/${n}`);
  // 位置ごとの偏り（多数回は種固定なので 1 回の統計）: 先頭 100 個の元の番号の平均
  let s = 0; for (let i = 0; i < 100; i++) s += F[i]; show('shuffle: 先頭 100 個の元の番号の平均（期待 ~500）', (s / 100).toFixed(1));
}
// ---- pickIn: 総当たりと比べる（性質に基づく試験）
function brute(ds, o, d, tolA, tolB) {
  let best = null, bt = Infinity; const P = ds.positions;
  for (let i = 0; i < ds.n; i++) {
    const vx = P[3 * i] - o[0], vy = P[3 * i + 1] - o[1], vz = P[3 * i + 2] - o[2];
    const tt = vx * d[0] + vy * d[1] + vz * d[2]; if (tt <= 0) continue;
    const perp2 = vx * vx + vy * vy + vz * vz - tt * tt, tl = tolA * tt + tolB;
    if (perp2 > tl * tl) continue;
    if (tt < bt) { bt = tt; best = i; }
  }
  return best;
}
{
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], big = [-1e9, -1e9, -1e9], bigp = [1e9, 1e9, 1e9];
  const mk = (n, f) => { const P = new Float32Array(3 * n); for (let i = 0; i < n; i++) { const p = f(i); P[3 * i] = p[0]; P[3 * i + 1] = p[1]; P[3 * i + 2] = p[2]; } const ds = { n, positions: P }; ds.bbox = W.bbox(P); return ds; };
  const cases = [
    ['廊下らしい面 5 万点', mk(50000, () => { const t = g(); return t < 0.4 ? [g() * 60, g() * 3, 0] : t < 0.8 ? [g() * 60, g() * 3, 2.6] : [g() * 60, g() < 0.5 ? 0 : 3, g() * 2.6]; })],
    ['まばらな 200 点', mk(200, () => [g() * 100, g() * 100, g() * 10])],
    ['遠い外れ値 1 点 + 密な 2 万点', mk(20001, i => i === 0 ? [1e5, 1e5, 1e4] : [g() * 10, g() * 10, g() * 3])],
  ];
  for (const [name, ds] of cases) {
    let diff = 0, miss = 0, extra = 0, tot = 0, t0 = Date.now();
    for (let q = 0; q < 300; q++) {
      const tgt = ds.n > 2 ? [ds.positions[3 * ((q * 7919) % ds.n)], ds.positions[3 * ((q * 7919) % ds.n) + 1], ds.positions[3 * ((q * 7919) % ds.n) + 2]] : [0, 0, 0];
      const o = [tgt[0] - 20 + g() * 2, tgt[1] - 30 + g() * 2, tgt[2] + 15 + g()];
      let d = [tgt[0] - o[0] + (g() - 0.5) * 0.3, tgt[1] - o[1] + (g() - 0.5) * 0.3, tgt[2] - o[2] + (g() - 0.5) * 0.3];
      const L = Math.hypot(...d); d = d.map(v => v / L);
      const tolA = q % 2 ? 0.002 : 0.02, tolB = 0;
      const a = W.pickIn(ds, o, d, tolA, tolB, I, big, bigp), b = brute(ds, o, d, tolA, tolB);
      tot++;
      if ((a ? a.index : null) !== b) { if (a === null) miss++; else if (b === null) extra++; else diff++; }
    }
    show(`pickIn と総当たり: ${name}`, `300 回中 違う点 ${diff}・見逃し ${miss}・余計 ${extra}（${Date.now() - t0} ms、格子 ${ds.index.cell.toFixed(3)} m・${ds.index.ids.size} マス）`);
  }
}
// ---- buildIndex / pointSpacing: 遠い外れ値
{
  const n = 200000; const P = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { P[3 * i] = (i % 1000) * 0.01; P[3 * i + 1] = Math.floor(i / 1000) * 0.01; P[3 * i + 2] = 0; }
  const ds = { n, positions: P }; ds.bbox = W.bbox(P);
  let t0 = Date.now(); const sp = W.pointSpacing(ds);
  show('点の間隔 1 cm の格子 20 万点', `${sp} m（${Date.now() - t0} ms, ${ds.index.ids.size} マス）`);
  const P2 = new Float32Array(P); P2[0] = 5e6; P2[1] = 5e6; P2[2] = 5e5;
  const ds2 = { n, positions: P2 }; ds2.bbox = W.bbox(P2);
  t0 = Date.now(); const sp2 = W.pointSpacing(ds2);
  show('同じ + 遠い外れ値 1 点（5000 km）', `${sp2} m（${Date.now() - t0} ms, 格子 ${ds2.index.cell} m, ${ds2.index.ids.size} マス、dims ${ds2.index.dims}）`);
}
// ---- jacobiEigen: 無作為な対称行列で A v = λ v・直交
{
  let worst = 0, worstOrth = 0;
  for (let t = 0; t < 20000; t++) {
    const s = Math.pow(10, Math.floor(g() * 12) - 6);
    const a = g() - 0.5, b = g() - 0.5, c = g() - 0.5, d = g() - 0.5, e = g() - 0.5, f = g() - 0.5;
    const A = [[a * s, d * s, e * s], [d * s, b * s, f * s], [e * s, f * s, c * s]];
    if (t % 5 === 0) { A[0][1] = A[1][0] = 0; A[0][2] = A[2][0] = 0; } // 対角に近いもの
    if (t % 7 === 0) { A[1][1] = A[0][0]; A[2][2] = A[0][0]; } // 重根
    const { values, vectors } = W.jacobiEigen(A);
    const nA = Math.max(...A.flat().map(Math.abs)) || 1;
    for (let k = 0; k < 3; k++) {
      const v = [vectors[0][k], vectors[1][k], vectors[2][k]];
      const Av = [0, 1, 2].map(i => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]);
      const r = Math.hypot(...Av.map((x, i) => x - values[k] * v[i])) / nA;
      worst = Math.max(worst, r);
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let dot = 0; for (let k = 0; k < 3; k++) dot += vectors[k][i] * vectors[k][j]; worstOrth = Math.max(worstOrth, Math.abs(dot - (i === j ? 1 : 0))); }
  }
  show('jacobiEigen 2 万個: |Av−λv|/|A| の最大・直交の崩れの最大', [worst.toExponential(2), worstOrth.toExponential(2)]);
  // 大きな値（絶対値の閾値 1e-12 の影響）
  const A = [[1e8, 3e3, 0], [3e3, 2e8, 1e-9], [0, 1e-9, 3e8]];
  const r = W.jacobiEigen(A); show('jacobiEigen 大きな値', r.values.map(v => v.toExponential(6)));
}
// ---- analyze: 合成した廊下（床・天井・左右の壁）を回して戻せるか、平行移動で変わらないか
function corridor(n, tiltDeg, yawDeg, shift, noise = 0.01) {
  const P = new Float32Array(3 * n);
  const tz = tiltDeg * Math.PI / 180, ty = yawDeg * Math.PI / 180;
  const cy = Math.cos(ty), sy = Math.sin(ty), cx = Math.cos(tz), sx = Math.sin(tz);
  for (let i = 0; i < n; i++) {
    const t = g(); let p;
    if (t < 0.35) p = [g() * 40, g() * 3, 0];
    else if (t < 0.7) p = [g() * 40, g() * 3, 2.6];
    else if (t < 0.85) p = [g() * 40, 0, g() * 2.6];
    else p = [g() * 40, 3, g() * 2.6];
    p = p.map(v => v + gauss() * noise);
    // x 軸まわりに傾け、z 軸まわりに回し、平行移動
    let [x, y, z] = p; [y, z] = [cx * y - sx * z, sx * y + cx * z]; [x, y] = [cy * x - sy * y, sy * x + cy * y];
    P[3 * i] = x + shift[0]; P[3 * i + 1] = y + shift[1]; P[3 * i + 2] = z + shift[2];
  }
  const ds = { n, positions: P }; ds.bbox = W.bbox(P); return ds;
}
for (const [tilt, yaw, sh] of [[0, 0, [0, 0, 0]], [3, 30, [0, 0, 0]], [3, 30, [5000, 5000, 0]], [3, 30, [9990, 9990, 0]], [8, -60, [0, 0, 0]], [3, 30, [0, 0, 9990]]]) {
  const ds = corridor(150000, tilt, yaw, sh);
  try {
    const r = W.analyze(ds);
    show(`analyze 傾き ${tilt}°・向き ${yaw}°・平行移動 ${sh}`, `傾き ${r.tiltDeg.toFixed(3)}° 向き補正 ${r.yawDeg.toFixed(3)}° 床 ${r.floorZ?.toFixed(3)}`);
  } catch (e) { show(`analyze 傾き ${tilt}°・向き ${yaw}°・平行移動 ${sh}`, 'エラー: ' + e.message); }
}
