// h.js — A07 の試験の共通部品（にせ LiDAR などの子プロセスを netns の中で起動・記録・後片付け、判定の記録）
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const W = path.resolve(__dirname, '..');
const APP = process.env.APPDIR || '/home/claude/pcd-viewer'; // 試すアプリ（直した版を試すときは APPDIR=<そのフォルダ>）
const LIVEJS = path.join(APP, 'live.js');
const SIM = path.join(__dirname, 'mid360sim.js');
const ENODE = '/home/claude/pcd-viewer/node_modules/electron/dist/electron'; // ELECTRON_RUN_AS_NODE=1 で Node 20.19.1（本番と同じ libuv 1.46）
const kids = new Set();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 子プロセス（1 行 1 JSON の出力を ev に貯める）
function spawnJson(ns, cmd, args, opt = {}) {
  const full = ns ? ['netns', 'exec', ns, cmd, ...args] : null;
  const p = ns ? spawn('ip', full, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(opt.env || {}) } })
    : spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(opt.env || {}) } });
  kids.add(p);
  const h = { p, ev: [], raw: [], err: '' , name: opt.name || cmd };
  let buf = '';
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); h.raw.push(l); try { h.ev.push(JSON.parse(l)); } catch (e) { /* ただの文字 */ } } });
  p.stderr.on('data', d => { h.err += d; if (h.err.length > 20000) h.err = h.err.slice(-20000); });
  p.on('exit', (c, s) => { h.exited = { c, s }; kids.delete(p); });
  h.send = l => { try { p.stdin.write(l + '\n'); } catch (e) { /* 終わっている */ } };
  h.last = ev => [...h.ev].reverse().find(e => e.ev === ev);
  h.all = ev => h.ev.filter(e => e.ev === ev);
  h.waitFor = async (pred, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const e = h.ev.find(pred); if (e) return e; await sleep(50); } return null; };
  h.kill = async () => { if (h.exited) return; try { p.kill('SIGTERM'); } catch (e) { /**/ } for (let i = 0; i < 20 && !h.exited; i++) await sleep(50); if (!h.exited) try { p.kill('SIGKILL'); } catch (e) { /**/ } };
  return h;
}
const sim = (ns, opts) => spawnJson(ns, 'node', [SIM, JSON.stringify(opts)], { name: `sim@${ns}` });

async function cleanup() { for (const p of [...kids]) { try { p.kill('SIGTERM'); } catch (e) { /**/ } } await sleep(300); for (const p of [...kids]) { try { p.kill('SIGKILL'); } catch (e) { /**/ } } }
process.on('exit', () => { for (const p of kids) { try { p.kill('SIGKILL'); } catch (e) { /**/ } } });

// 判定の記録
const results = [];
function check(id, ok, detail) { results.push({ id, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); return ok; }
function info(id, detail) { results.push({ id, info: true, detail }); console.log(`INFO ${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); }
function save(name) { const f = path.join(W, 'logs', name + '.json'); fs.writeFileSync(f, JSON.stringify(results, null, 1)); return f; }

// ip コマンド（自分の netns だけを触る）
function sh(cmd) { return require('node:child_process').execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function shq(cmd) { try { return sh(cmd); } catch (e) { return 'ERR ' + (e.stderr || e.message); } }

// netns の組（Node の試験は a07＝10.107.0.x、画面の試験は a07u＝10.117.0.x を使い、同時に動いても混ざらないようにする）
const NSP = process.env.NSP || 'a07', NET = process.env.NET || '10.107.0';
const ns = k => `${NSP}${k}`, ip = k => `${NET}.${k}`, bcast = () => `${NET}.255`;

// 別々の netns で動くスクリプトどうしの合図（$W/tmp/sync/<名前>.json）
const SYNC = path.join(W, 'tmp', 'sync');
function mark(name, data = {}) { fs.mkdirSync(SYNC, { recursive: true }); fs.writeFileSync(path.join(SYNC, name + '.json'), JSON.stringify({ t: Date.now(), ...data })); }
async function waitMark(name, ms = 60000) { const f = path.join(SYNC, name + '.json'); const t = Date.now(); while (Date.now() - t < ms) { if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* 書きかけ */ } } await sleep(100); } return null; }
function clearMarks() { fs.rmSync(SYNC, { recursive: true, force: true }); fs.mkdirSync(SYNC, { recursive: true }); }

module.exports = { W, APP, LIVEJS, SIM, ENODE, sleep, spawnJson, sim, cleanup, check, info, results, save, sh, shq, NSP, NET, ns, ip, bcast, mark, waitMark, clearMarks };
