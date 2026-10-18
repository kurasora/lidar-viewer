// src/io/sink.js の単体試験（Algorithm L・グローバルシフト・addMesh・addLines）
import { test, eq, ok, near, src, setFile } from './lib/harness.mjs';
setFile('t_sink');
const { Sink, addMesh, addLines } = await import(src('src/io/sink.js'));
const { rng } = await import(src('src/io/util.js'));

function chi2p(x, k) { const z = (Math.cbrt(x / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k)); return 0.5 * erfc(z / Math.SQRT2); }
function erfc(x) { const t = 1 / (1 + 0.5 * Math.abs(x)); const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : 2 - y; }
function once(cap, N, seed, withHint = false) {
  const s = new Sink({ cap });
  if (seed !== undefined) s.r = rng(seed);
  if (withHint) s.hint(N);
  const fi = s.field('id');
  s.rgb();
  for (let i = 0; i < N; i++) { const k = s.slot(i, -i, 0.5 * i); if (k >= 0) { s.F[fi][k] = i; s.C[3 * k] = i & 255; s.C[3 * k + 1] = (i >> 8) & 255; s.C[3 * k + 2] = (i >> 16) & 255; } }
  return s.finish();
}
for (const [cap, N] of [[1, 1], [1, 2], [1000, 1000], [1000, 1001], [1000, 3000], [1000, 10000], [10000, 1000000], [3, 3000000]]) {
  test('OK-S01', `Algorithm L: cap=${cap} N=${N} で点数・総数・欄と座標と色の対応が正しい`, () => {
    const r = once(cap, N);
    eq([r.n, r.total, r.sampled], [Math.min(cap, N), N, N > cap]);
    const seen = new Set();
    for (let k = 0; k < r.n; k++) {
      const id = r.fields.id[k];
      ok(!seen.has(id), `同じ点が 2 回: ${id}`); seen.add(id);
      ok(Math.abs(r.positions[3 * k] - id) <= Math.abs(id) * 1e-7 && Math.abs(r.positions[3 * k + 1] + id) <= Math.abs(id) * 1e-7, `座標と欄がずれた k=${k}`);
      ok(r.rgb[3 * k] === (id & 255) && r.rgb[3 * k + 1] === ((id >> 8) & 255), `色と欄がずれた k=${k}`);
    }
  }, { timeout: 120000 });
}
test('OK-S02', 'Algorithm L: 1 回の抽出で、選ばれた点の入力順の分布が一様（カイ二乗 p > 0.001）', () => {
  for (const [cap, N] of [[1000, 3000], [1000, 10000], [10000, 1000000], [100000, 2000000]]) {
    const r = once(cap, N); const B = 100, h = new Float64Array(B);
    for (let k = 0; k < r.n; k++) h[Math.min(B - 1, Math.floor(r.fields.id[k] / N * B))]++;
    const e = r.n / B; let x = 0; for (const v of h) x += (v - e) ** 2 / e;
    ok(chi2p(x, B - 1) > 0.001, `cap=${cap} N=${N} χ²=${x.toFixed(1)}`);
  }
}, { timeout: 120000 });
test('OK-S03', 'Algorithm L: 種を変えた多数回で、各点が選ばれる確率 = cap/N（カイ二乗 p > 0.001）', () => {
  for (const [cap, N, T] of [[1, 10, 20000], [3, 10, 20000], [5, 50, 20000], [10, 11, 20000]]) {
    const cnt = new Float64Array(N);
    for (let t = 0; t < T; t++) { const r = once(cap, N, 1000 + t * 7919); for (let k = 0; k < r.n; k++) cnt[r.fields.id[k]]++; }
    const e = T * cap / N; let x = 0; for (const v of cnt) x += (v - e) ** 2 / e;
    ok(chi2p(x, N - 1) > 0.001, `cap=${cap} N=${N} χ²=${x.toFixed(1)}`);
  }
}, { timeout: 120000 });
test('OK-S04', 'Algorithm L: 2 点が同時に選ばれる確率も一様（cap=3, N=12）', () => {
  const cap = 3, N = 12, T = 40000, pair = new Float64Array(N * N);
  for (let t = 0; t < T; t++) { const r = once(cap, N, 5 + t * 104729); const ids = Array.from(r.fields.id); for (const a of ids) for (const b of ids) if (a < b) pair[a * N + b]++; }
  const e = T * cap * (cap - 1) / (N * (N - 1)); let x = 0, m = 0;
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) { x += (pair[a * N + b] - e) ** 2 / e; m++; }
  ok(chi2p(x, m - 1) > 0.001, `χ²=${x.toFixed(1)}`);
}, { timeout: 120000 });
test('OK-S05', 'hint の有無で選ばれる点が同じ', () => {
  const a = once(5000, 100000, undefined, false), b = once(5000, 100000, undefined, true);
  eq(Array.from(a.fields.id), Array.from(b.fields.id));
});
test('OK-S06', 'NaN・±Inf・undefined の点は除いて skipped に数え、total には入れない', () => {
  const s = new Sink({ cap: 10 });
  const ks = [[0, 0, 0], [NaN, 0, 0], [0, Infinity, 0], [0, 0, -Infinity], [1, 1, 1], [undefined, 1, 1]].map(v => s.slot(...v));
  const r = s.finish();
  eq(ks, [0, -1, -1, -1, 1, -1]); eq([r.n, r.skipped, r.total], [2, 4, 2]);
});
test('OK-S07', 'グローバルシフト: |v| が 1e4 以上の軸だけ 100 単位で丸めて引く（閾値の前後・負）', () => {
  for (const [p, o] of [[[9999.99, 0, 0], [0, 0, 0]], [[10000, 0, 0], [10000, 0, 0]], [[-10000.4, 5, 5], [-10000, 0, 0]], [[539012.3, 3836044.7, 30.2], [539000, 3836000, 0]], [[-539012.3, -3836044.7, -1e4], [-539000, -3836000, -10000]]]) {
    const s = new Sink(); s.slot(...p); eq(s.offset.map(v => v + 0), o, JSON.stringify(p));
  }
});
test('OK-S08', 'グローバルシフト: UTM の点を 1 μm 以内で保持する', () => {
  const s = new Sink(); const g = rng(3), pts = [];
  for (let i = 0; i < 10000; i++) { const p = [539000 + g() * 100, 3836000 + g() * 100, 30 + g() * 3]; pts.push(p); s.slot(...p); }
  const r = s.finish(); let e = 0;
  for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(r.positions[3 * i + k] + r.offset[k] - pts[i][k]));
  ok(e < 1e-5, `最大誤差 ${e}`);
});
test('A04-007', 'グローバルシフト: 先頭の 1 点だけ原点付近でも、残りの UTM の点を 1 cm 以内で保持する', () => {
  const s = new Sink(); s.slot(0, 0, 0);
  const g = rng(3), pts = [];
  for (let i = 0; i < 10000; i++) { const p = [539000 + g() * 100, 3836000 + g() * 100, 30 + g() * 3]; pts.push(p); s.slot(...p); }
  const r = s.finish(); let e = 0;
  for (let i = 1; i < r.n; i++) for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(r.positions[3 * i + k] + r.offset[k] - pts[i - 1][k]));
  ok(e < 0.01, `シフト ${JSON.stringify(r.offset)}・最大誤差 ${e.toFixed(4)} m`);
});
test('A04-008', 'グローバルシフト: 渡されたシフト（前のファイルの [0,0,0]）が合わない UTM の点でも 1 cm 以内', () => {
  const s = new Sink({ offset: [0, 0, 0] }); const g = rng(9), pts = [];
  for (let i = 0; i < 10000; i++) { const p = [539000 + g() * 100, 3836000 + g() * 100, 30 + g() * 3]; pts.push(p); s.slot(...p); }
  const r = s.finish(); let e = 0;
  for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(r.positions[3 * i + k] + r.offset[k] - pts[i][k]));
  ok(e < 0.01, `最大誤差 ${e.toFixed(4)} m（Float32 に丸められている）`);
});
test('A04-009', '確保: 頭書きの点数（hint）が実際よりはるかに多くても、実際の点数に見合った大きさしか確保しない（10 点で 100 MB 未満）', () => {
  const s = new Sink({ cap: 3e7 }); s.hint(4e9);
  for (const nm of ['intensity', 'classification', 'return_number', 'gps_time', 'point_source_id']) s.field(nm);
  s.rgb();
  for (let i = 0; i < 10; i++) s.slot(i, i, i);
  const bytes = s.P.byteLength + s.F.reduce((a, f) => a + f.byteLength, 0) + s.C.byteLength;
  ok(bytes < 100e6, `${(bytes / 1e6).toFixed(0)} MB を確保した`);
});
test('OK-S09', 'cap: 0・負・小数は 1 以上の整数に、未指定は 3,000 万', () => {
  for (const [c, want] of [[0, 1], [-5, 1], [2.7, 2], [undefined, 3e7]]) eq(new Sink({ cap: c }).cap, want, String(c));
});
test('OK-S10', 'addMesh: 面積に比例して点を散らす（面積 0.5 : 3 → 1 : 6）', () => {
  const s = new Sink();
  addMesh(s, new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 13, 0, 0, 10, 2, 0]), new Uint32Array([0, 1, 2, 3, 4, 5]), null, 100006);
  const r = s.finish(); let a = 0, b = 0;
  for (let i = 6; i < r.n; i++) (r.positions[3 * i] < 5 ? a++ : b++);
  near(b / a, 6, 0.05); eq(r.n, 100006);
});
test('OK-S11', 'addMesh: 三角形の内側にだけ点を置く（重心座標が 0〜1）', () => {
  const s = new Sink();
  addMesh(s, new Float64Array([0, 0, 0, 4, 0, 0, 0, 2, 0]), new Uint32Array([0, 1, 2]), null, 20003);
  const r = s.finish();
  for (let i = 3; i < r.n; i++) { const x = r.positions[3 * i], y = r.positions[3 * i + 1]; ok(x >= -1e-6 && y >= -1e-6 && x / 4 + y / 2 <= 1 + 1e-6, `外 (${x},${y})`); }
});
test('OK-S12', 'addMesh: 範囲外の頂点番号・NaN の頂点の面は面積 0 として捨てる', () => {
  const s = new Sink();
  addMesh(s, new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, NaN, 0, 0]), new Uint32Array([0, 1, 2, 0, 1, 9, 0, 1, 3]), null, 1000);
  const r = s.finish(); eq([r.n, r.skipped], [999, 1]);
});
test('OK-S13', 'addMesh: 頂点の色を面の中で補間する', () => {
  const s = new Sink();
  addMesh(s, new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2]), new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]), 1003);
  const r = s.finish();
  for (let i = 3; i < r.n; i++) { const x = r.positions[3 * i], y = r.positions[3 * i + 1], w = 1 - x - y; near([r.rgb[3 * i], r.rgb[3 * i + 1], r.rgb[3 * i + 2]], [255 * w, 255 * x, 255 * y], 1.01); }
});
test('OK-S14', 'addLines: 線の長さに比例して等間隔に点を並べる・閉じた線は最後の辺も', () => {
  const s = new Sink();
  addLines(s, [{ V: [0, 0, 0, 10, 0, 0, 10, 10, 0], closed: true }], 1000);
  const r = s.finish();
  let diag = 0; for (let i = 0; i < r.n; i++) { const x = r.positions[3 * i], y = r.positions[3 * i + 1]; if (Math.abs(x - y) < 1e-4 && x > 0.5 && x < 9.5) diag++; }
  ok(r.n > 900 && r.n <= 1000, `n=${r.n}`); ok(diag > 200, `閉じる辺の点 ${diag}`);
});
test('A04-010', 'addLines: 色を持つ入れ物に色なしの線を足すと、線の点は灰色（黒や前の点の色にならない）', () => {
  const s = new Sink({ cap: 1000 });
  addMesh(s, new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2]), new Uint8Array([255, 0, 0, 255, 0, 0, 255, 0, 0]), 500);
  addLines(s, [{ V: [0, 0, 5, 10, 0, 5], closed: false }], 600);
  const r = s.finish(); const cols = new Set();
  for (let i = 0; i < r.n; i++) if (r.positions[3 * i + 2] === 5) cols.add(`${r.rgb[3 * i]},${r.rgb[3 * i + 1]},${r.rgb[3 * i + 2]}`);
  eq([...cols], ['200,200,200'], '線の点の色');
});
test('OK-S15', '確保できないとき（cap = hint = 100 億点）は日本語の「メモリが足りません」', () => {
  const s = new Sink({ cap: 1e10 }); s.hint(1e10);
  let err = null; try { s.slot(1, 2, 3); } catch (e) { err = e; }
  ok(err && /メモリが足りません/.test(err.message), err ? err.message : '例外が起きない');
});
