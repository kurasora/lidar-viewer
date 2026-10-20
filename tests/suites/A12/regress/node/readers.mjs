// A12: 読み込み部品（src/io）の不具合を Node で直接確かめる
//   node readers.mjs <data フォルダ>
//   1 件ごとに「[再現] / [再現せず] ID 内容: 値」を出す（再試験のときに [再現せず] になれば直っている）
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const P = '/home/claude/pcd-viewer';
const { loadFile } = await import(P + '/src/io/index.js');
const { parseTrajectory } = await import(P + '/src/trajectory.js');
const D = process.argv[2];
const ASSETS = { 'laz-perf.wasm': P + '/node_modules/laz-perf/lib/web/laz-perf.wasm' };

async function load(name, { cap = 3e7, companions = [] } = {}) {
  const comps = {};
  for (const c of companions) comps[basename(c)] = new Blob([readFileSync(join(D, c))]);
  const { sink, info } = await loadFile(new Blob([readFileSync(join(D, name))]), name, {
    cap, offset: null, companions: comps, asset: async n => new Uint8Array(readFileSync(ASSETS[n])), assetURL: async n => 'file://' + ASSETS[n],
  }, () => {});
  return { r: sink.finish(), info, sink };
}
let bad = 0;
const say = (ok, id, text, val) => { if (ok) bad++; console.log(`${ok ? '[再現]' : '[再現せず]'} ${id} ${text}: ${typeof val === 'string' ? val : JSON.stringify(val)}`); };
const tryCase = async (id, fn) => { try { await fn(); } catch (e) { console.log(`[失敗] ${id} 例外: ${e && e.message}`); } };

