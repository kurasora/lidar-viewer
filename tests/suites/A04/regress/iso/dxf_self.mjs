// DXF のブロックが自分自身を挿入: 日本語のエラーか、1 回だけ展開して終わるべき（英語のスタック溢れにしない）
import { tryRead, isJapanese } from '../lib/read.mjs';
const dxf = ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'A', '10', '0', '20', '0', '30', '0', '0', 'POINT', '10', '1', '20', '1', '30', '0', '0', 'INSERT', '2', 'A', '10', '1', '20', '0', '30', '0', '0', 'ENDBLK', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '2', 'A', '10', '0', '20', '0', '30', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
const t = await tryRead('rec.dxf', dxf);
console.log(t.ok ? `n=${t.r.n}` : `${t.name}: ${t.error}`);
process.exit(t.ok || isJapanese(t.error) ? 0 : 1);
