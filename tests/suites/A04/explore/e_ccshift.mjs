import { readFileSync } from 'node:fs';
import { read, show } from './lib.mjs';
const D = process.argv[2];
const ref = readFileSync(D + '/utm_ref.txt', 'utf8').trim().split('\n').map(l => l.split(' ').map(Number));
const cmp = (label, r) => {
  // 点の順番はそのまま（cap > 点数）。座標の最大誤差
  let e = 0, ei = 0;
  for (let i = 0; i < Math.min(r.n, ref.length); i++) { const p = r.pt(i); for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(p[k] - ref[i][k])); }
  const sfs = Object.keys(r.fields);
  if (sfs.length) for (let i = 0; i < Math.min(r.n, ref.length); i++) ei = Math.max(ei, Math.abs(r.fields[sfs[0]][i] - ref[i][3]));
  show(label, `n=${r.n} シフト ${JSON.stringify(r.offset)} 座標の最大誤差 ${e.toExponential(2)} m、欄 ${sfs.join(',')} の最大誤差 ${ei.toExponential(2)}、先頭 ${JSON.stringify(r.pt(0))}`);
};
cmp('SBF（.sbf + .sbf.data）', await read('utm.sbf', readFileSync(D + '/utm.sbf'), { companions: { 'utm.sbf.data': readFileSync(D + '/utm.sbf.data') } }));
cmp('SBF（.sbf.data だけ）', await read('utm.sbf.data', readFileSync(D + '/utm.sbf.data'), { companions: { 'utm.sbf': readFileSync(D + '/utm.sbf') } }));
cmp('BIN', await read('utm.bin', readFileSync(D + '/utm.bin')));
cmp('PLY（CloudCompare の書き出し）', await read('utm.ply', readFileSync(D + '/utm.ply')));
