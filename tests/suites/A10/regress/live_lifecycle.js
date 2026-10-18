// ライブ中の寿命の試験（netns の中で動かす）。役割ごとに 1 プロセス
//   node live_lifecycle.js host    … a102: LiDAR につないで配信 → 配信中に窓を閉じる → すぐ起動し直す → 2 つ同時に起動
//   node live_lifecycle.js viewer  … a103: 配信を受けて表示 → 配信元が閉じたときに止まるか
// 環境変数: APPBIN、W、RUN（記録の置き場所）
'use strict';
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const W = process.env.W;
const APP = process.env.APPBIN || '/home/claude/pcd-viewer/release/linux-unpacked/lidar-viewer';
const RUN = process.env.RUN || path.join(W, 'run', 'live');
fs.mkdirSync(RUN, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const emit = o => console.log(JSON.stringify(o));
const role = process.argv[2];

function procTable() {
  const t = {};
  for (const p of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(p)) continue;
    try { const st = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const r = st.slice(st.lastIndexOf(')') + 2).split(' '); t[p] = { ppid: +r[1], state: r[0] }; } catch (e) { /* */ }
  }
  return t;
}
function descendants(pid) {
  const t = procTable(); const kids = {};
  for (const [p, v] of Object.entries(t)) (kids[v.ppid] ||= []).push(+p);
  const out = [], st = [pid];
  while (st.length) { const x = st.pop(); for (const c of kids[x] || []) { out.push(c); st.push(c); } }
  return out;
}
const alive = pid => { try { process.kill(pid, 0); return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0] !== 'Z'; } catch (e) { return false; } };
const sockets = () => { try { return execSync('ss -uanpH; ss -tlnpH', { encoding: 'utf8' }).split('\n').filter(l => /lidar-viewer|electron/.test(l)).map(l => l.replace(/\s+/g, ' ').slice(0, 160)); } catch (e) { return ['ss error']; } };
const portsInUse = () => { try { return execSync('ss -uanpH', { encoding: 'utf8' }).split('\n').filter(l => /:(56000|56101|56201|56301|47800)\s/.test(l)).map(l => l.replace(/\s+/g, ' ').slice(0, 160)); } catch (e) { return []; } };

async function launch(name) {
  const ud = path.join(W, 'ud', 'live_' + name);
  fs.rmSync(ud, { recursive: true, force: true });
  const app = await pw._electron.launch({ executablePath: APP, args: ['--no-sandbox'], env: { ...process.env, PCDV_USERDATA: ud }, timeout: 90000 });
  const page = await app.firstWindow({ timeout: 90000 });
  const errs = [];
  page.on('pageerror', x => errs.push('pageerror: ' + x.message));
  await page.waitForFunction(() => window.__pcd, null, { timeout: 90000 });
  const proc = app.process();
  const exited = new Promise(r => proc.once('exit', (code, sig) => r({ code, sig, t: Date.now() })));
  return { app, page, pid: proc.pid, errs, exited, name };
}
const st = h => h.page.evaluate(() => ({
  dev: document.getElementById('liveDevices').innerText.replace(/\n/g, ' | ').slice(0, 200),
  peers: document.getElementById('livePeers').innerText.replace(/\n/g, ' | ').slice(0, 200),
  now: !document.getElementById('liveNow').hidden, src: document.getElementById('liveSrc').textContent,
  rate: document.getElementById('liveRate').textContent, msg: document.getElementById('statMsg').textContent,
  err: document.getElementById('liveErr').hidden ? '' : document.getElementById('liveErr').textContent,
  clients: document.getElementById('liveShareClients').textContent,
})).catch(e => ({ error: e.message.slice(0, 100) }));
const rateNum = s => +(String(s.rate || '').replace(/[^\d]/g, '') || 0);
async function waitFor(h, pred, ms) { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await st(h); if (pred(s)) return { ok: true, s, ms: Date.now() - t0 }; await sleep(250); } return { ok: false, s, ms }; }
async function closeAndWatch(h) {
  const kids = descendants(h.pid);
  const t0 = Date.now();
  h.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; if (w) w.close(); }).catch(() => {});
  const r = await Promise.race([h.exited, sleep(15000).then(() => null)]);
  await sleep(1200);
  return { exitMs: r ? r.t - t0 : null, code: r ? r.code : null, mainAlive: alive(h.pid), left: kids.filter(alive).length, portsAfter: portsInUse() };
}

