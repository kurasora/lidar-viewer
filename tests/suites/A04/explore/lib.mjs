// 探索用の共通部品: 読み込み部品をバイト列や文字列から直接動かす
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
export const ROOT = process.env.PCDV_ROOT || '/home/claude/pcd-viewer';
const IO = await import(join(ROOT, 'src/io/index.js'));
export const { loadFile } = IO;
export const enc = new TextEncoder();
const ASSETS = {
  'laz-perf.wasm': join(ROOT, 'node_modules/laz-perf/lib/web/laz-perf.wasm'),
  'draco_decoder.wasm': join(ROOT, 'node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm'),
};
// data: 文字列 / Uint8Array / ArrayBuffer、companions: {名前: 文字列|バイト列}
export async function read(name, data, { cap = 3e7, offset = null, companions = {} } = {}) {
  const toBlob = d => new Blob([typeof d === 'string' ? enc.encode(d) : d]);
  const comp = {};
  for (const [k, v] of Object.entries(companions)) comp[k] = toBlob(v);
  const { sink, info } = await loadFile(toBlob(data), name, {
    cap, offset, companions: comp,
    asset: async n => new Uint8Array(readFileSync(ASSETS[n])), assetURL: async n => 'file://' + ASSETS[n],
  }, () => {});
  const r = sink.finish();
  r.info = info;
  r.pt = i => [0, 1, 2].map(k => r.positions[3 * i + k] + r.offset[k]);
  r.col = i => r.rgb ? [r.rgb[3 * i], r.rgb[3 * i + 1], r.rgb[3 * i + 2]] : null;
  return r;
}
export async function tryRead(name, data, opts) {
  try { return { ok: true, r: await read(name, data, opts) }; } catch (e) { return { ok: false, error: e.message, name: e.name, stack: String(e.stack).split('\n').slice(0, 3).join(' | ') }; }
}
export function show(label, x) { console.log(label.padEnd(40), typeof x === 'string' ? x : JSON.stringify(x)); }
