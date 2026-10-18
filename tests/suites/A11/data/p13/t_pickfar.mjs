// 遠くの外れ値が 1 点あるとき、何もない所をクリック（光線が点に当たらない）した場合の時間
import { loadWorker } from '../../lib/wk.mjs';
import { readFileSync } from 'node:fs';
const wk = await loadWorker();
const f = process.argv[2];
const m = await wk.send({ type: 'load', id: 1, name: f, cap: 3e7, offset: null, companions: {}, file: new Blob([readFileSync(f)]), base: 'file:///x/' });
const L = m.find(x => x.type === 'loaded');
console.log('loaded', L.n, 'bbox', JSON.stringify(L.bbox), 'offset', L.offset);
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// 視点: 部屋の上 30 m から、空（上）に向けて → 何にも当たらない光線。tolA は 5 px / 800 px 相当
const tolA = 5 * 2 * Math.tan(25 * Math.PI / 180) / 800;
const off = L.offset;
for (const [label, o, d] of [
  ['床を真上から（当たる）', [10 - off[0], 1.5 - off[1], 30 - off[2]], [0, 0, -1]],
  ['横向き（部屋の外、当たらない）', [10 - off[0], 50 - off[1], 1 - off[2]], [0, 1, 0]],
  ['外れ値の方向へ斜め（当たらない）', [10 - off[0], 1.5 - off[1], 30 - off[2]], [0.57735, 0.57735, 0.57735]],
]) {
  const t0 = Date.now();
  const r = await Promise.race([wk.send({ type: 'pick', req: 9, queries: [{ id: 1, name: 'x', o, d, tolA, tolB: 0, M: I, scale: 1 }], clipMin: [-1e9, -1e9, -1e9], clipMax: [1e9, 1e9, 1e9] }), new Promise(res => setTimeout(() => res('TIMEOUT'), 120000))]);
  console.log(label, Date.now() - t0, 'ms', typeof r === 'string' ? r : JSON.stringify(r.map(x => x.type === 'picked' ? (x.hit ? x.hit.p.map(v => +v.toFixed(3)) : null) : x.message || x.type)));
}
