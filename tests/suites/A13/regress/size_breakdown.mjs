// 試作ページ（1 ファイル）の大きさの内訳と、16 MB の上限に対する余裕を出す
//   node size_breakdown.mjs [pcd-viewer.html] [プロジェクトのフォルダ]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const file = process.argv[2] || '/home/claude/pcd-viewer/dist-artifact/pcd-viewer.html';
const proj = process.argv[3] || '/home/claude/pcd-viewer';
const buf = readFileSync(file), html = buf.toString('utf8');
const B = s => Buffer.byteLength(s, 'utf8');
const out = { file, bytes: buf.length, chars: html.length, MB_1e6: +(buf.length / 1e6).toFixed(3), MiB: +(buf.length / 1048576).toFixed(3) };
out.headroom_vs_16e6 = 16e6 - buf.length; out.headroom_vs_16MiB = 16 * 1048576 - buf.length;
const head = html.slice(0, 3000);
out.has_doctype = /^<!doctype/i.test(html.trimStart()); out.has_meta_charset = /<meta[^>]+charset/i.test(head);
out.has_meta_viewport = /<meta[^>]+viewport/i.test(head); out.has_lang = /<html[^>]+lang=/i.test(head);
out.has_csp_meta = /http-equiv=["']?Content-Security-Policy/i.test(head);
const iStyle = html.indexOf('<style>'), iStyleEnd = html.indexOf('</style>'), iScript = html.lastIndexOf('<script>'), iScriptEnd = html.lastIndexOf('</script>');
out.css_bytes = B(html.slice(iStyle, iStyleEnd)); out.body_bytes = B(html.slice(iStyleEnd, iScript));
const js = html.slice(iScript + 8, iScriptEnd); out.js_bytes = B(js);
// 長い文字列リテラル（"..." の中が base64 の文字だけで 2 万字以上）を手で数える
const isB = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || c === 61;
const lits = [];
for (let i = 0; i < js.length; i++) {
  if (js.charCodeAt(i) !== 34) continue;
  let j = i + 1; while (j < js.length && isB(js.charCodeAt(j))) j++;
  if (js.charCodeAt(j) === 34 && j - i - 1 >= 20000) {
    // 直前のキー名（"name":"..." の name）
    const k = /"([^"]{1,80})":$/.exec(js.slice(Math.max(0, i - 90), i));
    lits.push({ key: k ? k[1] : js.slice(Math.max(0, i - 30), i), len: j - i - 1 });
    i = j;
  }
}
const sum = a => a.reduce((x, y) => x + y.len, 0);
const sf = lits.filter(x => /\.[a-z0-9]+$/i.test(x.key) && !/wasm$/.test(x.key));
const mapL = lits.filter(x => x.key === 'b64' || x.key === 'b64i');
const other = lits.filter(x => !sf.includes(x) && !mapL.includes(x));
out.sample_files_count_big = sf.length; out.sample_files_b64_big = sum(sf);
out.sample_map_b64 = sum(mapL);
out.other_big_literals = other.map(x => ({ key: x.key.slice(-40), len: x.len }));
// 小さいサンプル（2 万字未満）も含めた __SAMPLE_FILES__ の合計: "名前.拡張子":"base64"
let small = 0, smallN = 0;
for (const m of js.matchAll(/"([\w.-]+\.[a-z0-9]+)":"([A-Za-z0-9+/=]{1,19999})"/gi)) { small += m[2].length; smallN++; }
out.sample_files_small = { count: smallN, b64: small };
const ti = js.indexOf('"traj":"'); if (ti >= 0) { let j = ti + 8; while (j < js.length && !(js[j] === '"' && js[j - 1] !== '\\')) j++; out.sample_traj_chars = j - ti - 8; }
out.app_code_rest = out.js_bytes - sum(lits) - small - (out.sample_traj_chars || 0);
try {
  const fdir = proj + '/sample/formats'; let raw = 0, gz = 0, n = 0;
  for (const f of readdirSync(fdir)) { const d = readFileSync(fdir + '/' + f); raw += d.length; gz += gzipSync(d, { level: 9 }).length; n++; }
  out.formats = { files: n, raw, gz, gz_b64: Math.ceil(gz / 3) * 4 };
  out.map_json = statSync(proj + '/sample/map.json').size; out.trajectory_txt = statSync(proj + '/sample/trajectory.txt').size;
  const wasm = { 'laz-perf.wasm': 'node_modules/laz-perf/lib/web/laz-perf.wasm', 'draco_decoder.wasm': 'node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm', 'web-ifc.wasm': 'node_modules/web-ifc/web-ifc.wasm', 'occt-import-js.wasm': 'node_modules/occt-import-js/dist/occt-import-js.wasm' };
  out.wasm = Object.fromEntries(Object.entries(wasm).map(([k, p]) => { const d = readFileSync(proj + '/' + p); const g = gzipSync(d, { level: 9 }); return [k, { raw: d.length, gz: g.length, gz_b64: Math.ceil(g.length / 3) * 4 }]; }));
  out.wasm_total_gz_b64 = Object.values(out.wasm).reduce((a, w) => a + w.gz_b64, 0);
} catch (e) { out.err = e.message; }
console.log(JSON.stringify(out, null, 1));