// CSV が「高さの表」と取り違えられる
await tryCase('A12-csv-dem', async () => {
  const { r, info } = await load('demo.csv');
  say(r.n !== 5000, 'A12-csv-dem', '名前に dem を含む CSV 点群（中身は cc_cloud.csv と同じ 5,000 点）', `${r.n} 点、形式「${info.format}」`);
});
await tryCase('A12-csv-9col', async () => {
  const { r, info } = await load('cloud_9cols.csv');
  say(r.n !== 5000, 'A12-csv-9col', '9 列（x y z r g b nx ny nz）の CSV 点群', `${r.n} 点、形式「${info.format}」`);
});
// PLY の float の色が 0 か 1 になる
await tryCase('A12-ply-floatrgb', async () => {
  const { r } = await load('ply_float_rgb.ply');
  let mx = 0; for (let i = 0; i < r.rgb.length; i++) mx = Math.max(mx, r.rgb[i]);
  say(mx <= 1, 'A12-ply-floatrgb', 'PLY（色が float 0〜1）の色の最大値（期待 255 付近）', mx);
});
// LAS の 16 bit の色: 先頭 2 万点が暗いと 8 bit と判断される
await tryCase('A12-las-rgb16', async () => {
  const { r } = await load('las16_dark_first.las');
  const k = r.rgb.length - 3; // 最後の点（16 bit で 32768,16384,65535 = 8 bit で 128,64,255）
  const c = [r.rgb[k], r.rgb[k + 1], r.rgb[k + 2]];
  say(c[0] !== 128, 'A12-las-rgb16', 'LAS（16 bit の色、先頭 2 万点が色 0）の最後の点の色（期待 [128,64,255]）', c);
});
// 途中で切れた LAS を黙って読む
await tryCase('A12-las-trunc', async () => {
  const { r, info } = await load('las_truncated.las');
  say(r.n < 5000 && !info.note, 'A12-las-trunc', '後ろ 30% が欠けた LAS（ヘッダーは 5,000 点）', `${r.n} 点、注記「${info.note || ''}」（誤りにも注記にもならない）`);
});
// 色付き STL の赤と青が入れ替わる（VisCAM/SolidView の決まり）
await tryCase('A12-stl-color', async () => {
  const { r } = await load('stl_viscam_red.stl');
  const c = [r.rgb[0], r.rgb[1], r.rgb[2]];
  say(c[2] > c[0], 'A12-stl-color', '赤（bit10〜14）の三角形の点の色（期待 赤）', c);
});
// GeoTIFF の値なし（float32）が除かれない
await tryCase('A12-tif-nodata', async () => {
  const { r, info } = await load('dem_nodata.tif');
  let zmin = Infinity; for (let i = 2; i < r.positions.length; i += 3) zmin = Math.min(zmin, r.positions[i] + r.offset[2]);
  say(zmin < -1e30, 'A12-tif-nodata', 'GDAL_NODATA=-3.40282e+38 の DEM の最小の高さ（期待 10）', `${zmin}（除外 ${r.skipped}、注記「${info.note}」）`);
});
// 先頭の 1 点が原点だと、シフトが決まらず float の精度が落ちる
await tryCase('A12-shift-first', async () => {
  const a = await load('first_origin.xyz'), b = await load('utm_only.xyz');
  const src = readFileSync(join(D, 'utm_only.xyz'), 'utf8').trim().split('\n').map(l => l.split(' ').map(Number));
  const err = (x) => { let m = 0; const R = x.r; const skip = x === a ? 1 : 0; for (let i = 0; i < src.length; i++) for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(R.positions[3 * (i + skip) + k] + R.offset[k] - src[i][k])); return m; };
  say(err(a) > 0.01, 'A12-shift-first', '先頭が 0 0 0 の UTM 点群の座標の最大誤差（m）と、先頭がふつうの場合', { 先頭が原点: { offset: a.r.offset, 最大誤差: +err(a).toFixed(4) }, ふつう: { offset: b.r.offset, 最大誤差: +err(b).toFixed(4) } });
});
// CSV の見出しの引用符が項目名に残る
await tryCase('A12-csv-quote', async () => {
  const { r } = await load('quoted_header.csv');
  say(Object.keys(r.fields).some(k => k.includes('"')), 'A12-csv-quote', '見出しが "X","Y",… の CSV の項目名', Object.keys(r.fields));
});
// 空の欄で列がずれる
await tryCase('A12-csv-empty', async () => {
  const { r } = await load('empty_fields.csv');
  // 奇数行は intensity が空、label は 7。ずれると intensity に 7 が入り label が NaN になる
  const I = r.fields.intensity, L = r.fields.label;
  let shifted = 0; for (let i = 0; i < r.n; i++) if (I[i] === 7 && Number.isNaN(L[i])) shifted++;
  say(shifted > 0, 'A12-csv-empty', '強度の欄が空の行で、label の値が intensity に入った点の数', `${shifted} / ${r.n}`);
});
// CSV の色が 0〜1 だと黒になる
await tryCase('A12-csv-floatrgb', async () => {
  const { r } = await load('float_rgb.csv');
  let mx = 0; for (let i = 0; i < r.rgb.length; i++) mx = Math.max(mx, r.rgb[i]);
  say(mx <= 1, 'A12-csv-floatrgb', '見出し r g b・値 0〜1 の CSV の色の最大値（期待 255 付近）', mx);
});
// 途中で切れたバイナリ PLY の誤りの文言
await tryCase('A12-ply-trunc', async () => {
  try { const { r } = await load('ply_trunc_binary.ply'); say(false, 'A12-ply-trunc', '切れたバイナリ PLY', `${r.n} 点（誤りにならない）`); }
  catch (e) { say(!/[ぁ-んァ-ン一-龥]/.test(e.message), 'A12-ply-trunc', '切れたバイナリ PLY の誤りの文言（日本語でない）', e.message); }
});
// VTK 5.1 の面が読めず、頂点だけになる
await tryCase('A12-vtk51', async () => {
  const { r, info } = await load('vtk51_quad.vtk');
  say(r.n <= 4, 'A12-vtk51', 'VTK 5.1（OFFSETS/CONNECTIVITY）の四角形 1 枚（期待 面の上に約 100 万点）', `${r.n} 点、形式「${info.format}」`);
});
// 項目名に HTML（読み込み部品はそのまま通す。画面で innerHTML に入る）
await tryCase('A12-html-field', async () => {
  const { r } = await load('html_field.pcd');
  // 項目名に < が入るのは読み込み部品の仕様どおり。画面で文字として出す（エスケープ）かは browser/render_checks.js で確かめる
  console.log(`[情報] A12-html-field PCD の項目名をそのまま読む（画面での扱いは render_checks で確認）: ${JSON.stringify(Object.keys(r.fields))}`);
});
// 軌跡: KITTI 形式（12 列）・時刻のない 7 列を黙って取り違える
await tryCase('A12-traj-kitti', async () => {
  // 0.4.1 から: 取り違えずに、理由を言って断る（例外の文が出れば直っている）
  let t;
  try { t = parseTrajectory(readFileSync(join(D, 'traj_kitti.txt')).buffer.slice(0)); } catch (e) { say(false, 'A12-traj-kitti', '理由を言って断る', e.message); return; }
  const first = Array.from(t.poses.slice(0, 8)).map(v => +v.toFixed(3));
  say(t.count > 0, 'A12-traj-kitti', 'KITTI 形式（3×4 行列 12 列）が誤りにならず [t x y z qx qy qz qw] として読まれる（1 行目）', first);
});
await tryCase('A12-traj-7col', async () => {
  // 0.4.1 から: 取り違えずに、理由を言って断る（例外の文が出れば直っている）
  let t;
  try { t = parseTrajectory(readFileSync(join(D, 'traj_xyzq.txt')).buffer.slice(0)); } catch (e) { say(false, 'A12-traj-7col', '理由を言って断る', e.message); return; }
  const first = Array.from(t.poses.slice(0, 8)).map(v => +v.toFixed(3));
  say(t.count > 0, 'A12-traj-7col', '時刻のない x y z qx qy qz qw（7 列）が t x y z として読まれる（1 行目）', first);
});
// Sink の確保しすぎ（finish が subarray を返すので、余分の確保が残る）
await tryCase('A12-sink-over', async () => {
  const { r } = await load('utm_only.xyz');
  const alloc = r.positions.buffer.byteLength / 12;
  say(alloc > r.n * 1.5, 'A12-sink-over', '5,000 点の文字の点群で確保されたまま残る点数（positions の元の ArrayBuffer）', `${alloc} 点ぶん（使うのは ${r.n} 点）`);
});
console.log(`まとめ: 再現 ${bad} 件`);
