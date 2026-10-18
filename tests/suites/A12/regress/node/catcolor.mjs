// A12-cat-color: 分類（categorical）の色の割り当てが、点（シェーダー）と凡例（drawLegend）で食い違うかを確かめる
//   シェーダー: idx = clamp(round(v - catMin), 0, 63); 色 = CAT[idx % 12]
//   凡例:       色 = CAT[(v - values[0]) % 12]
//   値の広がり（max-min）が 63 を超えると、点では複数の値が idx 63 に潰れ、凡例の色と合わない
import { readFileSync } from 'node:fs';
const P = '/home/claude/pcd-viewer';
const { loadFile } = await import(P + '/src/io/index.js');
const { sink } = await loadFile(new Blob([readFileSync(process.argv[2])]), 'labels_far.pcd', { cap: 3e7, offset: null, companions: {}, asset: async () => {}, assetURL: async () => {} }, () => {});
const r = sink.finish();
const lab = r.fields.label;
// worker.fieldStats と同じ判定
const m = Math.min(lab.length, 200000); let min = Infinity, max = -Infinity; const uniq = new Set(); let integer = true;
for (let i = 0; i < lab.length; i++) { const v = lab[i]; if (v < min) min = v; if (v > max) max = v; }
for (let i = 0; i < m && integer; i++) { const v = lab[i]; if (v !== Math.round(v)) integer = false; else if (uniq.size <= 64) uniq.add(v); }
const categorical = integer && uniq.size <= 32 && max - min < 1000;
const values = [...uniq].sort((a, b) => a - b);
const catMin = values[0];
const CATLEN = 12;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rows = values.map(v => {
  const shaderIdx = clamp(Math.round(v - catMin + 0.0), 0, 63) % CATLEN; // round(scalar-catMin+0.5) の +0.5 は floor 用。整数なら round と同じ
  const legendIdx = ((v - catMin) % CATLEN + CATLEN) % CATLEN;
  return { 値: v, 点の色番号: shaderIdx, 凡例の色番号: legendIdx, 一致: shaderIdx === legendIdx };
});
console.log('categorical:', categorical, 'values:', values, 'max-min:', max - min);
console.table(rows);
const mismatch = rows.filter(r => !r.一致).length;
const collide = new Set(values.filter(v => clamp(v - catMin, 0, 63) === 63)).size;
console.log(mismatch > 0 ? `[再現] 点と凡例で色がずれる値: ${mismatch} 個、点側で idx 63 に潰れる値: ${collide} 個` : '[再現せず] すべて一致');
