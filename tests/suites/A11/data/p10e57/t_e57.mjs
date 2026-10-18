import { loadFile } from '/home/claude/pcd-viewer/src/io/index.js';
import { readFileSync } from 'node:fs';
const { sink, info } = await loadFile(new Blob([readFileSync('pose2.e57')]), 'pose2.e57', { cap: 1e7, offset: null, companions: {} }, () => {});
const r = sink.finish();
const b = readFileSync('pose2_ref.npy'); const hl = b.readUInt16LE(8); const d = b.subarray(10 + hl); const ref = new Float64Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.length));
let maxe = 0; for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) maxe = Math.max(maxe, Math.abs(r.positions[3 * i + k] + r.offset[k] - ref[3 * i + k]));
console.log(JSON.stringify({ format: info.format, n: r.n, offset: r.offset, maxErr_mm: +(maxe * 1000).toFixed(3) }));
