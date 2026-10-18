// share_host.js — 配信元（a07u2）。share.sh から起動する。LiDAR=a07u1、見る側=a07u3(v1)・a07u5(v2)
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info, sleep, ns, ip, mark, waitMark } = H;
const path = require('node:path');
const SW = `${H.NSP}sw`, HV1 = `${H.NSP}h3`, HHOST = `${H.NSP}h2`;

(async () => {
  const A = H.sim(ns(1), { ip: ip(1), sn: 'SHARELIDAR0001', reply: 'broadcast', pattern: 'ring', ringR: 4000, rate: 200000 });
  await A.waitFor(e => e.ev === 'ready');
  const { app, page, errors } = await E.launch('host');
  await E.openLive(page);
  await E.waitUi(page, u => u.devices.length >= 1, 8000);
  await page.click(`#liveDevices li:has-text("${ip(1)}") button`);
  await E.waitUi(page, u => u.now, 8000, 100);
  await page.waitForTimeout(1000);
  await page.check('#liveShare');
  await page.waitForTimeout(1500);
  const u1 = await E.ui(page);
  check('F1-host-sharing', u1.share && /配信しています/.test(u1.msg), { share: u1.share, msg: u1.msg, clients: u1.clients });
  mark('sharing');
  await page.waitForTimeout(3000);
  const uSelf = await E.ui(page);
  // 自分の配信は自分の一覧に出ない（一覧は表示中は隠れているので DOM の中身を見る）
  check('F2-self-not-listed', !uSelf.peers.some(t => /MID-360/.test(t) && !/ありません/.test(t)), uSelf.peers);
  const v1 = await waitMark('v1_on', 60000), v2 = await waitMark('v2_on', 60000);
  await page.waitForTimeout(1500);
  const u2 = await E.ui(page);
  check('F3-clients-2', u2.clients === '2 台', { clients: u2.clients, v1, v2 });
  const res0 = await E.mainRes(app);
  // 間引き 1/4
  await page.selectOption('#liveShareStep', '4');
  mark('step4');
  await waitMark('v1_step', 30000); await waitMark('v2_step', 30000);
  await page.selectOption('#liveShareStep', '1');
  await page.waitForTimeout(2000);

  // 遅い回線（v1 への向き）: 4 Mbit/s・100 ms
  H.shq(`ip netns exec ${SW} tc qdisc add dev ${HV1} root netem rate 4mbit delay 100ms limit 200`);
  info('F5-netem', H.shq(`ip netns exec ${SW} tc qdisc show dev ${HV1}`).trim());
  const mem = [];
  for (let i = 0; i < 20; i++) { mem.push((await E.mainRes(app)).rss); await sleep(1000); }
  const res1 = await E.mainRes(app);
  info('F5-host-main-mem-slow-viewer', { before: res0.rss, during: mem, after: res1 });
  A.send('pause'); const tPause = Date.now(); mark('paused', { t: tPause });
  const l1 = await waitMark('v1_lag', 120000), l2 = await waitMark('v2_lag', 60000);
  check('F5-slow-viewer-lag', l1 && l1.lagMs < 5000, { v1_slow: l1, v2_fast: l2, note: '点が止まってから、遅い回線の見る側で 0 点/秒になるまでの時間（＝表示の遅れ）' });
  H.shq(`ip netns exec ${SW} tc qdisc del dev ${HV1} root`);
  A.send('resume'); await sleep(2000);

  // 配信をやめる → 見る側は終わる
  await page.uncheck('#liveShare'); mark('unshared');
  await waitMark('v1_unshared', 30000); await waitMark('v2_unshared', 30000);
  await page.waitForTimeout(500);
  await page.check('#liveShare'); mark('reshared');
  await waitMark('v1_on2', 60000); await waitMark('v2_on2', 60000);
  await page.waitForTimeout(1500);
  info('F6-clients-after-reshare', (await E.ui(page)).clients);

  // 配信元の線が抜ける（LAN ケーブルを抜いた・Wi-Fi が切れた）
  H.shq(`ip netns exec ${SW} ip link set ${HHOST} down`); mark('hostdown');
  await waitMark('v1_down', 60000); await waitMark('v2_down', 60000);
  const uDown = await E.ui(page);
  info('F7-host-side-while-link-down', { clients: uDown.clients, note: '線が抜けている間、配信元は見る側がまだいると思っている（台数）' });
  H.shq(`ip netns exec ${SW} ip link set ${HHOST} up`); mark('hostup');
  await sleep(3000);
  info('F7-host-clients-after-up', (await E.ui(page)).clients);

  // 配信元のアプリを閉じる
  check('F9-host-no-errors', errors.length === 0, errors);
  await app.close(); mark('hostquit');
  await waitMark('v1_quit', 60000); await waitMark('v2_quit', 60000);
  H.save('share_host');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); H.mark('hostfatal', { e: e.message }); await H.cleanup(); process.exit(1); });
