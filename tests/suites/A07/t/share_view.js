// share_view.js <v1|v2> — 見る側。share.sh から起動する（v1=a07u3、v2=a07u5）
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info, sleep, mark, waitMark } = H;
const me = process.argv[2] || 'v1';
const rateNum = u => +String(u.rate).replace(/[^\d]/g, '');

(async () => {
  const { app, page, errors } = await E.launch('view-' + me);
  await E.openLive(page);
  await waitMark('sharing', 90000);
  const u0 = await E.waitUi(page, u => u.peers.some(t => /MID-360/.test(t) && !/ありません/.test(t)), 15000);
  info(`F1-${me}-peer-listed`, u0 && u0.peers);
  await page.click('#livePeers li button');
  const u1 = await E.waitUi(page, u => u.now && rateNum(u) > 0, 15000, 200);
  check(`F1-${me}-viewing`, !!u1, u1 && { src: u1.src, rate: u1.rate, shareBox: u1.shareBox });
  await page.waitForTimeout(2000);
  const r1 = rateNum(await E.ui(page));
  mark(me + '_on', { rate: r1 });
  await waitMark('step4', 60000); await page.waitForTimeout(3500);
  const r4 = rateNum(await E.ui(page));
  check(`F4-${me}-step-quarter`, r4 > r1 * 0.18 && r4 < r1 * 0.32, { before: r1, after: r4 });
  mark(me + '_step', { rate: r4 });
  const p = await waitMark('paused', 120000);
  let lagMs = null; const t0 = Date.now();
  while (Date.now() - t0 < 90000) { const u = await E.ui(page); if (rateNum(u) === 0) { lagMs = Date.now() - p.t - 1000; break; } await sleep(200); }
  mark(me + '_lag', { lagMs });
  await waitMark('unshared', 120000);
  const uU = await E.waitUi(page, u => !u.now, 8000, 200);
  const m = await E.msgs(page);
  check(`F6-${me}-ends-when-unshared`, !!uU, { msgs: m.map(x => x.text).slice(-4), ui: uU && { now: uU.now, msg: uU.msg } });
  mark(me + '_unshared');
  await waitMark('reshared', 60000);
  const uR = await E.waitUi(page, u => u.peers.some(t => /MID-360/.test(t) && !/ありません/.test(t)), 15000);
  if (uR) { await page.click('#livePeers li button'); await E.waitUi(page, u => u.now && rateNum(u) > 0, 15000, 200); }
  mark(me + '_on2', { ok: !!uR });
  await waitMark('hostdown', 120000);
  await sleep(20000);
  const uD = await E.ui(page);
  check(`F7-${me}-notices-host-gone`, !uD.now, { now: uD.now, src: uD.src, rate: uD.rate, dot: uD.dot, msg: uD.msg, peersInList: uD.peers, note: '配信元の線が抜けて 20 秒。表示中のまま 0 点/秒で、知らせもないか' });
  mark(me + '_down', { now: uD.now, rate: uD.rate });
  await waitMark('hostup', 60000); await sleep(3000);
  const uUp = await E.ui(page);
  info(`F7-${me}-after-host-link-up`, { now: uUp.now, rate: uUp.rate });
  await waitMark('hostquit', 120000);
  const uQ = await E.waitUi(page, u => !u.now, 15000, 200);
  const mq = await E.msgs(page);
  check(`F8-${me}-ends-when-host-quits`, !!uQ, { msgs: mq.map(x => x.text).slice(-4) });
  mark(me + '_quit');
  check(`F9-${me}-no-errors`, errors.length === 0, errors);
  await app.close();
  H.save('share_' + me);
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); H.mark(me + '_fatal', { e: e.message }); await H.cleanup(); process.exit(1); });
