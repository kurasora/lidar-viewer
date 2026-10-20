// サンプル（sample/formats の全ファイル）を Node の読み込み部品で読み、期待値と比べる
//   使い方: node --no-warnings samples_run.mjs [--json]
//   環境変数: PCDV_ROOT（対象のプロジェクト。既定 /home/claude/pcd-viewer）
//             SAMPLES（サンプルのフォルダ。既定 $PCDV_ROOT/sample/formats）
//             EXPECTED（期待値 JSON。既定 tests/sample-generators/samples/out_expected.json（作り物の廊下））
// 出力: 1 ファイル 1 行の結果と、最後に OK/NG/SKIP/ERR の数。終了コード: NG があれば 1
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = process.env.PCDV_ROOT || '/home/claude/pcd-viewer';
const DIR = process.env.SAMPLES || join(ROOT, 'sample/formats');
const EXP_PATH = process.env.EXPECTED || (process.env.PCDV_ROOT || '/home/claude/pcd-viewer') + '/tests/sample-generators/samples/out_expected.json';
const EXP = existsSync(EXP_PATH) ? JSON.parse(readFileSync(EXP_PATH, 'utf8')) : null;
const { loadFile } = await import(join(ROOT, 'src/io/index.js'));
const ASSETS = {
  'laz-perf.wasm': join(ROOT, 'node_modules/laz-perf/lib/web/laz-perf.wasm'),
  'draco_decoder.wasm': join(ROOT, 'node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm'),
  'web-ifc.wasm': join(ROOT, 'node_modules/web-ifc/web-ifc.wasm'),
  'occt-import-js.wasm': join(ROOT, 'node_modules/occt-import-js/dist/occt-import-js.wasm'),
};
const json = process.argv.includes('--json');
// 画面側（app.js）で扱うもの・Node では動かないもの（README の注意: wasm の作り・createImageBitmap）
const APP_ONLY = /\.(pov|icm|wrl|fbx|dae|svg|svgz)$/i;
const NODE_NG = /\.(laz|drc|ifc|stp|step|png|jpe?g|gif|bmp|webp|ico|cur|icns)$/i;
// 5000 点の廊下（期待値と一致すべき）とみなすファイル
const CORRIDOR = /^(cc_cloud|pcl_|laspy_|pye57_|handmade_cloud|handmade_2scans|handmade_bundler|cc_ptx_scans|cc_cloud_shift|cc_cloud_normals|icm_cloud)/;

const files = readdirSync(DIR).sort();
const names = new Set(files.map(f => f.toLowerCase()));
const isCompanion = f => {
  const l = f.toLowerCase();
  if (l.endsWith('.sbf.data') && names.has(l.slice(0, -5))) return true;
  if (/\.(shx|dbf|prj)$/.test(l) && names.has(l.replace(/\.[^.]+$/, '.shp'))) return true;
  if (/\.mtl$/.test(l)) return true;
  return false;
};
const companionsFor = f => {
  const c = {};
  const base = f.replace(/\.[^.]+$/, '');
  for (const g of files) if (g !== f && (g.startsWith(base + '.') || g === f + '.data')) c[g] = new Blob([readFileSync(join(DIR, g))]);
  return c;
};
let ok = 0, ng = 0, skip = 0, err = 0;
const rows = [];
for (const f of files) {
  if (isCompanion(f)) continue;
  if (APP_ONLY.test(f)) { skip++; rows.push({ file: f, result: 'SKIP', why: '画面側で扱う形式' }); continue; }
  const t0 = Date.now();
  try {
    const { sink, info } = await loadFile(new Blob([readFileSync(join(DIR, f))]), f, {
      cap: 3e7, offset: null, companions: companionsFor(f),
      asset: async n => new Uint8Array(readFileSync(ASSETS[n])), assetURL: async n => 'file://' + ASSETS[n],
    }, () => {});
    const r = sink.finish();
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], m = [0, 0, 0];
    for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) { const v = r.positions[3 * i + k] + r.offset[k]; m[k] += v; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    const mean = m.map(v => v / Math.max(1, r.n));
    let verdict = 'OK', why = '';
    if (EXP && CORRIDOR.test(f)) {
      const utm = r.offset.some(v => v !== 0) || mean[0] > 1e5;
      const add = utm ? EXP.utm : [0, 0, 0];
      const em = EXP.mean.map((v, k) => v + add[k]), emin = EXP.min.map((v, k) => v + add[k]), emax = EXP.max.map((v, k) => v + add[k]);
      const tol = utm ? 0.01 : 2e-3;
      const bad = [];
      if (r.n !== EXP.n) bad.push(`n=${r.n}`);
      for (let k = 0; k < 3; k++) {
        if (Math.abs(mean[k] - em[k]) > tol) bad.push(`mean${'xyz'[k]}=${mean[k].toFixed(4)}（期待 ${em[k].toFixed(4)}）`);
        if (Math.abs(lo[k] - emin[k]) > tol) bad.push(`min${'xyz'[k]}=${lo[k].toFixed(4)}（期待 ${emin[k].toFixed(4)}）`);
        if (Math.abs(hi[k] - emax[k]) > tol) bad.push(`max${'xyz'[k]}=${hi[k].toFixed(4)}（期待 ${emax[k].toFixed(4)}）`);
      }
      if (bad.length) { verdict = 'NG'; why = bad.join(' '); }
    }
    if (f === 'cc_two_clouds.bin' && r.n !== 6000) { verdict = 'NG'; why = `n=${r.n}（期待 6000: 廊下 5000 + 別の点群 1000）`; }
    if (verdict === 'OK') ok++; else ng++;
    rows.push({ file: f, result: verdict, why, n: r.n, total: r.total, skipped: r.skipped, offset: r.offset, fields: Object.keys(r.fields), rgb: !!r.rgb, format: info.format, ms: Date.now() - t0 });
  } catch (e) {
    if (NODE_NG.test(f)) { skip++; rows.push({ file: f, result: 'SKIP', why: 'Node では動かない形式: ' + String(e && e.message).slice(0, 80) }); continue; }
    err++;
    rows.push({ file: f, result: 'ERR', why: String(e && e.message), stack: String(e && e.stack).split('\n').slice(0, 3).join(' | ') });
  }
}
if (json) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) console.log(`${r.result.padEnd(4)} ${r.file.padEnd(32)} ${r.n ?? ''} ${r.format ?? ''} ${r.why ?? ''}`);
console.log(`合計: OK ${ok} / NG ${ng} / ERR ${err} / SKIP ${skip}`);
process.exitCode = ng || err ? 1 : 0;
