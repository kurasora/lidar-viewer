// 小さな試験の枠組み（依存なし）
//   test(id, title, fn)   … fn が例外を投げなければ PASS。id は報告の番号（A04-0xx）か、問題のない確認なら 'OK-…'
//   expect 系           … eq / near / ok / throws / notThrows
//   PCDV_ROOT           … 対象のプロジェクト（既定 /home/claude/pcd-viewer）。将来 tests/ に入れるときはここを変える
import { join } from 'node:path';
export const ROOT = process.env.PCDV_ROOT || '/home/claude/pcd-viewer';
export const src = p => join(ROOT, p);
const tests = [];
export function test(id, title, fn, opts = {}) { tests.push({ id, title, fn, timeout: opts.timeout || 60000, file: opts.file || currentFile }); }
let currentFile = '';
export function setFile(f) { currentFile = f; }
// 別のプロセスで動かす試験（同期の無限ループ・メモリの暴走を見張る）。script は終了コード 0 で PASS、それ以外は最後の行を理由に FAIL
//   timeoutMs を過ぎるか、RSS が memMB を超えたら止めて FAIL
import { spawn } from 'node:child_process';
import { readFileSync as _rf } from 'node:fs';
import { dirname as _dn, join as _jn } from 'node:path';
import { fileURLToPath as _fu } from 'node:url';
const REG = _jn(_dn(_fu(import.meta.url)), '..');
export function isoTest(id, title, script, { timeoutMs = 20000, memMB = 500, args = [] } = {}) {
  test(id, title, () => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, ['--no-warnings', _jn(REG, script), ...args], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', peak = 0, why = null;
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    const iv = setInterval(() => {
      try { const m = /VmRSS:\s+(\d+)/.exec(_rf(`/proc/${p.pid}/status`, 'utf8')); const mb = m ? +m[1] / 1024 : 0; peak = Math.max(peak, mb); if (mb > memMB && !why) { why = `メモリ ${mb.toFixed(0)} MB が上限 ${memMB} MB を超えたので止めた`; p.kill('SIGKILL'); } } catch { /* 終わった */ }
      if (Date.now() - t0 > timeoutMs && !why) { why = `${timeoutMs / 1000} 秒で終わらないので止めた`; p.kill('SIGKILL'); }
    }, 100);
    p.on('exit', code => {
      clearInterval(iv);
      const last = out.trim().split('\n').pop() || '';
      if (why) reject(new Fail(`${why}（最大 ${peak.toFixed(0)} MB）${last ? ' / ' + last : ''}`));
      else if (code === 0) resolve();
      else reject(new Fail(`${last}（最大 ${peak.toFixed(0)} MB、${Date.now() - t0} ms）`));
    });
  }), { timeout: timeoutMs + 5000 });
}
export class Fail extends Error {}
const fmtv = v => { try { return JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : ArrayBuffer.isView(x) ? Array.from(x) : x)); } catch { return String(v); } };
export function eq(a, b, msg = '') { if (fmtv(a) !== fmtv(b)) throw new Fail(`${msg} 期待 ${fmtv(b)} 実際 ${fmtv(a)}`.trim()); }
export function near(a, b, tol, msg = '') {
  const A = ArrayBuffer.isView(a) || Array.isArray(a) ? Array.from(a) : [a], B = ArrayBuffer.isView(b) || Array.isArray(b) ? Array.from(b) : [b];
  if (A.length !== B.length || A.some((x, i) => !(Math.abs(x - B[i]) <= tol))) throw new Fail(`${msg} 期待 ${fmtv(B)}±${tol} 実際 ${fmtv(A)}`.trim());
}
export function ok(c, msg = '条件が成り立たない') { if (!c) throw new Fail(msg); }
export async function throws(fn, re, msg = '') {
  try { await fn(); } catch (e) { if (re && !re.test(e.message)) throw new Fail(`${msg} 例外の文言が違う: ${e.message}`); return e; }
  throw new Fail(`${msg} 例外が起きなかった`);
}
export async function run({ filter = null, json = false } = {}) {
  const res = [];
  for (const t of tests) {
    if (filter && !filter.test(t.id + ' ' + t.title + ' ' + t.file)) continue;
    const t0 = Date.now();
    let status = 'PASS', detail = '';
    try {
      await Promise.race([t.fn(), new Promise((_, rej) => setTimeout(() => rej(new Fail(`時間切れ ${t.timeout} ms`)), t.timeout).unref())]);
    } catch (e) {
      status = e instanceof Fail ? 'FAIL' : 'ERROR';
      detail = e instanceof Fail ? e.message : `${e && e.name}: ${e && e.message}`;
    }
    res.push({ id: t.id, title: t.title, file: t.file, status, detail, ms: Date.now() - t0 });
    if (!json) console.log(`${status.padEnd(5)} ${t.id.padEnd(9)} ${t.title}${detail ? '\n      → ' + detail.slice(0, 400) : ''}`);
  }
  const c = s => res.filter(r => r.status === s).length;
  const bugIds = [...new Set(res.filter(r => r.status !== 'PASS' && /^A04-/.test(r.id)).map(r => r.id))];
  const okFail = res.filter(r => r.status !== 'PASS' && !/^A04-/.test(r.id)).map(r => r.id + ' ' + r.title);
  if (json) console.log(JSON.stringify(res, null, 1));
  console.log(`\n合計 ${res.length} 件: PASS ${c('PASS')} / FAIL ${c('FAIL')} / ERROR ${c('ERROR')}`);
  console.log(`まだ直っていない問題（FAIL/ERROR の番号）: ${bugIds.join(' ') || 'なし'}`);
  if (okFail.length) console.log(`問題なしのはずの確認で失敗したもの（新しい不具合の可能性）: \n  ${okFail.join('\n  ')}`);
  return res;
}
