// ui4.js — 画面: 壊れたメッセージを送る配信元につなぐと（主プロセスで捕まえていない例外 → Electron のエラーの窓）
//   NSP=a07u NET=10.117.0 heavy ip netns exec a07u2 xvfb-run -a -n 170 node t/ui4.js
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info, sleep, ns } = H;
const path = require('node:path');
const ATK = path.join(H.W, 'lib', 'attacker.js');
const timed = async (p, ms) => { const t = Date.now(); const r = await Promise.race([p.then(() => 'ok', e => 'err ' + e.message), sleep(ms).then(() => 'TIMEOUT')]); return { r, ms: Date.now() - t }; };

(async () => {
  const atk = H.spawnJson(ns(5), 'node', [ATK, JSON.stringify({ mode: 'peer', bcast: H.bcast(), name: 'lab-pc', kind: 'nbig', every: 400, max: 6, secs: 120 })], { name: 'peer' });
  await atk.waitFor(e => e.ev === 'ready');
  const { app, page, errors, mainLog } = await E.launch('ui4');
  await E.openLive(page);
  const u0 = await E.waitUi(page, u => u.peers.some(t => /lab-pc/.test(t)), 8000);
  info('I7-peer-listed', u0 && u0.peers);
  const before = await timed(app.evaluate(() => 1), 3000);
  await page.click('#livePeers li:has-text("lab-pc") button');
  await sleep(3000);
  const mainAfter = await timed(app.evaluate(() => 1), 5000);
  const pageAfter = await timed(page.evaluate(() => 1), 5000);
  const shot = path.join(H.W, 'logs', 'ui4_root.png');
  H.shq(`import -window root -display ${process.env.DISPLAY} ${shot}`);
  const u1 = await Promise.race([E.ui(page), sleep(5000).then(() => null)]);
  check('I7-ui-malformed-peer-no-dialog', mainAfter.r === 'ok' && !mainLog.join('').includes('Uncaught'), { mainBefore: before, mainAfter, pageAfter, ui: u1 && { src: u1.src, rate: u1.rate, msg: u1.msg }, mainLog: mainLog.join('').slice(-1500), screenshot: shot, note: '主プロセスで例外 → Electron は「A JavaScript error occurred in the main process」の窓を出す（窓が開いている間、主プロセスが止まるか）' });
  info('errors', errors);
  await Promise.race([app.close(), sleep(5000)]);
  try { app.process().kill('SIGKILL'); } catch (e) { /* 終わっている */ }
  H.save('ui4');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
