// 点の間隔（隣の点までの距離の中央値）: アプリの値と、同じ標本の点で scipy が計算した値を比べるための材料を出す
import { loadWorker } from '../../lib/wk.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const wk = await loadWorker();
let id = 0;
for (const f of process.argv.slice(2)) {
  id++;
  const m = await wk.send({ type: 'load', id, name: f, cap: 3e7, offset: null, companions: {}, file: new Blob([readFileSync(f)]), base: 'file:///x/' });
  const L = m.find(x => x.type === 'loaded'), S = m.find(x => x.type === 'spacing');
  writeFileSync(f + '.pos.bin', Buffer.from(L.positions.buffer, L.positions.byteOffset, L.positions.byteLength));
  console.log(JSON.stringify({ file: f, n: L.n, spacing: S ? S.spacing : 'none', offset: L.offset }));
  await wk.send({ type: 'remove', id });
}
