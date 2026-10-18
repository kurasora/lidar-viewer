// worker.js の load → analyze を Node で動かし、結果を 1 行 1 JSON で出す: node t_level.mjs a.pcd b.pcd ...
import { loadWorker } from '../../lib/wk.mjs';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const wk = await loadWorker();
let id = 0;
for (const f of process.argv.slice(2)) {
  id++;
  const t0 = Date.now();
  const m = await wk.send({ type: 'load', id, name: basename(f), cap: 3e7, offset: null, companions: {}, file: new Blob([readFileSync(f)]), base: 'file:///x/' });
  const loaded = m.find(x => x.type === 'loaded'), err = m.find(x => x.type === 'error');
  if (!loaded) { console.log(JSON.stringify({ file: basename(f), loadError: err && err.message })); continue; }
  const a = (await wk.send({ type: 'analyze', id, req: id }))[0];
  console.log(JSON.stringify({ file: basename(f), n: loaded.n, offset: loaded.offset, ms: Date.now() - t0, ...(a.type === 'error' ? { error: a.message } : { R: a.R, R1: a.R1, tilt: a.tiltDeg, yaw: a.yawDeg, floorZ: a.floorZ }) }));
  await wk.send({ type: 'remove', id });
}
