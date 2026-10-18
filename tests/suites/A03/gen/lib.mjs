// A03: 試験用ファイルを作る共通部品
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const W = dirname(dirname(fileURLToPath(import.meta.url)));
export const SEED = '/home/claude/pcd-viewer/sample/formats';
export const seed = n => new Uint8Array(readFileSync(join(SEED, n)));
export const te = new TextEncoder();
export const cat = (...parts) => { parts = parts.map(p => typeof p === 'string' ? te.encode(p) : p); const n = parts.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
export const latin = s => Uint8Array.from(s, c => c.charCodeAt(0) & 255);
export function le(n, bytes, v, float = false) {
  const b = new Uint8Array(bytes), d = new DataView(b.buffer);
  if (float) bytes === 4 ? d.setFloat32(0, v, true) : d.setFloat64(0, v, true);
  else if (bytes === 1) d.setUint8(0, v); else if (bytes === 2) d.setUint16(0, v, true); else if (bytes === 4) d.setUint32(0, v >>> 0, true); else d.setBigUint64(0, BigInt(v), true);
  return b;
}
export const f32 = (...vs) => { const a = new Float32Array(vs); return new Uint8Array(a.buffer); };
export const f64 = (...vs) => { const a = new Float64Array(vs); return new Uint8Array(a.buffer); };
export const u32 = (...vs) => { const a = new Uint32Array(vs.map(v => v >>> 0)); return new Uint8Array(a.buffer); };
export const i32 = (...vs) => { const a = new Int32Array(vs); return new Uint8Array(a.buffer); };
export const u16 = (...vs) => { const a = new Uint16Array(vs); return new Uint8Array(a.buffer); };
export function patch(b, at, bytes) { const o = b.slice(); o.set(bytes, at); return o; }

// ケースの登録: add({ id, name, bytes, companions:[{name,bytes}], cap, kind, note })
export function makeSet(setName) {
  const dir = join(W, 'gen', 'files', setName);
  mkdirSync(dir, { recursive: true });
  const jobs = [];
  return {
    dir,
    add(c) {
      const d = join(dir, c.id); mkdirSync(d, { recursive: true });
      const fp = join(d, c.name); writeFileSync(fp, c.bytes);
      const comps = (c.companions || []).map(x => { const p = join(d, x.name); writeFileSync(p, x.bytes); return { path: p, name: x.name }; });
      jobs.push({ id: `${setName}:${c.id}`, file: fp, companions: comps, cap: c.cap, kind: c.kind, note: c.note || '' });
    },
    write(out) { writeFileSync(out || join(W, 'gen', `jobs_${setName}.jsonl`), jobs.map(j => JSON.stringify(j)).join('\n') + '\n'); return jobs.length; },
  };
}
