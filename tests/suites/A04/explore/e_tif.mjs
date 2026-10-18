import { readFileSync } from 'node:fs';
import { read, show } from './lib.mjs';
const D = process.argv[2];
for (const f of ['nd9.tif', 'nd18.tif', 'nd_m9999.tif']) {
  const r = await read(f, readFileSync(`${D}/${f}`));
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < r.n; i++) { const z = r.pt(i)[2]; lo = Math.min(lo, z); hi = Math.max(hi, z); }
  show(`GeoTIFF ${f}（80×50、左半分が nodata）`, `n=${r.n}（期待 2000）、z の範囲 ${lo} 〜 ${hi}、${r.info.note}`);
}
