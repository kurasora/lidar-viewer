// c8 の coverage-summary.json を 2 つ（前・後）比べて、Markdown の表にする
//   node cov_table.mjs <前の coverage-summary.json> <後の coverage-summary.json>
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')));
const short = k => k.replace(/^.*\/src\//, 'src/');
const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => k !== 'total').sort((x, y) => short(x).localeCompare(short(y)));
const pct = (s, k, m) => (s[k] ? `${s[k][m].pct.toFixed(1)}` : '—');
console.log('| ファイル | 命令（前→後 %） | 分岐（前→後 %） | 関数（前→後 %） | 分岐の数 |');
console.log('|---|---|---|---|---|');
for (const k of keys) console.log(`| ${short(k)} | ${pct(a, k, 'statements')} → ${pct(b, k, 'statements')} | ${pct(a, k, 'branches')} → ${pct(b, k, 'branches')} | ${pct(a, k, 'functions')} → ${pct(b, k, 'functions')} | ${(b[k] || a[k]).branches.total} |`);
console.log(`| **合計** | ${a.total.statements.pct.toFixed(1)} → ${b.total.statements.pct.toFixed(1)} | ${a.total.branches.pct.toFixed(1)} → ${b.total.branches.pct.toFixed(1)} | ${a.total.functions.pct.toFixed(1)} → ${b.total.functions.pct.toFixed(1)} | ${b.total.branches.total} |`);
