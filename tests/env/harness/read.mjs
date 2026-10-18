// Node で読み込み部品（src/io）を直接動かす: node read.mjs <ファイル> [付属ファイル...] [--cap=N]
// 出力: JSON（点数・総数・欄・シフト・平均/最小/最大・色の有無・形式・注記・所要時間）
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const P = '/home/claude/pcd-viewer';
const { loadFile } = await import(P + '/src/io/index.js');
const ASSETS = {
  'laz-perf.wasm': P + '/node_modules/laz-perf/lib/web/laz-perf.wasm',
  'draco_decoder.wasm': P + '/node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm',
  'web-ifc.wasm': P + '/node_modules/web-ifc/web-ifc.wasm',
  'occt-import-js.wasm': P + '/node_modules/occt-import-js/dist/occt-import-js.wasm',
};
const args = process.argv.slice(2);
const cap = Number((args.find(a => a.startsWith('--cap=')) || '--cap=30000000').slice(6));
const files = args.filter(a => !a.startsWith('--'));
const main = files[0];
const companions = {};
for (const f of files.slice(1)) companions[basename(f)] = new Blob([readFileSync(f)]);
const t0 = Date.now();
try {
  const { sink, info } = await loadFile(new Blob([readFileSync(main)]), basename(main), {
    cap, offset: null, companions,
    asset: async n => new Uint8Array(readFileSync(ASSETS[n])),
    assetURL: async n => 'file://' + ASSETS[n],
  }, () => {});
  const r = sink.finish();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], m = [0, 0, 0];
  for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) { const v = r.positions[3 * i + k] + r.offset[k]; m[k] += v; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  console.log(JSON.stringify({ ok: true, file: basename(main), n: r.n, total: r.total, skipped: r.skipped, sampled: r.sampled, offset: r.offset, fields: Object.keys(r.fields), rgb: !!r.rgb,
    mean: m.map(v => +(v / Math.max(1, r.n)).toFixed(4)), min: lo.map(v => +v.toFixed(4)), max: hi.map(v => +v.toFixed(4)), format: info.format, note: info.note || '', ms: Date.now() - t0 }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, file: basename(main), error: e && e.message, name: e && e.name, stack: (e && e.stack || '').split('\n').slice(0, 4).join(' | '), ms: Date.now() - t0 }));
  process.exitCode = 2;
}
