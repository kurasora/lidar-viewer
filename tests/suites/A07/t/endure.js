// endure.js — 耐久: アプリ（a07u2）で LiDAR（a07u1、毎秒 20 万点）を受け続け、配信 ON（間引き 1/2）、見る側（a07u3、Node の Live）がつなぎっぱなし。
//   DUR 秒（既定 2100 = 35 分）のあいだ 30 秒ごとに主プロセス・画面・GPU のメモリを測る
//   MEM=2500 TIMEOUT=2600 heavy ip netns exec a07u2 xvfb-run -a -n 170 node t/endure.js
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info, sleep, ns, ip } = H;
const path = require('node:path'); const fs = require('node:fs');
const DUR = +(process.env.DUR || 2100);
const PC = path.join(H.W, 'lib', 'livepc.js');
async function ask(p, cmd, ev, ms = 8000) { const n = p.ev.length; p.send(cmd); const t = Date.now(); while (Date.now() - t < ms) { const e = p.ev.slice(n).find(x => x.ev === ev || x.ev === 'error'); if (e) return e; await sleep(50); } return null; }
function pidsOf(mainPid) { // Electron の子孫プロセス（画面は zygote の子なので孫になる）
  const rows = H.shq('ps -e -o pid=,ppid=,args=').trim().split('\n').map(l => { const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l); return m && { pid: +m[1], ppid: +m[2], args: m[3] }; }).filter(Boolean);
  const out = [], stack = [mainPid];
  while (stack.length) { const p = stack.pop(); for (const r of rows) if (r.ppid === p) { stack.push(r.pid); const t = (/--type=(\S+)/.exec(r.args) || [0, 'other'])[1]; if (t === 'renderer' || t === 'gpu-process' || t === 'utility' || t === 'zygote') out.push({ pid: r.pid, type: t + (out.some(o => o.type.startsWith(t)) ? out.filter(o => o.type.startsWith(t)).length : '') }); } }
  return out;
}
const slope = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return den ? num / den : 0; };

(async () => {
  const A = H.sim(ns(1), { ip: ip(1), sn: 'ENDURE00000001', reply: 'broadcast', pattern: 'grid', rate: 200000 });
  await A.waitFor(e => e.ev === 'ready');
  const { app, page, errors } = await E.launch('endure');
  const mainPid = app.process().pid;
  await E.openLive(page);
  await E.waitUi(page, u => u.devices.length >= 1, 8000);
  await page.click(`#liveDevices li:has-text("${ip(1)}") button`);
  await E.waitUi(page, u => u.now, 8000, 100);
  await page.selectOption('#liveShareStep', '2');
  await page.check('#liveShare'); await page.waitForTimeout(2000);
  const V = H.spawnJson(ns(3), H.ENODE, [PC], { env: { ELECTRON_RUN_AS_NODE: '1' }, name: 'viewer' });
  await V.waitFor(e => e.ev === 'ready', 10000); await sleep(3000);
  const vs = await ask(V, 'state', 'state'); const key = vs.st.peers[0] && vs.st.peers[0].key;
  await ask(V, 'peer ' + key, 'peer');
  const kids = pidsOf(mainPid); info('H0-processes', kids);
  const samples = []; const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < DUR) {
    const m = await E.mainRes(app).catch(() => null);
    const r = await page.evaluate(() => ({ heap: Math.round(performance.memory.usedJSHeapSize / 1048576), rate: document.getElementById('liveRate').textContent, clients: document.getElementById('liveShareClients').textContent })).catch(() => null);
    const v = await ask(V, 'state', 'state', 3000);
    const s = { min: +((Date.now() - t0) / 60000).toFixed(1), mainRss: E.procMem(mainPid), mainHeap: m && m.heap, mainAb: m && m.ab, handles: m && m.handles };
    for (const k of kids) s[k.type + 'Rss'] = E.procMem(k.pid);
    Object.assign(s, { rHeap: r && r.heap, rate: r && r.rate, clients: r && r.clients, viewerPts: v && v.pts, viewerRssMB: null });
    samples.push(s); console.log('SAMPLE ' + JSON.stringify(s));
    fs.writeFileSync(path.join(H.W, 'logs', 'endure_samples.json'), JSON.stringify(samples));
    await sleep(30000);
  }
  // 最初の 5 分は温まり（JIT・GC の初期）として除き、残りで増え方（MB/分）を出す
  const use = samples.filter(s => s.min >= 5);
  const xs = use.map(s => s.min);
  const sl = {}; for (const k of ['mainRss', 'rendererRss', 'gpu-processRss', 'rHeap', 'mainHeap']) { const ys = use.map(s => s[k]).filter(v => typeof v === 'number'); if (ys.length === xs.length) sl[k] = +slope(xs, ys).toFixed(2); }
  const first = use[0], last = use[use.length - 1];
  check('H1-endurance-no-growth', Object.values(sl).every(v => v < 1.0), { durationMin: last.min, slopeMBperMin: sl, first, last, viewerPtsTotal: last.viewerPts });
  check('H1-no-errors', errors.length === 0, errors);
  await ask(V, 'quit', 'bye'); await V.kill();
  await app.close();
  H.save('endure');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
