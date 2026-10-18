// A03: out/*.jsonl を集計して、英語例外の漏れ箇所・HANG/MEM/CRASH・非有限座標をまとめる
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const OUT = join(process.env.W || '/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A03', 'out');
const tot = { ok: 0, err: 0, hang: 0, mem: 0, crash: 0 };
const eng = new Map(); const hang = [], mem = [], crash = [], nonfin = new Map();
for (const f of readdirSync(OUT)) {
  if (!f.endsWith('.jsonl') || f === 'base.jsonl' || f === '_checks.jsonl') continue;
  for (const l of readFileSync(join(OUT, f), 'utf8').split('\n').filter(Boolean)) {
    let r; try { r = JSON.parse(l); } catch { continue; }
    tot[r.status] = (tot[r.status] || 0) + 1;
    if (r.status === 'hang') hang.push(r.id);
    if (r.status === 'mem') mem.push(r.id);
    if (r.status === 'crash') crash.push(r.id + ' ' + (r.sig || r.code));
    if (r.status === 'err' && !r.ja) {
      const m = (r.stack || '').match(/src\/io\/formats\/\w+\.js:\d+|src\/\w+\.js:\d+/);
      const key = `${r.errName}|${m ? m[0] : '?'}`;
      const e = eng.get(key) || { n: 0, msg: (r.message || '').slice(0, 50), ex: r.id }; e.n++; eng.set(key, e);
    }
    if ((r.flags || []).includes('NONFINITE')) { const k = (r.id.split(':')[1] || r.id).replace(/[#@:].*/, ''); nonfin.set(k, (nonfin.get(k) || 0) + 1); }
  }
}
console.log('状態別 合計:', JSON.stringify(tot));
console.log('\n英語/内部例外が漏れる箇所:');
for (const [k, v] of [...eng].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(v.n).padStart(4)}  ${k.padEnd(42)} ${v.msg}  (ex ${v.ex})`);
console.log('\nHANG:', hang);
console.log('MEM :', [...new Set(mem)]);
console.log('CRASH:', crash);
console.log('非有限座標が出た形式:', JSON.stringify(Object.fromEntries(nonfin)));
