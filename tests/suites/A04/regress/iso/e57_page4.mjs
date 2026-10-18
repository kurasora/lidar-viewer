// E57 のページの大きさが 4 バイト（壊れた頭書き）: エラーで終わるべき（Phys.read が進まず止まらない）
import { tryRead } from '../lib/read.mjs';
import { buildE57 } from '../e57w.mjs';
const f = buildE57({ scans: [{ fields: [{ name: 'cartesianX', type: 'Float' }, { name: 'cartesianY', type: 'Float' }, { name: 'cartesianZ', type: 'Float' }], records: [[1, 2, 3]] }] });
new DataView(f.buffer).setBigUint64(40, BigInt(process.argv[2] || 4), true);
const t = await tryRead('page.e57', f);
console.log(t.ok ? `エラーにならず n=${t.r.n}` : `エラー: ${t.error}`);
process.exit(t.ok ? 1 : 0);
