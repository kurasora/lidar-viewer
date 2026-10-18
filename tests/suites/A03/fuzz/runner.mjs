// A03 ファジングの実行器（親）: node runner.mjs <jobs.jsonl> <out.jsonl> [--timeout=20000] [--mem=600] [--quiet]
//   ・子プロセス（child.mjs）を 1 つ起動し、入力を 1 件ずつ渡す（速い）
//   ・1 件ごとに時間を測り、/proc から子の RSS を 25 ms ごとに読んで最大値を記録する
//   ・時間切れ（固まる）・メモリ上限・子の異常終了（落ちる）のときは子を止めて記録し、次の子を起動して続ける
//   ・最後に、目印（英語の知らせ・Error 以外の例外・遅い・メモリが大きい・NaN など）ごとの数をまとめて出す
import { fork } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const jobsFile = args[0], outFile = args[1];
const TIMEOUT = +opt('timeout', 20000), MEMMB = +opt('mem', 600), QUIET = args.includes('--quiet');
const jobs = readFileSync(jobsFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
writeFileSync(outFile, '');

function rssOf(pid) { try { return +readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1] * 4096; } catch { return 0; } }

let child = null, ready = null;
function spawnChild() {
  child = fork(join(here, 'child.mjs'), [], { execArgv: ['--expose-gc', '--no-warnings', `--max-old-space-size=${MEMMB}`], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: { ...process.env } });
  let errbuf = '';
  child.stderr.on('data', d => { errbuf = (errbuf + d).slice(-2000); });
  child.errbuf = () => errbuf;
  ready = new Promise(res => child.once('message', () => res()));
}

async function runJob(job) {
  if (!child) { spawnChild(); await ready; }
  const c = child, pid = c.pid;
  const base = rssOf(pid);
  let peak = base;
  const t0 = Date.now();
  return new Promise(resolve => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; clearInterval(iv); c.removeAllListeners('message'); c.removeAllListeners('exit'); resolve(r); };
    const iv = setInterval(() => {
      const r = rssOf(pid); if (r > peak) peak = r;
      const el = Date.now() - t0;
      if (r > MEMMB * 1048576 + 200 * 1048576) { c.kill('SIGKILL'); child = null; finish({ id: job.id, status: 'mem', ms: el, peakMB: Math.round(peak / 1048576), baseMB: Math.round(base / 1048576) }); }
      else if (el > TIMEOUT) { c.kill('SIGKILL'); child = null; finish({ id: job.id, status: 'hang', ms: el, peakMB: Math.round(peak / 1048576), baseMB: Math.round(base / 1048576) }); }
    }, 25);
    c.on('message', m => { const r = rssOf(pid); if (r > peak) peak = r; finish({ ...m, status: m.ok ? 'ok' : 'err', peakMB: Math.round(peak / 1048576), baseMB: Math.round(base / 1048576), afterMB: Math.round((m.rss || 0) / 1048576) }); });
    c.on('exit', (code, sig) => { child = null; finish({ id: job.id, status: 'crash', ms: Date.now() - t0, code, sig, peakMB: Math.round(peak / 1048576), stderr: (c.errbuf() || '').split('\n').filter(Boolean).slice(-6).join(' | ') }); });
    c.send(job);
  });
}

const flagsOf = (r, job) => {
  const f = [];
  if (r.status === 'hang') f.push('HANG');
  if (r.status === 'mem') f.push('MEM');
  if (r.status === 'crash') f.push('CRASH');
  if (r.status === 'err' && !r.ja) f.push('ENGLISH');
  if (r.status === 'err' && r.errName && r.errName !== 'Error') f.push('NONERROR:' + r.errName);
  if (r.status === 'err' && r.rewritten) f.push('REWRITTEN');
  if ((r.ms || 0) > 3000 && r.status !== 'hang') f.push('SLOW');
  const grow = (r.peakMB || 0) - (r.baseMB || 0);
  const sz = (r.size || 0) / 1048576;
  if (grow > 300 || (grow > 60 && grow > 100 * sz + 30)) f.push('BIGMEM');
  if (r.status === 'ok' && r.nonFinite) f.push('NONFINITE');
  return f;
};

const counts = {}, msgs = new Map();
let i = 0;
for (const job of jobs) {
  const r = await runJob(job);
  r.flags = flagsOf(r, job);
  r.job = job;
  appendFileSync(outFile, JSON.stringify(r) + '\n');
  for (const f of r.flags) counts[f] = (counts[f] || 0) + 1;
  counts[r.status] = (counts[r.status] || 0) + 1;
  if (r.status !== 'ok') {
    const key = `${r.status}|${r.errName || ''}|${String(r.message || r.stderr || '').replace(/\d[\d,.]*/g, '#').slice(0, 120)}`;
    const e = msgs.get(key) || { n: 0, ex: job.id };
    e.n++; msgs.set(key, e);
  }
  i++;
  if (!QUIET && (r.flags.length || i % 200 === 0)) process.stdout.write(`[${i}/${jobs.length}] ${job.id} ${r.status} ${r.flags.join(',')} ${r.ms}ms ${r.peakMB}MB ${(r.message || '').slice(0, 100)}\n`);
}
if (child) { child.send('bye'); }
console.log('\n== まとめ ==');
console.log(JSON.stringify(counts));
console.log('== 失敗の種類（多い順） ==');
for (const [k, v] of [...msgs].sort((a, b) => b[1].n - a[1].n)) console.log(`${String(v.n).padStart(5)}  ${k}   例: ${v.ex}`);
