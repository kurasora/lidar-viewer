// 天井の判定を Node で（worker の水平補正 → app.js の findCeiling を切り出して同じ計算）
import { loadWorker } from '../../lib/wk.mjs';
import { ceilingAfterLevel } from '../../lib/appfns.mjs';
import { readFileSync } from 'node:fs';
const wk = await loadWorker();
let id = 0;
for (const f of process.argv.slice(2)) {
  id++;
  const m = await wk.send({ type: 'load', id, name: f, cap: 3e7, offset: null, companions: {}, file: new Blob([readFileSync(f)]), base: 'file:///x/' });
  const L = m.find(x => x.type === 'loaded');
  const a = (await wk.send({ type: 'analyze', id, req: id }))[0];
  if (a.type === 'error') { console.log(JSON.stringify({ file: f, error: a.message })); continue; }
  const { c } = ceilingAfterLevel(L.positions, L.n, a);
  // 隠れる点の割合と、ファイルの z で見た帯ごとの割合
  const R = a.R, fz = a.floorZ ?? 0;
  let hid = 0; const bands = {};
  for (let i = 0; i < L.n; i++) {
    const p = [L.positions[3 * i], L.positions[3 * i + 1], L.positions[3 * i + 2]];
    const wz = R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2] - fz;
    const b = Math.floor(p[2] + L.offset[2]);
    bands[b] ||= [0, 0]; bands[b][1]++;
    if (c && wz > c.z) { hid++; bands[b][0]++; }
  }
  console.log(JSON.stringify({ file: f, tilt: +a.tiltDeg.toFixed(2), floorZ: a.floorZ == null ? null : +a.floorZ.toFixed(3), ceilZ: c ? +c.z.toFixed(3) : null, share: c ? +c.share.toFixed(3) : null, hidden: +(hid / L.n).toFixed(3), byFileZ: Object.fromEntries(Object.entries(bands).sort((x, y) => x[0] - y[0]).map(([k, v]) => [k, `${(100 * v[0] / v[1]).toFixed(0)}%`])) }));
  await wk.send({ type: 'remove', id });
}
