// 読み込み部品（src/io）をバイト列・文字列から直接動かす
import { readFileSync } from 'node:fs';
import { src } from './harness.mjs';
const IO = await import(src('src/io/index.js'));
export const enc = new TextEncoder();
const ASSETS = { 'laz-perf.wasm': src('node_modules/laz-perf/lib/web/laz-perf.wasm'), 'draco_decoder.wasm': src('node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm') };
const toBlob = d => new Blob([typeof d === 'string' ? enc.encode(d) : d]);
export async function read(name, data, { cap = 3e7, offset = null, companions = {} } = {}) {
  const comp = {};
  for (const [k, v] of Object.entries(companions)) comp[k] = toBlob(v);
  const { sink, info } = await IO.loadFile(toBlob(data), name, { cap, offset, companions: comp, asset: async n => new Uint8Array(readFileSync(ASSETS[n])), assetURL: async n => 'file://' + ASSETS[n] }, () => {});
  const r = sink.finish();
  r.info = info;
  r.pt = i => [0, 1, 2].map(k => r.positions[3 * i + k] + r.offset[k]);
  r.col = i => (r.rgb ? [r.rgb[3 * i], r.rgb[3 * i + 1], r.rgb[3 * i + 2]] : null);
  return r;
}
export async function tryRead(name, data, opts) {
  try { return { ok: true, r: await read(name, data, opts) }; } catch (e) { return { ok: false, error: e.message, name: e.name }; }
}
// 日本語の知らせか（英語の内部エラーがそのまま出ていないか）
export const isJapanese = m => /[ぁ-んァ-ヶ一-龠]/.test(m || '');
export const cat = (...a) => { const b = a.map(x => (typeof x === 'string' ? enc.encode(x) : x instanceof ArrayBuffer ? new Uint8Array(x) : ArrayBuffer.isView(x) ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : x)); const n = b.reduce((s, x) => s + x.length, 0); const o = new Uint8Array(n); let p = 0; for (const x of b) { o.set(x, p); p += x.length; } return o; };
