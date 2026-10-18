import { loadFile } from '/home/claude/pcd-viewer/src/io/index.js';
import { readFileSync } from 'node:fs';
const b = readFileSync('rgbf01.npy'); const hl = b.readUInt16LE(8); const d = b.subarray(10 + hl); const ex = new Float64Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.length));
for (const f of ['ply_float01.ply', 'ply_double01.ply']) {
  const { sink } = await loadFile(new Blob([readFileSync(f)]), f, { cap: 1e7, offset: null, companions: {} }, () => {});
  const r = sink.finish(); let bad = 0, mx = 0;
  for (let i = 0; i < 3 * r.n; i++) { if (Math.abs(r.rgb[i] - ex[i]) > 1) bad++; mx = Math.max(mx, r.rgb[i]); }
  console.log(JSON.stringify({ file: f, n: r.n, badShare: +(bad / (3 * r.n)).toFixed(4), maxChannelValue: mx, first: Array.from(r.rgb.slice(0, 3)), want: Array.from(ex.slice(0, 3)) }));
}
