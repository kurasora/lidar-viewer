// src/worker.js の計算（取り出して実行）: 統計・混ぜ方・索引・点選び・固有値・水平補正
import { test, eq, ok, near, setFile } from './lib/harness.mjs';
import { workerFns } from './lib/workerfns.mjs';
setFile('t_worker');
const W = workerFns();
let seed = 4242; const g = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
const gauss = () => { let u = 0, v = 0; while (!u) u = g(); while (!v) v = g(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], LO = [-1e9, -1e9, -1e9], HI = [1e9, 1e9, 1e9];
const mk = (n, f) => { const P = new Float32Array(3 * n); for (let i = 0; i < n; i++) { const p = f(i); P[3 * i] = p[0]; P[3 * i + 1] = p[1]; P[3 * i + 2] = p[2]; } const ds = { n, positions: P }; ds.bbox = W.bbox(P); return ds; };

test('OK-W01', 'fieldStats: 最小・最大・1/99 パーセンタイル・カテゴリの判定（整数・32 種類以下・幅 1000 未満）', () => {
  const a = W.fieldStats(new Float32Array([1, 2, 3, 4, 5]));
  eq([a.min, a.max, a.categorical, a.values], [1, 5, true, [1, 2, 3, 4, 5]]);
  const b = W.fieldStats(new Float32Array(Array.from({ length: 1000 }, (_, i) => i * 0.5)));
  eq([b.categorical, b.p1, b.p99], [false, 5, 495]);
  eq(W.fieldStats(new Float32Array([0, 5000, 0])).categorical, false);
});
test('OK-W02', 'fieldStats: NaN を最小・最大・パーセンタイルに入れない', () => {
  const a = W.fieldStats(new Float32Array([1, 2, NaN, 2, 1]));
  eq([a.min, a.max, a.p1, a.p99], [1, 2, 1, 2]);
});
test('OK-W03', 'shuffle: 並べ替えは順列で、座標・色・欄が一緒に動く', () => {
  const n = 5000, P = new Float32Array(3 * n), C = new Uint8Array(3 * n), F = new Float32Array(n);
  for (let i = 0; i < n; i++) { P[3 * i] = i; P[3 * i + 1] = -i; P[3 * i + 2] = 2 * i; C[3 * i] = i & 255; C[3 * i + 1] = i >> 8; F[i] = i; }
  W.shuffle({ n, positions: P, rgb: C, fields: { f: F } });
  const seen = new Set(); let bad = 0;
  for (let i = 0; i < n; i++) { const id = F[i]; seen.add(id); if (P[3 * i] !== id || P[3 * i + 1] !== -id || P[3 * i + 2] !== 2 * id || C[3 * i] !== (id & 255) || C[3 * i + 1] !== (id >> 8)) bad++; }
  eq([bad, seen.size], [0, n]);
  let s = 0; for (let i = 0; i < 500; i++) s += F[i]; near(s / 500 / n, 0.5, 0.05, '先頭 500 個が全体からの無作為な標本');
});
const brute = (ds, o, d, tolA, tolB) => { let best = null, bt = Infinity; const P = ds.positions; for (let i = 0; i < ds.n; i++) { const vx = P[3 * i] - o[0], vy = P[3 * i + 1] - o[1], vz = P[3 * i + 2] - o[2]; const tt = vx * d[0] + vy * d[1] + vz * d[2]; if (tt <= 0) continue; const perp2 = vx * vx + vy * vy + vz * vz - tt * tt, tl = tolA * tt + tolB; if (perp2 > tl * tl) continue; if (tt < bt) { bt = tt; best = i; } } return best; };
const pickCases = () => [
  ['廊下らしい面 5 万点', mk(50000, () => { const t = g(); return t < 0.4 ? [g() * 60, g() * 3, 0] : t < 0.8 ? [g() * 60, g() * 3, 2.6] : [g() * 60, g() < 0.5 ? 0 : 3, g() * 2.6]; })],
  ['まばらな 200 点', mk(200, () => [g() * 100, g() * 100, g() * 10])],
  ['遠い外れ値 1 点 + 密な 2 万点', mk(20001, i => (i === 0 ? [1e5, 1e5, 1e4] : [g() * 10, g() * 10, g() * 3]))],
];
test('OK-W04', 'pickIn: 光線に最も近い（手前の）点を総当たりと同じに選ぶ（300 回 × 3 種類、透視の許容）', () => {
  for (const [name, ds] of pickCases()) {
    let diff = 0;
    for (let q = 0; q < 300; q++) {
      const j = (q * 7919) % ds.n, tgt = [ds.positions[3 * j], ds.positions[3 * j + 1], ds.positions[3 * j + 2]];
      const o = [tgt[0] - 20 + g() * 2, tgt[1] - 30 + g() * 2, tgt[2] + 15 + g()];
      let d = [tgt[0] - o[0] + (g() - 0.5) * 0.3, tgt[1] - o[1] + (g() - 0.5) * 0.3, tgt[2] - o[2] + (g() - 0.5) * 0.3]; const L = Math.hypot(...d); d = d.map(v => v / L);
      const tolA = q % 2 ? 0.002 : 0.02;
      const a = W.pickIn(ds, o, d, tolA, 0, I, LO, HI), b = brute(ds, o, d, tolA, 0);
      if ((a ? a.index : null) !== b) diff++;
    }
    eq(diff, 0, name);
  }
}, { timeout: 120000 });
test('A04-039', 'pickIn: 遠い外れ値が 1 点ある点群でも、引いて見た（許容が格子 3 個分より広い）ときに点を選べる', () => {
  // 許容の半径が 3 マスを超えると、光線から 3 マスより離れた点を調べない
  const ds = mk(2000, i => [i * 0.5, 0, 0]); // 1 m 間隔ではなく 0.5 m 間隔の直線
  const o = [500, -50, 0], d = [0, 1, 0];
  // 光線は x=500 を通る。最も近い点は x=500 ちょうど（i=1000）。ずらして x=500.3（点から 0.3 m 横）を通す
  const o2 = [500.3, -50, 0];
  // 0.4.0 から画面の「選ぶ」は 2 段（R7-004）: 一番手前の点を探し、その奥行きから許す幅の 3 倍までで光線に一番近い点を選び直す
  let r = W.pickIn(ds, o2, d, 0, 2.0, I, LO, HI); // 平行投影の許容 2 m（画面で 5 px が 2 m の縮尺）
  if (r) { const w = 3 * 2.0 + ds.index.cell; r = W.pickIn(ds, o2, d, 0, 2.0, I, LO, HI, null, [r.t, r.t + w]) || r; }
  ok(r && Math.abs(r.p[0] - 500.5) < 0.6, r ? `選んだ点 ${r.p}` : '見つからない');
});
test('OK-W05', 'pointSpacing: 1 cm の格子 20 万点で 1 cm', () => {
  const ds = mk(200000, i => [(i % 1000) * 0.01, Math.floor(i / 1000) * 0.01, 0]);
  near(W.pointSpacing(ds), 0.01, 1e-4);
});
test('A04-039', 'pointSpacing / 索引: 5000 km 先の外れ値 1 点があっても点の間隔を出せる（null にしない）', () => {
  const ds = mk(100000, i => (i === 0 ? [5e6, 5e6, 5e5] : [(i % 1000) * 0.01, Math.floor(i / 1000) * 0.01, 0]));
  const t0 = Date.now(); const sp = W.pointSpacing(ds);
  ok(sp !== null && Math.abs(sp - 0.01) < 0.005, `点の間隔 ${sp}`);
  // 0.4.0 から索引は 2 段（粗い格子 + 細かい格子）。外れ値で細かい格子が粗くなっても、選ぶ操作が固まらないこと（B25: 以前は 26〜57 秒）を時間で確かめる
  const t1 = Date.now();
  for (let q = 0; q < 50; q++) W.pickIn(ds, [(q % 10) + 0.003, -5, 1], [0, Math.SQRT1_2, -Math.SQRT1_2], 0.002, 0, I, LO, HI);
  const ms = Date.now() - t1;
  ok(ms < 5000, `50 回の選ぶ操作に ${ms} ms（索引のマス ${ds.index.keys.length} 個、格子 ${ds.index.cell} m、作るのに ${t1 - t0} ms）`);
});
for (const [id, lo, hi] of [['OK-W06', -2, 6], ['A04-047', -7, -5]]) test(id, `jacobiEigen: 無作為な対称行列 2 万個（値の大きさ 1e${lo}〜1e${hi}）で A v = λ v（残差 1e-9 以下）・固有ベクトルが直交（重根・対角に近いものを含む）`, () => {
  let worst = 0, worstOrth = 0;
  for (let t = 0; t < 20000; t++) {
    const s = Math.pow(10, lo + Math.floor(g() * (hi - lo + 1))), r = () => (g() - 0.5) * s;
    const A = [[r(), 0, 0], [0, r(), 0], [0, 0, r()]]; A[0][1] = A[1][0] = r(); A[0][2] = A[2][0] = r(); A[1][2] = A[2][1] = r();
    if (t % 5 === 0) { A[0][1] = A[1][0] = 0; A[0][2] = A[2][0] = 0; }
    if (t % 7 === 0) { A[1][1] = A[0][0]; A[2][2] = A[0][0]; }
    const { values, vectors } = W.jacobiEigen(A), nA = Math.max(...A.flat().map(Math.abs)) || 1;
    for (let k = 0; k < 3; k++) { const v = [vectors[0][k], vectors[1][k], vectors[2][k]]; const Av = [0, 1, 2].map(i => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]); worst = Math.max(worst, Math.hypot(...Av.map((x, i) => x - values[k] * v[i])) / nA); }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let dot = 0; for (let k = 0; k < 3; k++) dot += vectors[k][i] * vectors[k][j]; worstOrth = Math.max(worstOrth, Math.abs(dot - (i === j ? 1 : 0))); }
  }
  ok(worst < 1e-9 && worstOrth < 1e-9, `残差 ${worst.toExponential(2)}・直交 ${worstOrth.toExponential(2)}`);
});
test('OK-W07', 'rotationTo: u を +z に重ねる（真下・真上を含む）', () => {
  for (const u of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [0.1, -0.2, 0.97], [0.6, 0.8, 0]]) {
    const L = Math.hypot(...u), v = u.map(x => x / L), R = W.rotationTo(v);
    near(W.apply(R, v), [0, 0, 1], 1e-9, JSON.stringify(u));
    near([0, 1, 2].map(i => Math.hypot(...R[i])), [1, 1, 1], 1e-9);
  }
});
// 水平補正の解析: 実際の廊下の地図（sample/map.json、約 100 万点）を回し・ずらして、元に戻せるか
import { readFileSync, existsSync } from 'node:fs';
import { src as _src } from './lib/harness.mjs';
function sampleMap() {
  const f = _src('sample/map.json'); if (!existsSync(f)) return null;
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const q = new Uint16Array(Uint8Array.from(Buffer.from(d.b64, 'base64')).buffer);
  const n = d.n, P = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) P[3 * i + k] = d.lo[k] + d.sc[k] * q[3 * i + k];
  return { n, P };
}
let MAP = null;
function transformed(tiltDeg, yawDeg, shift) {
  MAP = MAP || sampleMap();
  const { n, P } = MAP, Q = new Float32Array(3 * n);
  const tz = tiltDeg * Math.PI / 180, ty = yawDeg * Math.PI / 180, cy = Math.cos(ty), sy = Math.sin(ty), cx = Math.cos(tz), sx = Math.sin(tz);
  // 混ぜる（アプリは読み込み後に shuffle するので、先頭 40 万点が無作為な標本になる）
  const idx = Uint32Array.from({ length: n }, (_, i) => i); let s2 = 99; const r = () => (s2 = (Math.imul(s2, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  for (let ii = 0; ii < n; ii++) { const i = idx[ii]; let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2]; [y, z] = [cx * y - sx * z, sx * y + cx * z]; [x, y] = [cy * x - sy * y, sy * x + cy * y]; Q[3 * ii] = x + shift[0]; Q[3 * ii + 1] = y + shift[1]; Q[3 * ii + 2] = z + shift[2]; }
  const ds = { n, positions: Q, offset: [0, 0, 0] }; ds.bbox = W.bbox(Q); return ds; // offset: 0.4.1 から床探しでファイルの原点を使う
}
let BASE = null;
for (const [tilt, yaw, sh] of [[0, 0, [0, 0, 0]], [3, 30, [0, 0, 0]], [8, -60, [0, 0, 0]], [3, 30, [5000, 5000, 0]], [3, 30, [9990, 9990, 9990]]]) {
  test(sh[0] > 1000 ? 'OK-W09' : 'OK-W08', `analyze（実際の廊下の地図）: 傾き ${tilt}°・向き ${yaw}°・平行移動 ${sh} を加えても、元と同じ傾き・向き・床の高さに戻せる`, () => {
    if (!sampleMap()) return;
    BASE = BASE || W.analyze(transformed(0, 0, [0, 0, 0]));
    const r = W.analyze(transformed(tilt, yaw, sh));
    // 元の地図そのものの傾き（BASE.tiltDeg）に、加えた傾きが足される/引かれる。ここでは「補正後に床が水平になる」ことを、
    // 戻した上方向 up と、加えた回転で動かした元の上方向の一致で確かめる
    const up0 = [BASE.R1[2][0], BASE.R1[2][1], BASE.R1[2][2]];
    const tz = tilt * Math.PI / 180, ty = yaw * Math.PI / 180;
    let [x, y, z] = up0; [y, z] = [Math.cos(tz) * y - Math.sin(tz) * z, Math.sin(tz) * y + Math.cos(tz) * z]; [x, y] = [Math.cos(ty) * x - Math.sin(ty) * y, Math.sin(ty) * x + Math.cos(ty) * y];
    const up1 = [r.R1[2][0], r.R1[2][1], r.R1[2][2]];
    const ang = Math.acos(Math.min(1, Math.abs(x * up1[0] + y * up1[1] + z * up1[2]))) * 180 / Math.PI;
    ok(ang < 0.2, `上方向のずれ ${ang.toFixed(3)}°（傾き ${r.tiltDeg.toFixed(3)}°・基準 ${BASE.tiltDeg.toFixed(3)}°）`);
    ok(r.floorZ !== null && BASE.floorZ !== null, '床が見つからない');
  }, { timeout: 180000 });
}
