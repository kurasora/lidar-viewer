// Node で読み込み部品（src/io）を直接動かし、結果（座標・色・欄）を書き出す
//   使い方: node --no-warnings node_check.mjs <manifest.json> <出力フォルダ> [id の正規表現]
//   環境変数 APPDIR（既定 /home/claude/pcd-viewer）
//   出力: <出力フォルダ>/<id>.json（{ok, n, total, skipped, sampled, offset, fields, rgb, format, note, error, P(base64 float64), C(base64 u8), F:{名前: base64 float32}}）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
const APP = process.env.APPDIR || '/home/claude/pcd-viewer';
const { loadFile } = await import(APP + '/src/io/index.js');
const { parseTrajectory } = await import(APP + '/src/trajectory.js');
const ASSETS = {
  'laz-perf.wasm': APP + '/node_modules/laz-perf/lib/web/laz-perf.wasm',
  'draco_decoder.wasm': APP + '/node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm',
  'web-ifc.wasm': APP + '/node_modules/web-ifc/web-ifc.wasm',
  'occt-import-js.wasm': APP + '/node_modules/occt-import-js/dist/occt-import-js.wasm',
};
const [manifestPath, outDir, filt] = process.argv.slice(2);
const DATA = dirname(manifestPath);
const cases = JSON.parse(readFileSync(manifestPath, 'utf8'));
const re = filt ? new RegExp(filt) : null;
const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
let done = 0;
for (const c of cases) {
  if (c.node === false) continue;
  if (re && !re.test(c.id)) continue;
  const out = join(outDir, c.id + '.json');
  mkdirSync(dirname(out), { recursive: true });
  const main = join(DATA, c.files[0]);
  const companions = {};
  for (const f of c.files.slice(1)) companions[basename(f)] = new Blob([readFileSync(join(DATA, f))]);
  const t0 = Date.now();
  let res;
  if (c.kind === 'traj') {
    try {
      const buf = readFileSync(main);
      const r = parseTrajectory(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      res = { id: c.id, ok: true, n: r.count, topic: r.topic, poses: b64(r.poses), ms: Date.now() - t0 };
    } catch (e) { res = { id: c.id, ok: false, error: e && e.message, ms: Date.now() - t0 }; }
    writeFileSync(out, JSON.stringify(res)); done++;
    continue;
  }
  try {
    const { sink, info } = await loadFile(new Blob([readFileSync(main)]), basename(main), {
      cap: c.cap || 3e7, offset: c.extra && c.extra.offset ? c.extra.offset : null, companions,
      asset: async n => new Uint8Array(readFileSync(ASSETS[n])),
      assetURL: async n => 'file://' + ASSETS[n],
    }, () => {});
    const r = sink.finish();
    const P = new Float64Array(3 * r.n);
    for (let i = 0; i < 3 * r.n; i++) P[i] = r.positions[i] + r.offset[i % 3];
    const F = {};
    for (const [k, v] of Object.entries(r.fields)) F[k] = b64(new Float32Array(v));
    res = { id: c.id, ok: true, n: r.n, total: r.total, skipped: r.skipped, sampled: r.sampled, offset: r.offset, fields: Object.keys(r.fields), FB: r.fieldBase || {}, rgb: !!r.rgb,
      format: info.format || '', note: info.note || '', ms: Date.now() - t0, P: b64(P), C: r.rgb ? b64(new Uint8Array(r.rgb)) : null, F,
      P32: b64(new Float32Array(r.positions)) };
  } catch (e) {
    res = { id: c.id, ok: false, error: e && e.message, stack: (e && e.stack || '').split('\n').slice(0, 4).join(' | '), ms: Date.now() - t0 };
  }
  writeFileSync(out, JSON.stringify(res));
  done++;
}
console.log(`node_check: ${done} 件`);
