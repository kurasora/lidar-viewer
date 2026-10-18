import { join } from 'node:path';
const ROOT = process.env.PCDV_ROOT || '/home/claude/pcd-viewer';
const { Sink, addMesh, addLines } = await import(join(ROOT, 'src/io/sink.js'));
const { rng } = await import(join(ROOT, 'src/io/util.js'));

// カイ二乗の上側確率（Wilson–Hilferty 近似）
function chi2p(x, k) { const z = (Math.cbrt(x / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k)); return 0.5 * erfc(z / Math.SQRT2); }
function erfc(x) { const t = 1 / (1 + 0.5 * Math.abs(x)); const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : 2 - y; }

// 1) 1 回の抽出で、選ばれた点の番号（入力の順番）の分布が一様か（cap 点を B 個の区間に分けて数える）
function once(cap, N, seed, withHint = false) {
  const s = new Sink({ cap });
  if (seed !== undefined) s.r = rng(seed);
  if (withHint) s.hint(N);
  const fi = s.field('id');
  for (let i = 0; i < N; i++) { const k = s.slot(i, 0, 0); if (k >= 0) s.F[fi][k] = i; }
  return s.finish();
}
for (const [cap, N] of [[1000, 1000], [1000, 1001], [1000, 3000], [1000, 10000], [10000, 1000000], [100000, 2000000], [3, 3000000]]) {
  const r = once(cap, N);
  const B = Math.min(100, Math.max(2, Math.floor(r.n / 20)));
  const h = new Float64Array(B);
  let mismatch = 0;
  for (let k = 0; k < r.n; k++) { const id = r.fields.id[k]; if (r.positions[3 * k] !== id && Math.abs(r.positions[3 * k] - id) > Math.abs(id) * 1e-6 + 1e-6) mismatch++; h[Math.min(B - 1, Math.floor(id / N * B))]++; }
  const e = r.n / B; let x = 0; for (const v of h) x += (v - e) ** 2 / e;
  console.log(`cap=${cap} N=${N}: n=${r.n} total=${r.total} sampled=${r.sampled} 区間 ${B} の χ²=${x.toFixed(1)} p=${chi2p(x, B - 1).toFixed(3)} 欄と座標のずれ=${mismatch}`);
}
// 2) 種を変えた多数回の試行で、各番号が選ばれる確率が cap/N か（小さな N）
for (const [cap, N, T] of [[1, 10, 20000], [3, 10, 20000], [5, 50, 20000], [10, 11, 20000], [2, 1000, 50000]]) {
  const cnt = new Float64Array(N);
  for (let t = 0; t < T; t++) { const r = once(cap, N, 1000 + t * 7919); for (let k = 0; k < r.n; k++) cnt[r.fields.id[k]]++; }
  const e = T * cap / N; let x = 0; for (const v of cnt) x += (v - e) ** 2 / e;
  let mn = Infinity, mx = -Infinity; for (const v of cnt) { mn = Math.min(mn, v / T); mx = Math.max(mx, v / T); }
  console.log(`多数回 cap=${cap} N=${N} 試行 ${T}: 期待 ${(cap / N).toFixed(4)} 実際 ${mn.toFixed(4)}〜${mx.toFixed(4)} χ²=${x.toFixed(1)} 自由度 ${N - 1} p=${chi2p(x, N - 1).toFixed(3)}`);
}
// 3) 対で選ばれる確率（2 点が同時に選ばれる確率 = cap(cap-1)/(N(N-1)) になるか）: 隣どうしと離れた組
{
  const cap = 3, N = 12, T = 60000;
  const pair = new Float64Array(N * N);
  for (let t = 0; t < T; t++) { const r = once(cap, N, 5 + t * 104729); const ids = Array.from(r.fields.id); for (const a of ids) for (const b of ids) if (a < b) pair[a * N + b]++; }
  const e = T * cap * (cap - 1) / (N * (N - 1));
  let x = 0, m = 0; for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) { x += (pair[a * N + b] - e) ** 2 / e; m++; }
  console.log(`対の同時選択 cap=${cap} N=${N}: χ²=${x.toFixed(1)} 自由度 ${m - 1} p=${chi2p(x, m - 1).toFixed(3)}`);
}
// 4) hint の有無で結果が同じか
{
  const a = once(5000, 100000, undefined, false), b = once(5000, 100000, undefined, true);
  let same = a.n === b.n; for (let i = 0; i < a.n && same; i++) if (a.fields.id[i] !== b.fields.id[i]) same = false;
  console.log('hint の有無で同じ結果:', same);
}
// 5) NaN・Inf の数え方
{
  const s = new Sink({ cap: 10 });
  const vals = [[0, 0, 0], [NaN, 0, 0], [0, Infinity, 0], [0, 0, -Infinity], [1, 1, 1], [undefined, 1, 1], [null, 1, 1], ['1', 2, 3]];
  const ks = vals.map(v => s.slot(...v));
  const r = s.finish();
  console.log('NaN/Inf/undefined/null/文字列:', ks, 'n', r.n, 'skipped', r.skipped, 'total', r.total, '位置', Array.from(r.positions));
}
// 6) グローバルシフト
for (const first of [[9999.99, 0, 0], [10000, 0, 0], [-10000.4, 5, 5], [539012.3, 3836044.7, 30.2], [-539012.3, -3836044.7, -1e4], [1e15, 0, 0], [0, 0, 0]]) {
  const s = new Sink();
  s.slot(...first);
  console.log('最初の点', JSON.stringify(first), '→ シフト', JSON.stringify(s.offset));
}
// 6b) 最初の点だけ原点付近、残りが UTM のとき
{
  const s = new Sink();
  s.slot(0, 0, 0);
  let maxErr = 0;
  const g = rng(3);
  const pts = [];
  for (let i = 0; i < 10000; i++) { const p = [539000 + g() * 100, 3836000 + g() * 100, 30 + g() * 3]; pts.push(p); s.slot(...p); }
  const r = s.finish();
  for (let i = 1; i < r.n; i++) for (let k = 0; k < 3; k++) maxErr = Math.max(maxErr, Math.abs(r.positions[3 * i + k] + r.offset[k] - pts[i - 1][k]));
  console.log('先頭が (0,0,0) で残りが UTM: シフト', r.offset, '座標の最大誤差', maxErr.toFixed(4), 'm');
  const s2 = new Sink();
  for (const p of pts) s2.slot(...p);
  const r2 = s2.finish(); let e2 = 0;
  for (let i = 0; i < r2.n; i++) for (let k = 0; k < 3; k++) e2 = Math.max(e2, Math.abs(r2.positions[3 * i + k] + r2.offset[k] - pts[i][k]));
  console.log('同じ点で先頭の (0,0,0) なし: シフト', r2.offset, '最大誤差', e2.toExponential(2), 'm');
}
// 6c) 2 つ目のファイルに 1 つ目のシフト（[0,0,0]）を渡したとき（アプリは S.offset を次のファイルに渡す）
{
  const s = new Sink({ offset: [0, 0, 0] });
  const g = rng(9); let e = 0; const pts = [];
  for (let i = 0; i < 10000; i++) { const p = [539000 + g() * 100, 3836000 + g() * 100, 30 + g() * 3]; pts.push(p); s.slot(...p); }
  const r = s.finish();
  for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(r.positions[3 * i + k] + r.offset[k] - pts[i][k]));
  console.log('offset=[0,0,0] を渡して UTM を読む: 最大誤差', e.toFixed(4), 'm');
}
// 7) 確保の大きさ（hint が大きく実際は少ない）
{
  const s = new Sink({ cap: 3e7 });
  s.hint(4e9);
  for (const nm of ['intensity', 'classification', 'return_number', 'gps_time', 'point_source_id']) s.field(nm);
  s.rgb();
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) s.slot(i, i, i);
  const r = s.finish();
  const bytes = s.P.byteLength + s.F.reduce((a, f) => a + f.byteLength, 0) + (s.C ? s.C.byteLength : 0);
  console.log(`hint 4e9・実際 10 点: 確保 ${(bytes / 1e6).toFixed(0)} MB（${Date.now() - t0} ms）、finish の positions.buffer ${(r.positions.buffer.byteLength / 1e6).toFixed(0)} MB`);
}
// 8) addMesh: 面積に比例して散らす（2 つの三角形、面積 1:3）
{
  const s = new Sink();
  const V = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 13, 0, 0, 10, 2, 0]);
  addMesh(s, V, new Uint32Array([0, 1, 2, 3, 4, 5]), null, 100006);
  const r = s.finish(); let a = 0, b = 0;
  for (let i = 6; i < r.n; i++) (r.positions[3 * i] < 5 ? a++ : b++);
  console.log('addMesh 面積 0.5 : 3 →', a, ':', b, '（期待 1 : 6、計', a + b, '）');
  // 範囲外の頂点番号・NaN の頂点
  const s2 = new Sink();
  addMesh(s2, new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, NaN, 0, 0]), new Uint32Array([0, 1, 2, 0, 1, 9, 0, 1, 3]), null, 1000);
  const r2 = s2.finish();
  console.log('addMesh 範囲外・NaN を含む: n', r2.n, 'skipped', r2.skipped);
}
// 9) addLines: 色の付かない線を、色を持つ入れ物に足したとき
{
  const s = new Sink({ cap: 1000 });
  addMesh(s, new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2]), new Uint8Array([255, 0, 0, 255, 0, 0, 255, 0, 0]), 500);
  addLines(s, [{ V: [0, 0, 5, 10, 0, 5], closed: false }], 600);
  const r = s.finish();
  const lineCols = new Map();
  for (let i = 0; i < r.n; i++) if (r.positions[3 * i + 2] === 5) { const c = `${r.rgb[3 * i]},${r.rgb[3 * i + 1]},${r.rgb[3 * i + 2]}`; lineCols.set(c, (lineCols.get(c) || 0) + 1); }
  console.log('色つきの面のあとに色なしの線（cap 1000、計 ~1100 点）: 線の点の色', JSON.stringify([...lineCols]));
}
// 10) cap に NaN・0・負・小数
for (const c of [NaN, 0, -5, 2.7, '100', undefined]) {
  try { const s = new Sink({ cap: c }); for (let i = 0; i < 10; i++) s.slot(i, 0, 0); const r = s.finish(); console.log('cap', String(c), '→ this.cap', s.cap, 'n', r.n); } catch (e) { console.log('cap', String(c), 'error', e.message); }
}
