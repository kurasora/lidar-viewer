// 大きな画像（1 画素 = 1 点）を worker で読み、点の間隔（索引）と選択が動くか
import { loadWorker } from '../../lib/wk.mjs';
import { readFileSync } from 'node:fs';
const wk = await loadWorker();
const f = process.argv[2];
const t0 = Date.now();
const m = await wk.send({ type: 'load', id: 1, name: f, cap: 3e7, offset: null, companions: {}, file: new Blob([readFileSync(f)]), base: 'file:///x/' });
for (const x of m) if (x.type !== 'progress') console.log(x.type, x.type === 'loaded' ? `n=${x.n}` : JSON.stringify(x).slice(0, 200));
console.log('load+spacing', Date.now() - t0, 'ms');
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const r = await wk.send({ type: 'pick', req: 3, queries: [{ id: 1, name: 'x', o: [100, -100, 50], d: [0, 0, -1], tolA: 0.003, tolB: 0, M: I, scale: 1 }], clipMin: [-1e9, -1e9, -1e9], clipMax: [1e9, 1e9, 1e9] });
console.log('pick', JSON.stringify(r).slice(0, 200));
console.log('rss MB', (process.memoryUsage().rss / 1048576).toFixed(0));
