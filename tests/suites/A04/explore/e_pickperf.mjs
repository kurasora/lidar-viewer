// 遠い外れ値 1 点で索引が縮退したときの、点選び（pickIn）と点の間隔の時間
import { workerFns } from '../regress/lib/workerfns.mjs';
const W = workerFns();
let s = 7; const g = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], LO = [-1e9, -1e9, -1e9], HI = [1e9, 1e9, 1e9];
for (const outlier of [false, true]) {
  const n = 1000000, P = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { const t = g(); const p = t < 0.4 ? [g() * 60, g() * 3, 0] : t < 0.8 ? [g() * 60, g() * 3, 2.6] : [g() * 60, g() < 0.5 ? 0 : 3, g() * 2.6]; P.set(p, 3 * i); }
  if (outlier) P.set([2e5, 3e5, 5e4], 0);
  const ds = { n, positions: P }; ds.bbox = W.bbox(P);
  let t0 = Date.now(); W.buildIndex(ds); const tIdx = Date.now() - t0;
  t0 = Date.now(); const sp = W.pointSpacing(ds); const tSp = Date.now() - t0;
  t0 = Date.now(); let hits = 0;
  for (let q = 0; q < 20; q++) { const j = 1 + q * 4999; const tgt = [P[3 * j], P[3 * j + 1], P[3 * j + 2]]; const o = [tgt[0] - 10, tgt[1] - 10, tgt[2] + 8]; let d = [tgt[0] - o[0], tgt[1] - o[1], tgt[2] - o[2]]; const L = Math.hypot(...d); d = d.map(v => v / L); if (W.pickIn(ds, o, d, 0.004, 0, I, LO, HI)) hits++; }
  const tPick = (Date.now() - t0) / 20;
  console.log(`${outlier ? '外れ値 1 点あり（200 km 先）' : '外れ値なし'}: 格子 ${ds.index.cell.toFixed(3)} m・${ds.index.ids.size} マス、索引 ${tIdx} ms、点の間隔 ${sp && sp.toFixed(4)} m（${tSp} ms）、点選び 1 回 ${tPick.toFixed(0)} ms（当たり ${hits}/20）`);
}
