// ui1.js — 画面からの操作: 返事のない LiDAR の知らせ、LiDAR の切り替えで点が混ざるか（スナップショットで確かめる）、毎秒の点数、主プロセスの資源
//   NSP=a07u NET=10.117.0 heavy ip netns exec a07u2 xvfb-run -a -n 170 node t/ui1.js
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info, sleep, ns, ip } = H;
const path = require('node:path');

(async () => {
  const A = H.sim(ns(1), { ip: ip(1), sn: 'LIDARA00000001', reply: 'broadcast', pattern: 'grid', rate: 100000 });
  const B = H.sim(ns(4), { ip: ip(4), sn: 'LIDARB00000001', reply: 'broadcast', pattern: 'ring', ringR: 5000, rate: 100000 });
  const C = H.sim(ns(5), { ip: ip(5), sn: 'NOACK000000001', reply: 'subnet', replyTo: H.bcast(), ack: false, pattern: 'ring', ringR: 8000, rate: 50000 });
  for (const s of [A, B, C]) await s.waitFor(e => e.ev === 'ready');
  const { app, page, errors } = await E.launch('ui1');
  const res0 = await E.mainRes(app);
  await E.openLive(page);
  const u0 = await E.waitUi(page, u => u.devices.length >= 3, 8000);
  check('G0-list-3-lidars', !!u0 && u0.devices.length === 3, u0 && u0.devices);
  const resOpen = await E.mainRes(app);
  info('B0-main-res-open', { before: res0, afterOpen: resOpen });

  // ---- 返事のない LiDAR（C）を表示 → 「返事がありません」の知らせが見えるか
  await E.msgs(page);
  const t0 = Date.now();
  await page.click(`#liveDevices li:has-text("${ip(5)}") button`);
  const midUi = await E.ui(page); // 押した直後（返事を待っている間）の画面
  await E.waitUi(page, u => u.now, 8000, 100);
  const tNow = Date.now() - t0;
  await page.waitForTimeout(1500);
  const m1 = await E.msgs(page);
  const iNo = m1.findIndex(m => /返事がありません/.test(m.text));
  const shownMs = iNo >= 0 ? ((m1[iNo + 1] ? m1[iNo + 1].t : Infinity) - m1[iNo].t) : null;
  check('G1-noack-warning-visible', iNo >= 0 && shownMs > 2000, { msgs: m1.map(m => `${Math.round(m.t - m1[0].t)}ms ${m.err ? '[赤]' : ''}${m.text}`), shownMs: shownMs === null ? null : Math.round(shownMs), clickToLiveMs: tNow });
  info('G1-while-waiting', { now: midUi.now, pick: midUi.pick, msg: midUi.msg, note: '押してから表示が始まるまで（返事を待つ 3 秒）の画面' });
  const uC = await E.ui(page);
  info('G1-noack-ui-after', { src: uC.src, rate: uC.rate, msg: uC.msg });
  await page.click('#btnLiveStop'); await page.waitForTimeout(500);

  // ---- A を表示 → 止める → B を表示 → スナップショット
  await page.click(`#liveDevices li:has-text("${ip(1)}") button`);
  await E.waitUi(page, u => u.now, 5000, 100); await page.waitForTimeout(2200);
  const uA = await E.ui(page);
  info('G4-rate-A', { src: uA.src, rate: uA.rate, simRate: 100000, note: 'C（返事なし・毎秒 5 万点）の点も届いていれば 15 万点' });
  await page.click('#btnLiveStop'); await page.waitForTimeout(800);
  await page.click(`#liveDevices li:has-text("${ip(4)}") button`);
  await E.waitUi(page, u => u.now, 5000, 100); await page.waitForTimeout(2200);
  const uB = await E.ui(page);
  check('C1-ui-rate-B-only', /^(9\d|10\d),\d{3} 点\/秒$/.test(uB.rate), { src: uB.src, rate: uB.rate, note: 'B は毎秒 10 万点。A（と C）の点が混ざると 20 万点以上になる' });
  await page.click('#btnLiveSnap');
  const okSnap = await page.waitForFunction(() => window.__pcd.S.files.length >= 1, null, { timeout: 30000 }).then(() => true, () => false);
  await page.waitForTimeout(500);
  const snap = okSnap ? await page.evaluate(async () => {
    const f = window.__pcd.S.files[0]; const P = f.positions, o = window.__pcd.S.offset || [0, 0, 0];
    let a = 0, b = 0, c = 0, other = 0, inten = null;
    for (let i = 0; i < f.n; i++) {
      const x = P[3 * i] + o[0], y = P[3 * i + 1] + o[1];
      if (x > 0.99 && x < 2.01 && y < -1.99 && y > -2.8) a++; else if (Math.abs(Math.hypot(x, y) - 5) < 0.01) b++; else if (Math.abs(Math.hypot(x, y) - 8) < 0.01) c++; else other++;
    }
    try { const r = await window.__pcd.call({ type: 'field', id: f.id, name: 'intensity' }); inten = { n: r.values.length, min: Math.min(...r.values.slice(0, 50000)), max: Math.max(...r.values.slice(0, 50000)) }; } catch (e) { inten = String(e); }
    return { name: f.name, n: f.n, a, b, c, other, offset: o, fields: f.header && f.header.fields, inten };
  }) : { error: 'スナップショットのファイルができない', msg: (await E.ui(page)).msg };
  check('C1-snapshot-only-B', snap.b > 0 && snap.a === 0 && snap.c === 0, { ...snap, label: uB.src, note: 'ラベルは B だが、中身に A（grid）・C（半径 8 m）の点が入っていれば FAIL' });
  const resLive = await E.mainRes(app);
  info('B0-main-res-live', resLive);
  await page.screenshot({ path: path.join(H.W, 'logs', 'ui1_mixed.png') });

  await page.click('#btnLiveStop'); await page.waitForTimeout(800);
  const resStop = await E.mainRes(app);
  info('B0-main-res-after-stop', resStop);
  check('G9-no-page-errors', errors.length === 0, errors);
  info('sims', { A: A.last('stats'), B: B.last('stats'), C: C.last('stats') });
  await app.close();
  H.save('ui1');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
