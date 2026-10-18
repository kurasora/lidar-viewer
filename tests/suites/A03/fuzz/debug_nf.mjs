// 非有限の座標がどこから来るか調べる: node debug_nf.mjs <seedfile> <mutJSON> [name]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { mutate } from './mutators.mjs';
const P = '/home/claude/pcd-viewer';
const { loadFile } = await import(P + '/src/io/index.js');
const file = process.argv[2], mut = JSON.parse(process.argv[3]), name = process.argv[4] || basename(file);
let bytes = new Uint8Array(readFileSync(file));
if (mut) bytes = mutate(bytes, mut);
const { sink, info } = await loadFile(new Blob([bytes]), name, { cap: 30000000, offset: null,
  asset: async n => new Uint8Array(readFileSync(P + '/node_modules/laz-perf/lib/web/laz-perf.wasm')) }, () => {});
const r = sink.finish();
console.log('format:', info.format, 'n:', r.n, 'total:', r.total, 'skipped:', r.skipped, 'offset:', r.offset);
let nf = 0, firstIdx = [];
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) {
  const v = r.positions[3 * i + k];
  if (!Number.isFinite(v)) { nf++; if (firstIdx.length < 6) firstIdx.push({ i, k, v, trip: [r.positions[3 * i], r.positions[3 * i + 1], r.positions[3 * i + 2]] }); }
  if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v;
}
console.log('nonFinite positions:', nf, '/', r.n * 3);
console.log('raw bbox min:', lo, 'max:', hi, '(NaN here = 画面の枠計算が壊れる)');
console.log('samples:', JSON.stringify(firstIdx));
// offset が非有限か
console.log('offset finite?', r.offset.every(Number.isFinite));
