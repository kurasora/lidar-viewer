import { readFileSync } from 'node:fs';
import { read, tryRead, show } from './lib.mjs';
const D = process.argv[2];
const E = JSON.parse(readFileSync(D + '/expect.json', 'utf8'));
for (let pf = 0; pf <= 10; pf++) {
  const e = E['pf' + pf];
  const r = await read(`pf${pf}.las`, readFileSync(`${D}/pf${pf}.las`));
  const bad = {};
  const inc = k => { bad[k] = (bad[k] || 0) + 1; };
  for (let i = 0; i < r.n; i++) {
    const p = r.pt(i);
    if (Math.abs(p[0] - i * 0.01) > 1e-4 || Math.abs(p[1] + i * 0.02) > 1e-4 || Math.abs(p[2] - (5 + i * 0.001)) > 1e-4) inc('xyz');
    if (r.fields.intensity[i] !== e.intensity[i]) inc('intensity');
    if (r.fields.return_number[i] !== e.return_number[i]) inc('return_number');
    if (r.fields.classification[i] !== e.classification[i]) inc('classification');
    if (r.fields.point_source_id[i] !== e.point_source_id[i]) inc('point_source_id');
    if (e.gps_time) { if (!r.fields.gps_time || Math.abs(r.fields.gps_time[i] - e.gps_time[i]) > 1e-3) inc('gps_time'); }
    else if (r.fields.gps_time) inc('gps_time（ないはず）');
    if (e.rgb16) { const c = r.col(i); for (let k = 0; k < 3; k++) if (c[k] !== (e.rgb16[k][i] >> 8)) { inc('rgb'); break; } }
    else if (r.rgb) inc('rgb（ないはず）');
  }
  show(`LAS 点の形式 ${pf}（${r.info.format}）`, `n=${r.n} 欄 ${Object.keys(r.fields).join(',')} 不一致 ${JSON.stringify(bad)}`);
}
for (const nm of ['dark256', 'dark257']) {
  const r = await read(nm + '.las', readFileSync(`${D}/${nm}.las`));
  let bad = 0, firstBad = null;
  for (let i = E.dark.first_colored; i < r.n; i++) { const c = r.col(i); if (c[0] !== E.dark.v[i]) { bad++; if (!firstBad) firstBad = [i, c, E.dark.v[i]]; } }
  show(`最初の 25000 点が黒・残りが 16 bit 色（${nm}）`, `色の誤り ${bad} / ${r.n - E.dark.first_colored} 例 ${JSON.stringify(firstBad)}`);
}
{
  const t = await tryRead('truncated.las', readFileSync(`${D}/truncated.las`));
  show('点数 1,000,000 と書かれた 1000 点のファイル', t.ok ? `n=${t.r.n}（エラーなし）、確保した点の数 ${t.r.positions.buffer.byteLength / 12}` : t.error);
}
{
  const t = await tryRead('short.las', readFileSync(`${D}/pf0.las`).subarray(0, 100));
  show('100 バイトで切れた LAS', t.ok ? 'エラーなし' : `${t.name}: ${t.error}`);
}
