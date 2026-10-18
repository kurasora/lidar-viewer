// double の欄が Float32 に丸められて、値（時刻）がどれだけ潰れるか
import { loadWorker } from '../../lib/wk.mjs';
import { readFileSync } from 'node:fs';
const wk = await loadWorker();
const m = await wk.send({ type: 'load', id: 1, name: 'ts_f8.pcd', cap: 3e7, offset: null, companions: {}, file: new Blob([readFileSync('ts_f8.pcd')]), base: 'file:///x/' });
const L = m.find(x => x.type === 'loaded');
const f = (await wk.send({ type: 'field', id: 1, name: 'timestamp', req: 2 }))[0];
const vals = f.values, uniq = new Set(vals);
console.log(JSON.stringify({ stats: L.stats.timestamp, distinctValues: uniq.size, of: vals.length, sample: Array.from(vals.slice(0, 5)) }));
