// Node で読み込み部品（src/io）を直接動かして、cases.json の期待値と比べる
//   使い方: node --no-warnings node_probe.mjs [絞り込みの正規表現] [--app=/home/claude/pcd-viewer]
//   出力: 1 件 1 行の JSON（id, ok, bad[], result）。最後に集計
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const HERE = dirname(new URL(import.meta.url).pathname);
const probe = require(join(HERE, 'probe.js'));
const args = process.argv.slice(2);
const P = (args.find(a => a.startsWith('--app=')) || '--app=/home/claude/pcd-viewer').slice(6);
const filt = new RegExp(args.find(a => !a.startsWith('--')) || '.');
const { loadFile } = await import(P + '/src/io/index.js');
const ASSETS = {
  'laz-perf.wasm': P + '/node_modules/laz-perf/lib/web/laz-perf.wasm',
  'draco_decoder.wasm': P + '/node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm',
  'web-ifc.wasm': P + '/node_modules/web-ifc/web-ifc.wasm',
  'occt-import-js.wasm': P + '/node_modules/occt-import-js/dist/occt-import-js.wasm',
};
const DATA = join(HERE, 'data');
const cases = JSON.parse(readFileSync(join(DATA, 'cases.json'), 'utf8')).filter(c => c.where.includes('node') && filt.test(c.id));

// app.js の companionsOf と同じ判定（付属ファイルは単独では開かない）
const extOf = n => { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i + 1).toLowerCase(); };
const IMAGE_EXT = /^(bmp|cur|gif|icns|ico|jpe?g|pbm|pgm|png|ppm|svgz?|tga|wbmp|webp|xbm|xpm|tiff?)$/;
function companionsOf(names) {
  const set = new Set(names.map(n => n.toLowerCase()));
  const base = n => n.toLowerCase().replace(/\.[^.]+$/, '');
  const hasMeshWithParts = names.some(n => /^(gltf|obj|dae|fbx|psz|pov|icm)$/.test(extOf(n)));
  return name => {
    const n = name.toLowerCase(), e = extOf(n);
    if (n.endsWith('.sbf.data') && set.has(n.slice(0, -5))) return true;
    if (/^(shx|dbf|prj|cpg|sbn|sbx|qix)$/.test(e) && set.has(base(n) + '.shp')) return true;
    if (e === 'mtl') return true;
    if (hasMeshWithParts && (e === 'bin' || IMAGE_EXT.test(e)) && !set.has(base(n) + '.pov')) return true;
    return false;
  };
}

let pass = 0, fail = 0;
for (const c of cases) {
  const paths = c.files.map(f => join(DATA, f));
  const names = paths.map(p => basename(p));
  const isPart = companionsOf(names);
  const blobs = {}; paths.forEach((p, i) => { blobs[names[i]] = new Blob([readFileSync(p)]); });
  const files = [];
  let msg = '', offset = null;
  const t0 = Date.now();
  for (let i = 0; i < paths.length; i++) {
    if (isPart(names[i])) continue;
    const companions = {}; for (const n of names) if (n !== names[i]) companions[n] = blobs[n];
    try {
      const { sink, info } = await loadFile(blobs[names[i]], names[i], {
        cap: c.cap || 30000000, offset, companions,
        asset: async n => new Uint8Array(readFileSync(ASSETS[n])), assetURL: async n => 'file://' + ASSETS[n],
      }, () => {});
      const r = sink.finish();
      if (!r.n) throw new Error(r.skipped ? `座標の正しい点がありません（${r.skipped.toLocaleString()} 点を除外）` : '点がありません');
      if (!offset) offset = r.offset;
      const fieldStats = {};
      for (const [k, a] of Object.entries(r.fields)) { let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; } fieldStats[k] = { min: lo, max: hi }; }
      files.push({ name: names[i], n: r.n, total: r.total, positions: r.positions, rgb: r.rgb, fmt: info.format || '', note: info.note || '', fields: Object.keys(r.fields), fieldStats, offsetUsed: r.offset });
      msg = `${names[i]} を開きました（${r.n.toLocaleString()} 点）`;
    } catch (e) {
      msg = 'エラー: ' + (e && e.message || String(e));
    }
  }
  const spec = { parts: (c.expect.parts || []).map(p => ({ name: p.name, box: p.box })) };
  // ファイルごとの期待値があるときは、そのファイルの部品の箱を使う
  let summary;
  if (c.expect.perFile) summary = files.map(f => { const pe = c.expect.perFile.find(x => x.name === f.name); const sp = { parts: ((pe && pe.expect.parts) || []).map(p => ({ name: p.name, box: p.box })) }; return probe.summarize([f], f.offsetUsed, sp)[0]; });
  else summary = files.map(f => probe.summarize([f], f.offsetUsed, spec)[0]);
  const result = { msg, files: summary, offset };
  const bad = probe.check(result, c.expect);
  const ok = bad.length === 0;
  ok ? pass++ : fail++;
  console.log(JSON.stringify({ id: c.id, ok, bad, ms: Date.now() - t0, msg, files: summary.map(f => ({ name: f.name, n: f.n, min: f.min, max: f.max, mean: f.mean, rgb: f.rgb, color: f.color, fmt: f.fmt, note: f.note, fields: f.fields, parts: f.parts, stray: f.stray, strayEx: f.strayEx, fieldStats: f.fieldStats })) }));
}
console.log(JSON.stringify({ summary: true, runner: 'node', pass, fail }));
