// A03 ファジングの子プロセス: 親から受け取った入力（種ファイル + 変異）を読み込み部品で読み、結果を返す
//   親（runner.mjs）とは IPC。1 件ごとに { id, ok, n, ... , ms } を返す
//   本番の別スレッド（src/worker.js）と同じく、点数 0 は「点がありません」の誤りとして扱う
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { mutate } from './mutators.mjs';

const P = process.env.APPDIR || '/home/claude/pcd-viewer';
const { loadFile } = await import(P + '/src/io/index.js');
const { parseTrajectory } = await import(P + '/src/trajectory.js');
const ASSETS = {
  'laz-perf.wasm': P + '/node_modules/laz-perf/lib/web/laz-perf.wasm',
  'draco_decoder.wasm': P + '/node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm',
  'web-ifc.wasm': P + '/node_modules/web-ifc/web-ifc.wasm',
  'occt-import-js.wasm': P + '/node_modules/occt-import-js/dist/occt-import-js.wasm',
};
const cache = new Map();
const bytesOf = p => { if (!cache.has(p)) cache.set(p, new Uint8Array(readFileSync(p))); return cache.get(p); };
const JA = /[぀-ヿ一-鿿]/;

async function runOne(job) {
  // job: { id, file, name?, companions?: [{path,name,mut?}], mut?, cap?, kind?: 'cloud'|'traj', bytesB64? }
  let bytes = job.bytesB64 ? new Uint8Array(Buffer.from(job.bytesB64, 'base64')) : bytesOf(job.file);
  if (job.mut) bytes = mutate(bytes, job.mut);
  const name = job.name || basename(job.file);
  const companions = {};
  for (const c of job.companions || []) {
    let cb = bytesOf(c.path);
    if (c.mut) cb = mutate(cb, c.mut);
    companions[c.name || basename(c.path)] = new Blob([cb]);
  }
  const t0 = performance.now();
  const out = { id: job.id, name, size: bytes.length };
  try {
    if (job.kind === 'traj') {
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
      const r = parseTrajectory(ab);
      const p = r.poses; let bad = 0;
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) bad++;
      Object.assign(out, { ok: true, n: r.count, topic: r.topic, nonFinite: bad });
    } else {
      const { sink, info } = await loadFile(new Blob([bytes]), name, {
        cap: job.cap || 30000000, offset: job.offset || null, companions,
        asset: async n => new Uint8Array(readFileSync(ASSETS[n])),
        assetURL: async n => 'file://' + ASSETS[n],
      }, () => {});
      const r = sink.finish();
      if (!r.n) throw Object.assign(new Error(r.skipped ? `座標の正しい点がありません（${r.skipped.toLocaleString()} 点を除外）` : '点がありません'), { zeroPoints: true });
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      let nonFinite = 0;
      for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) {
        const v = r.positions[3 * i + k];
        if (!Number.isFinite(v)) { nonFinite++; continue; }
        const w = v + r.offset[k]; if (w < lo[k]) lo[k] = w; if (w > hi[k]) hi[k] = w;
      }
      let fieldNonFinite = 0;
      for (const a of Object.values(r.fields)) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { fieldNonFinite++; }
      Object.assign(out, { ok: true, n: r.n, total: r.total, skipped: r.skipped, sampled: r.sampled, offset: r.offset, min: lo, max: hi, nonFinite, fieldNonFinite,
        fields: Object.keys(r.fields), rgb: !!r.rgb, format: info.format || '', note: info.note || '' });
    }
  } catch (e) {
    const isErr = e instanceof Error;
    let message = isErr ? e.message : String(e);
    // 本番の別スレッドと同じ書き換え（src/worker.js 466 行）
    const rewritten = /WebAssembly|wasm|unsafe-eval|Content Security Policy/i.test(message);
    Object.assign(out, { ok: false, errName: isErr ? e.constructor.name : typeof e, message: String(message).slice(0, 300), ja: JA.test(message), zero: !!(e && e.zeroPoints), rewritten,
      stack: isErr ? String(e.stack || '').split('\n').slice(1, 4).map(s => s.trim()).join(' | ') : '' });
  }
  out.ms = Math.round(performance.now() - t0);
  return out;
}

process.on('message', async job => {
  if (job === 'bye') process.exit(0);
  const r = await runOne(job);
  if (global.gc) global.gc();
  process.send({ ...r, rss: process.memoryUsage().rss });
});
process.send({ ready: true });
