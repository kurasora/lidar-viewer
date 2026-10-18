// C9b ライブ（アプリ版）: 配信を受ける別の PC
'use strict';
const L = require('../lib.js');
const fs = require('fs');
const O = L.W + '/out/live';
const mark = n => fs.writeFileSync(`${O}/mark_${n}`, String(Date.now()));
const wait = n => new Promise(r => { const iv = setInterval(() => { if (fs.existsSync(`${O}/mark_${n}`)) { clearInterval(iv); r(); } }, 200); });
(async () => {
  const { app, p, errors } = await L.launch('c9recv');
  const st = () => p.evaluate(() => ({ peers: document.getElementById('livePeers').innerText.replace(/\n/g, ' | '), now: !document.getElementById('liveNow').hidden, src: document.getElementById('liveSrc').textContent, rate: document.getElementById('liveRate').textContent, msg: document.getElementById('statMsg').textContent, shareBoxHidden: document.getElementById('liveShareBox').hidden }));
  const T0 = Date.now();
  const log = async (tag) => L.log({ who: 'recv', tag, t: Math.round((Date.now() - T0) / 1000), ...(await st()) });
  await p.click('[data-open="live"]');
  await wait('sharing');
  await p.waitForFunction(() => document.querySelector('#livePeers button[data-lpeer]'), null, { timeout: 20000 }).catch(() => {});
  await log('peers');
  await p.click('#livePeers button[data-lpeer]'); await L.sleep(3000); await log('receiving');
  await L.shot(p, 'c9_recv_receiving');
  mark('recv_connected');
  // 送り手の LiDAR が止まっている間・戻ったあと・配信をやめたあと
  for (let i = 0; i < 40; i++) { await L.sleep(2000); const s = await st(); L.log({ who: 'recv', t: Math.round((Date.now() - T0) / 1000), now: s.now, rate: s.rate, msg: s.msg }); if (fs.existsSync(`${O}/mark_share_off`) && !s.now) break; }
  await log('end');
  await L.shot(p, 'c9_recv_end');
  mark('recv_done');
  L.log({ who: 'recv', errors: errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e)).slice(0, 10) });
  await app.close();
})().catch(e => { console.log('FATAL recv', e.stack); fs.writeFileSync(L.W + '/out/live/mark_recv_done', 'x'); process.exit(1); });
