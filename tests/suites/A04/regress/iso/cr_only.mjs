// CR だけの改行の xyz（2000 点・約 50 KB）: 2000 点として読むべき（いまは 1 点 + 値の欄 5994 個・大量のメモリ）
import { tryRead } from '../lib/read.mjs';
let s = ''; for (let i = 0; i < 2000; i++) s += `${(i * 0.1).toFixed(1)} ${(i * 0.2).toFixed(1)} ${(i * 0.3).toFixed(1)}\r`;
const t = await tryRead('cr.xyz', s);
const rss = process.memoryUsage().rss / 1e6;
console.log(t.ok ? `n=${t.r.n}・値の欄 ${Object.keys(t.r.fields).length} 個・RSS ${rss.toFixed(0)} MB` : 'エラー: ' + t.error);
process.exit(t.ok && t.r.n === 2000 ? 0 : 1);
