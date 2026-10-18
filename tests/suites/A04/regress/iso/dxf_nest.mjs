// DXF の入れ子のブロック（各段で 2 回挿入 × 段数）: 小さなファイルが 2^段数 の点になる。点数の上限で止まるべき
import { tryRead } from '../lib/read.mjs';
const levels = +(process.argv[2] || 24);
const L = ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'B0', '10', '0', '20', '0', '30', '0', '0', 'POINT', '10', '0', '20', '0', '30', '0', '0', 'ENDBLK'];
for (let k = 1; k <= levels; k++) L.push('0', 'BLOCK', '2', 'B' + k, '10', '0', '20', '0', '30', '0', '0', 'INSERT', '2', 'B' + (k - 1), '10', '0', '20', '0', '30', '0', '0', 'INSERT', '2', 'B' + (k - 1), '10', String(2 ** k), '20', '0', '30', '0', '0', 'ENDBLK');
L.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '2', 'B' + levels, '10', '0', '20', '0', '30', '0', '0', 'ENDSEC', '0', 'EOF');
const s = L.join('\n');
const t0 = Date.now();
const t = await tryRead('nest.dxf', s, { cap: 1e6 });
console.log(`${s.length} バイトの DXF: ${t.ok ? `n=${t.r.n} total=${t.r.total}` : 'エラー: ' + t.error}（${Date.now() - t0} ms）`);
process.exit(0);
