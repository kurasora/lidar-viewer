// ui3.js — 画面: 偽の知らせの洪水（配信の知らせ 47800／検出の返事 56000）で画面が固まるか
//   NSP=a07u NET=10.117.0 heavy ip netns exec a07u2 xvfb-run -a -n 170 node t/ui3.js
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info, sleep, ns } = H;
const path = require('node:path');
const ATK = path.join(H.W, 'lib', 'attacker.js');

async function probe(page, ms) {
  // ms のあいだ、画面のスクリプトの応答（evaluate の往復）と描画の間隔（rAF）を測る
  await page.evaluate(() => { window.__gaps = []; let last = performance.now(); const f = t => { window.__gaps.push(t - last); last = t; if (!window.__stopGaps) requestAnimationFrame(f); }; window.__stopGaps = false; requestAnimationFrame(f); });
  const rtts = []; const t0 = Date.now();
  while (Date.now() - t0 < ms) { const a = Date.now(); await page.evaluate(() => 1); rtts.push(Date.now() - a); await sleep(100); }
  const gaps = await page.evaluate(() => { window.__stopGaps = true; return window.__gaps; });
  return { rttMax: Math.max(...rtts), rttAvg: Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length), samples: rtts.length, rafMax: Math.round(Math.max(...gaps)), rafCount: gaps.length };
}

(async () => {
  const { app, page, errors } = await E.launch('ui3');
  await E.openLive(page); await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__mut = 0; new MutationObserver(() => window.__mut++).observe(document.getElementById('livePeers'), { childList: true }); new MutationObserver(() => window.__mut++).observe(document.getElementById('liveDevices'), { childList: true }); });
  const base = await probe(page, 3000);
  info('I5-ui-baseline', base);
  const a = H.spawnJson(ns(5), 'node', [ATK, JSON.stringify({ mode: 'beacons', bcast: H.bcast(), n: 3000, perSec: 1500, name: 'evil' })], { name: 'beacons' });
  const during = await probe(page, 8000);
  await a.waitFor(e => e.ev === 'done', 20000);
  const after = await E.ui(page);
  const mut = await page.evaluate(() => window.__mut);
  check('I5-ui-beacon-flood-responsive', during.rttMax < 1000 && after.peers.length < 100, { during, peersListed: after.peers.length, listRebuilds: mut, firstPeers: after.peers.slice(0, 3) });
  await page.screenshot({ path: path.join(H.W, 'logs', 'ui3_beacons.png') });
  await sleep(6000);
  const later = await probe(page, 2000);
  info('I5-ui-after-expire', { ...later, peers: (await E.ui(page)).peers.length });
  // 検出の返事の洪水
  await page.evaluate(() => { window.__mut = 0; });
  const b = H.spawnJson(ns(5), 'node', [ATK, JSON.stringify({ mode: 'acks', bcast: H.bcast(), n: 3000, perSec: 1500 })], { name: 'acks' });
  const during2 = await probe(page, 8000);
  await b.waitFor(e => e.ev === 'done', 20000);
  const after2 = await E.ui(page);
  check('I6-ui-ack-flood-responsive', during2.rttMax < 1000 && after2.devices.length < 100, { during: during2, devicesListed: after2.devices.length, listRebuilds: await page.evaluate(() => window.__mut) });
  await page.screenshot({ path: path.join(H.W, 'logs', 'ui3_acks.png') });
  info('errors', errors);
  await app.close();
  H.save('ui3');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
