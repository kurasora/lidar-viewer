// アプリの Sink（src/io/sink.js）そのものに、x = 点の番号の割合（0〜1000）の点を N 個流し込み、残った cap 点の x の分布を見る
//   node sim_reservoir.mjs N cap [乱数=app|math]
//   正しい無作為抽出なら 20 区間がすべて cap/20 ± 数σ。前の方・後ろの方に偏っていれば Algorithm L か乱数に問題がある
import { Sink } from '/home/claude/pcd-viewer/src/io/sink.js';
const N = +(process.argv[2] || 5e7), cap = +(process.argv[3] || 3e7), rngKind = process.argv[4] || 'app';
const s = new Sink({ cap });
if (rngKind === 'math') s.r = Math.random;
const t0 = Date.now();
for (let i = 0; i < N; i++) s.slot(1000 * i / N, 0, 0);
const r = s.finish();
const H = new Array(20).fill(0);
let sum = 0;
for (let i = 0; i < r.n; i++) { const x = r.positions[3 * i]; sum += x; H[Math.min(19, Math.floor(x / 50))]++; }
const exp = r.n / 20;
// 有限母集団の補正つきの標準偏差（1 区間）
const p = 1 / 20, sd = Math.sqrt(r.n * p * (1 - p) * (N - r.n) / (N - 1));
const z = H.map(h => +((h - exp) / sd).toFixed(1));
const meanSd = 1000 / Math.sqrt(12) / Math.sqrt(r.n) * Math.sqrt((N - r.n) / (N - 1));
console.log(JSON.stringify({ N, cap, rng: rngKind, n: r.n, sec: (Date.now() - t0) / 1000, mean: +(sum / r.n).toFixed(4), meanZ: +((sum / r.n - 500) / meanSd).toFixed(1), z, first: H[0], last: H[19], expected: exp }));
