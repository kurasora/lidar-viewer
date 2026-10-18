import { createRequire } from 'node:module';
const require = createRequire('/home/claude/pcd-viewer/');
const live = require('/home/claude/pcd-viewer/live.js');
const { encodeBatch, decodeBatch } = live;
const b = { n: 4, xyz: new Float32Array(12), refl: new Uint8Array(4) };
const trials = [1, 2, 4, 0, -1, NaN, '2', 1e12, 2.5];
console.log('== encodeBatch(step) ==（share の step は IPC live:share で無検査のまま sharer.step に入る）');
for (const s of trials) {
  try { const buf = encodeBatch(b, s); console.log(`step=${String(s)} -> ok, bytes=${buf.length}`); }
  catch (e) { console.log(`step=${String(s)} -> THROW ${e.name}: ${e.message}`); }
}
console.log('\n== decodeBatch(malicious) ==');
const mk = (n, extra = 0) => { const buf = Buffer.alloc(8 + extra); buf.write('PCV1', 0, 'latin1'); buf.writeUInt32LE(n >>> 0, 4); return buf; };
for (const [label, buf] of [
  ['n=0xFFFFFFFF, len=8', mk(0xFFFFFFFF)],
  ['n=1e8, len=8', mk(100000000)],
  ['n=1 len=8 (xyz over)', mk(1)],
  ['n=0 len=8', mk(0)],
  ['not PCV1', Buffer.from('XXXX0000', 'latin1')],
]) {
  try { const r = decodeBatch(buf); console.log(`${label} -> ok n=${r && r.n}`); }
  catch (e) { console.log(`${label} -> THROW ${e.name}: ${e.message}`); }
}
