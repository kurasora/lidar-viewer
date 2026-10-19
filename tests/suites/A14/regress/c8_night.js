// C8 深夜ツアー: 開く→閉じるを繰り返す。メモリ（画面のプロセス・GPU・主プロセス）の推移を見る
//   CYCLES=30 node c8_night.js
'use strict';
const L = require('./lib.js');
const fs = require('fs');
const CYCLES = +(process.env.CYCLES || 30);
function rssTree(root) { // root とその子孫の RSS（MB）を種類ごとに
  const all = fs.readdirSync('/proc').filter(x => /^\d+$/.test(x)).map(Number);
  const info = {};
  for (const pid of all) { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const pp = +st.slice(st.lastIndexOf(')') + 2).split(' ')[1]; const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); const rss = +(fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/) || [0, 0])[1]; info[pid] = { pp, cmd, rss }; } catch (e) { /* 消えた */ } }
  const out = { main: 0, renderer: 0, gpu: 0, other: 0 };
  const walk = pid => { for (const [c, v] of Object.entries(info)) if (v.pp === pid) { const t = /--type=renderer/.test(v.cmd) ? 'renderer' : /--type=gpu/.test(v.cmd) ? 'gpu' : 'other'; out[t] += v.rss; walk(+c); } };
  if (info[root]) out.main = info[root].rss;
  walk(root);
  for (const k in out) out[k] = Math.round(out[k] / 1024);
  return out;
}
(async () => {
  const { app, p, errors } = await L.launch('c8');
  const mainPid = await app.evaluate(() => process.pid);
  const heap = () => p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  const R = { cycles: [] };
  R.start = { ...rssTree(mainPid), heap: await heap() };
  for (let i = 0; i < CYCLES; i++) {
    await L.open(p, [L.F + '/liosam/GlobalMap.pcd']);
    await p.click('[data-tool="measure"]').catch(() => {}); await p.click('[data-tool="measure"]').catch(() => {});
    await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
    await L.sleep(300);
    if (i % 5 === 4 || i === 0) R.cycles.push({ i: i + 1, ...rssTree(mainPid), heap: await heap() });
  }
  // 大きな地図（324 万点）も 4 回
  for (let i = 0; i < 4; i++) {
    await L.open(p, [L.F + '/fastlio/scans.pcd']);
    await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
    await L.sleep(500);
    R.cycles.push({ big: i + 1, ...rssTree(mainPid), heap: await heap() });
  }
  R.errors = errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e)).slice(0, 10);
  L.log(R);
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