async function host() {
  const out = { role: 'host' };
  // H1: LiDAR につないで配信 → 配信中に閉じる
  const a = await launch('hostA');
  await a.page.click('[data-open="live"]');
  const dev = await waitFor(a, s => /SN/.test(s.dev || ''), 20000);
  out.h1_device = { ok: dev.ok, ms: dev.ms, dev: dev.s.dev, err: dev.s.err };
  if (!dev.ok) { emit(out); return; }
  await a.page.click('#liveDevices button[data-lsn]');
  const pts = await waitFor(a, s => rateNum(s) > 0, 15000);
  out.h1_points = { ok: pts.ok, rate: pts.s.rate, src: pts.s.src };
  await a.page.click('#liveShare');
  fs.writeFileSync(path.join(RUN, 'host_sharing'), String(Date.now()));
  const cl = await waitFor(a, s => /^[1-9]/.test(s.clients || ''), 40000);
  out.h1_clients = { ok: cl.ok, clients: cl.s.clients, ms: cl.ms };
  await sleep(3000);
  out.h1_socketsBefore = sockets();
  fs.writeFileSync(path.join(RUN, 'host_closing'), String(Date.now()));
  out.h1_close = await closeAndWatch(a);
  out.h1_errs = a.errs;
  // H2: すぐ起動し直す（ポートが空いているか）
  const b = await launch('hostA');
  await b.page.click('[data-open="live"]');
  const dev2 = await waitFor(b, s => /SN/.test(s.dev || '') || !!s.err, 15000);
  out.h2_relaunch = { ok: dev2.ok && !dev2.s.err, dev: dev2.s.dev, err: dev2.s.err, msg: dev2.s.msg };
  out.h2_close = await closeAndWatch(b);
  // H3: 設定の置き場所が違う 2 つを同時に（旧版 PCD Viewer と新版、portable の別の版を同時に動かしたのと同じ）
  const c1 = await launch('c1');
  await c1.page.click('[data-open="live"]');
  await waitFor(c1, s => /SN/.test(s.dev || ''), 15000);
  const c2 = await launch('c2');
  await c2.page.click('[data-open="live"]');
  const c2dev = await waitFor(c2, s => /SN/.test(s.dev || '') || !!s.err, 15000);
  out.h3_bothOpen = { c1: await st(c1), c2: c2dev.s, ports: portsInUse() };
  await c1.page.click('#liveDevices button[data-lsn]');
  await sleep(4000);
  out.h3_c1Connected = { c1: await st(c1), c2: await st(c2) };
  await c2.page.click('#liveDevices button[data-lsn]').catch(e => { out.h3_c2clickErr = e.message.slice(0, 100); });
  await sleep(5000);
  out.h3_c2Connected = { c1: await st(c1), c2: await st(c2) };
  out.h3_close1 = await closeAndWatch(c1);
  await sleep(3000);
  out.h3_afterC1Closed = { c2: await st(c2) };
  out.h3_close2 = await closeAndWatch(c2);
  emit(out);
}

async function viewer() {
  const out = { role: 'viewer' };
  const v = await launch('viewer');
  await v.page.click('[data-open="live"]');
  const peer = await waitFor(v, s => /の /.test(s.peers || '') && !/ありません/.test(s.peers || ''), 60000);
  out.v_peer = { ok: peer.ok, peers: peer.s.peers, ms: peer.ms };
  if (peer.ok) {
    await v.page.click('#livePeers button[data-lpeer]');
    const pts = await waitFor(v, s => rateNum(s) > 0, 15000);
    out.v_points = { ok: pts.ok, rate: pts.s.rate, src: pts.s.src };
    // 配信元が閉じるのを待つ
    const end = await waitFor(v, s => !s.now || /終わりました/.test(s.msg || ''), 60000);
    const closing = fs.existsSync(path.join(RUN, 'host_closing')) ? +fs.readFileSync(path.join(RUN, 'host_closing'), 'utf8') : null;
    out.v_end = { ok: end.ok, msg: end.s.msg, now: end.s.now, rate: end.s.rate, delayFromHostCloseMs: closing ? Date.now() - closing : null };
    const gone = await waitFor(v, s => /ありません/.test(s.peers || ''), 15000);
    out.v_peerGone = { ok: gone.ok, peers: gone.s.peers };
  }
  out.v_errs = v.errs;
  out.v_close = await closeAndWatch(v);
  emit(out);
}

(role === 'host' ? host() : viewer()).catch(e => emit({ role, fatal: e.message.slice(0, 400) })).finally(() => process.exit(0));
