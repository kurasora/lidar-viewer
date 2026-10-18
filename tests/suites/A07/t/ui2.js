// ui2.js — 画面: ポートの取り合い（1. SO_REUSEADDR なしのソフトが先 → 知らせ → そのソフトを止めて開き直せるか、2. SDK2 と同じ作りのドライバが先 → 何が見えるか）
//   NSP=a07u NET=10.117.0 heavy ip netns exec a07u2 xvfb-run -a -n 170 node t/ui2.js
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info, sleep, ns, ip } = H;
const path = require('node:path');
const DRV = path.join(H.W, 'lib', 'drvsim.py');

(async () => {
  const A = H.sim(ns(1), { ip: ip(1), sn: 'UI2LIDAR000001', reply: 'broadcast', pattern: 'grid', rate: 50000 });
  await A.waitFor(e => e.ev === 'ready');
  // ---- 1. ふつうのソフト（SO_REUSEADDR なし）が 56301 を持っている
  let d = H.spawnJson(null, 'python3', [DRV, '--mode', 'generic', '--ports', '56301'], { name: 'generic' });
  await d.waitFor(e => e.ev === 'ready');
  let { app, page, errors } = await E.launch('ui2a');
  await E.openLive(page); await page.waitForTimeout(3000);
  const u1 = await E.ui(page);
  check('D3-ui-conflict-message', /56301/.test(u1.err), { err: u1.err, devices: u1.devices });
  await page.screenshot({ path: path.join(H.W, 'logs', 'ui2_conflict.png') });
  // そのソフトを止めて、カードを閉じて開き直す
  await d.kill(); await sleep(500);
  await page.click('#popClose').catch(() => {}); await page.waitForTimeout(500);
  await E.openLive(page); await page.waitForTimeout(4000);
  const u2 = await E.ui(page);
  check('D3-ui-retry-after-conflict-resolved', !u2.err && u2.devices.some(t => /UI2LIDAR/.test(t)), { err: u2.err, devices: u2.devices, note: 'ほかのソフトを止めたあと、カードを開き直せば使えるようになるか（期待）／アプリを起動し直すしかないか' });
  await app.close();

  // ---- 2. SDK2 と同じ作り（SO_REUSEADDR・特定の IP に bind）のドライバが先に動いている
  d = H.spawnJson(null, 'python3', [DRV, '--mode', 'sdk2', '--host-ip', ip(2)], { name: 'sdk2' });
  await d.waitFor(e => e.ev === 'ready');
  ({ app, page, errors } = await E.launch('ui2b'));
  await E.openLive(page);
  await E.waitUi(page, u => u.devices.some(t => /UI2LIDAR/.test(t)), 8000);
  await E.msgs(page);
  await page.click(`#liveDevices li:has-text("${ip(1)}") button`);
  await E.waitUi(page, u => u.now, 8000, 100); await page.waitForTimeout(3000);
  const u3 = await E.ui(page); const m3 = await E.msgs(page);
  check('D1-ui-driver-first', /[1-9]/.test(u3.rate.replace(/,/g, '')) || u3.err || m3.some(m => m.err), { src: u3.src, rate: u3.rate, dot: u3.dot, err: u3.err, msgs: m3.map(m => m.text), note: '点が 1 つも来ないのに、赤い知らせも説明もない' });
  await page.screenshot({ path: path.join(H.W, 'logs', 'ui2_driver_first.png') });
  info('D1-driver-stats', d.last('stats'));
  await app.close(); await d.kill();
  info('errors', errors);
  H.save('ui2');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
