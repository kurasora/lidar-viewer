// src/ をまとめて dist/ に出力する（別スレッドのコードは文字列として埋め込む）
//   node build.mjs            … アプリ用（dist/）
//   node build.mjs artifact   … 試作ページ用の 1 ファイル（dist-artifact/pcd-viewer.html、サンプルの点群入り）
import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

const artifact = process.argv[2] === 'artifact';
// 読み込みに使う wasm（アプリ version は別スレッドのコードに埋め込み、試作ページ version は wasm/ に置いて必要なときに読む）
const ASSETS = {
  'laz-perf.wasm': 'node_modules/laz-perf/lib/web/laz-perf.wasm',
  'draco_decoder.wasm': 'node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm',
  'web-ifc.wasm': 'node_modules/web-ifc/web-ifc.wasm',
  'occt-import-js.wasm': 'node_modules/occt-import-js/dist/occt-import-js.wasm',
};
// アプリ version はそのまま、試作ページ version は gzip してから埋め込む（1 ファイル 16 MB に収めるため）
const embed = {};
for (const [k, f] of Object.entries(ASSETS)) embed[k] = artifact ? 'gz:' + gzipSync(readFileSync(f), { level: 9 }).toString('base64') : readFileSync(f).toString('base64');
const worker = await esbuild.build({
  entryPoints: ['src/worker.js'], bundle: true, format: 'iife', write: false, minify: true, target: 'chrome120',
  define: { __EMBED_ASSETS__: JSON.stringify(embed) },
  external: ['fs', 'path', 'crypto', 'url', 'module', 'worker_threads', 'child_process', 'node:*'], platform: 'browser',
});
let sample = 'null', sampleFiles = 'null';
// NOSAMPLE=1: サンプルの点群を入れない（ページを小さくする。点群はファイルを選んで開く）
if (artifact && !process.env.NOSAMPLE) {
  // 前回の廊下の地図と軌跡（wasm を使わない PCD で開く。ページの設定で wasm が使えなくても見られるように）
  const d = JSON.parse(readFileSync('sample/map.json', 'utf8'));
  d.traj = readFileSync('sample/trajectory.txt', 'utf8');
  sample = JSON.stringify(d);
  // 形式ごとのサンプル（gzip して埋め込む）
  const m = {};
  for (const f of readdirSync('sample/formats')) m[f] = gzipSync(readFileSync('sample/formats/' + f), { level: 9 }).toString('base64');
  sampleFiles = JSON.stringify(m);
}
const workerText = worker.outputFiles[0].text;
const app = await esbuild.build({
  entryPoints: ['src/app.js'], bundle: true, format: 'iife', write: false, minify: true, target: 'chrome120',
  define: { __WORKER_GZ__: JSON.stringify(artifact ? gzipSync(Buffer.from(workerText), { level: 9 }).toString('base64') : ''), __ARTIFACT__: String(artifact), __SAMPLE__: sample, __SAMPLE_FILES__: sampleFiles },
});
const js = app.outputFiles[0].text;
if (!artifact) {
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/app.js', js);
  // アプリ version の別スレッドは別のファイルにする。画面本体の CSP から 'unsafe-eval'（STEP の部品が使う）を外すため（S3-005・S1-007）
  writeFileSync('dist/worker.js', workerText);
  copyFileSync('src/index.html', 'dist/index.html');
  copyFileSync('src/styles.css', 'dist/styles.css');
  console.log('built dist/');
} else {
  mkdirSync('dist-artifact', { recursive: true });
  const html = readFileSync('src/index.html', 'utf8');
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace('<script src="app.js"></script>', '');
  const css = readFileSync('src/styles.css', 'utf8');
  const out = `<title>LiDAR Viewer 試作</title>\n<style>\n${css}\nhtml, body { height: 100%; } :root { padding: 0 !important; }\n</style>\n${body}\n<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n`;
  writeFileSync('dist-artifact/pcd-viewer.html', out);
  console.log('built dist-artifact/pcd-viewer.html', (out.length / 1e6).toFixed(2), 'MB');
}
