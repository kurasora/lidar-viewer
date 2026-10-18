// 読み込んだ色が正しいか（点の順番は読み込み順のまま。cap は十分に大きい）
import { loadFile } from '/home/claude/pcd-viewer/src/io/index.js';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const P = '/home/claude/pcd-viewer';
const ASSETS = { 'laz-perf.wasm': P + '/node_modules/laz-perf/lib/web/laz-perf.wasm' };
const npy = f => { const b = readFileSync(f); const hl = b.readUInt16LE(8); const hdr = b.toString('latin1', 10, 10 + hl); const data = b.subarray(10 + hl); const dt = /'descr': '([^']+)'/.exec(hdr)[1];
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.length);
  return dt === '<u2' ? new Uint16Array(ab) : dt === '<i8' ? Array.from(new BigInt64Array(ab), Number) : dt === '<f8' ? new Float64Array(ab) : null; };
async function load(f) {
  const { sink, info } = await loadFile(new Blob([readFileSync(f)]), basename(f), { cap: 1e7, offset: null, companions: {}, asset: async n => new Uint8Array(readFileSync(ASSETS[n])) }, () => {});
  return { r: sink.finish(), info };
}
function cmp(name, r, expect, map) {
  let bad = 0, ex = null;
  for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) { const e = map(expect[3 * i + k]); if (Math.abs(r.rgb[3 * i + k] - e) > 1) { bad++; if (!ex) ex = { i, k, got: r.rgb[3 * i + k], want: e, raw: expect[3 * i + k] }; } }
  console.log(JSON.stringify({ name, n: r.n, rgb: !!r.rgb, badChannels: bad, badShare: +(bad / (3 * r.n)).toFixed(4), example: ex }));
}
{ const { r } = await load('las16_normal.las'); cmp('LAS 16bit（ふつう）', r, npy('rgb16_normal.npy'), v => v >> 8); }
{ const { r } = await load('las16_dark_first.las'); cmp('LAS 16bit（先頭 20000 点が 0,0,0）', r, npy('rgb16_dark_first.npy'), v => v >> 8); }
{ const { r } = await load('ply_ushort.ply'); cmp('PLY ushort の色', r, npy('rgb16_normal.npy'), v => v >> 8); }
{ const { r } = await load('ply_float255.ply'); cmp('PLY float の色（0〜255）', r, npy('rgb8.npy'), v => v); }
{ const { r, info } = await load('pts_int255.pts'); console.log('PTS 強度 0〜255:', info.format); cmp('PTS 強度 0〜255', r, npy('rgb8.npy'), v => v); }
{ const { r, info } = await load('pts_leica.pts'); console.log('PTS 強度 Leica:', info.format); cmp('PTS 強度 -2048〜2047', r, npy('rgb8.npy'), v => v); }
