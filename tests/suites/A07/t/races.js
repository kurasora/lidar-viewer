// races.js — 状態遷移の繰り返しと、重なった操作（2 回押す・待っている間にほかを押す）。主プロセスの資源を数える
//   light ip netns exec a072 lib/enode t/races.js   （LiDAR A=a071 返事あり、C=a074 返事なし、にせ配信元=a075）
'use strict';
const H = require('../lib/h.js');
const { check, info, sleep, ns, ip } = H;
const L = require(H.LIVEJS);
const path = require('node:path');
const ATK = path.join(H.W, 'lib', 'attacker.js');
const uncaught = []; process.on('uncaughtException', e => { uncaught.push(String(e.stack || e)); });
const unhandled = []; process.on('unhandledRejection', e => { unhandled.push(String(e && e.stack || e)); });
const res = () => { const r = process.getActiveResourcesInfo(); const k = {}; for (const x of r) k[x] = (k[x] || 0) + 1; return k; };
// 結果を待つ（ms 以内に返らなければ hang）。待ちのタイマーは必ず消す（資源の数え間違いを防ぐ）
const settle = (p, ms = 6000) => { let tm; return Promise.race([p.then(v => ({ ok: true, v }), e => ({ ok: false, err: String(e.message || e) })), new Promise(r => { tm = setTimeout(() => r({ hang: true }), ms); })]).finally(() => clearTimeout(tm)); };
async function waitDev(live, sn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { const d = live.state().devices.find(x => x.sn === sn); if (d) return d; await sleep(100); } return null; }
async function waitPeer(live, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { const p = live.state().peers[0]; if (p) return p; await sleep(100); } return null; }

(async () => {
  const A = H.sim(ns(1), { ip: ip(1), sn: 'RACEA000000001', reply: 'broadcast', pattern: 'grid', rate: 50000 });
  const C = H.sim(ns(4), { ip: ip(4), sn: 'RACENOACK00001', reply: 'broadcast', ack: false, pattern: 'ring', rate: 20000 });
  const P = H.spawnJson(ns(5), 'node', [ATK, JSON.stringify({ mode: 'peer', bcast: H.bcast(), name: 'peer-pc', kind: 'good', every: 50, secs: 600 })], { name: 'peer' });
  await A.waitFor(e => e.ev === 'ready'); await C.waitFor(e => e.ev === 'ready'); await P.waitFor(e => e.ev === 'ready');
  const r0 = res();
  const live = new L.Live(); const logs = []; live.on('log', t => logs.push(t));
  await live.open();
  const dA = await waitDev(live, 'RACEA000000001'), dC = await waitDev(live, 'RACENOACK00001'), peer = await waitPeer(live);
  check('B1-setup', dA && dC && peer, { dA: !!dA, dC: !!dC, peer });
  await sleep(500);
  const r1 = res();
  info('B1-resources-after-open', { before: r0, afterOpen: r1 });

  // ---- 繰り返し（LiDAR 表示→配信 ON→配信 OFF→止める→配信を見る→止める）× 30
  const snaps = [];
  for (let i = 0; i < 30; i++) {
    await live.startLidar(dA.sn);
    await live.setShare(true, 2);
    await sleep(150);
    await live.setShare(false);
    await live.stopAll();
    await live.startPeer(peer.key);
    await sleep(250);
    await live.stopAll();
    await sleep(50);
    if (i % 10 === 9) { await sleep(800); snaps.push({ i: i + 1, res: res(), listeners: { live: live.eventNames().map(n => `${n}:${live.listenerCount(n)}`), lidar: live.lidar.eventNames().map(n => `${n}:${live.lidar.listenerCount(n)}`) }, rss: Math.round(process.memoryUsage().rss / 1048576) }); }
  }
  const same = JSON.stringify(snaps[0].res) === JSON.stringify(snaps[snaps.length - 1].res);
  check('B2-no-leak-30-cycles', same && JSON.stringify(snaps[snaps.length - 1].res) === JSON.stringify(r1), { afterOpen: r1, snaps });

  // ---- 2 回続けて押す（同じ LiDAR）
  logs.length = 0;
  const [x1, x2] = await Promise.all([settle(live.startLidar(dA.sn)), settle(live.startLidar(dA.sn))]);
  await sleep(300);
  info('B3-double-start', { x1: x1.ok, x2: x2.ok, mode: live.state().mode, res: res(), logs });
  await live.stopAll(); await sleep(300);
  check('B3-double-start-no-leak', JSON.stringify(res()) === JSON.stringify(r1), { now: res(), afterOpen: r1 });

  // ---- 返事のない LiDAR（C）を押して、待っている間（3 秒）に A を押す
  logs.length = 0;
  const pC = settle(live.startLidar(dC.sn), 8000); await sleep(600);
  const pA = settle(live.startLidar(dA.sn), 8000);
  const [rC, rA] = await Promise.all([pC, pA]);
  await sleep(1500);
  const cStats = C.last('stats');
  info('B4-noack-then-other', { rC: rC.ok ? rC.v.source : rC, rA: rA.ok ? rA.v.source : rA, finalSource: live.state().source, cIsSendingToUs: cStats && cStats.host, logs, note: '最後に押した A が表示されるべき。C にも設定の命令が届き、C も送り続ける（A07-001 と同じ混ざり）' });
  await live.stopAll(); await sleep(300);

  // ---- 返事のない LiDAR（C）を押して、待っている間に配信を見る（startPeer）
  logs.length = 0;
  const qC = settle(live.startLidar(dC.sn), 8000); await sleep(600);
  const qP = settle(live.startPeer(peer.key), 8000);
  const [sC, sP] = await Promise.all([qC, qP]);
  await sleep(500);
  const st = live.state();
  check('B5-noack-then-peer-consistent', st.mode === 'peer' && st.source && st.source.kind === 'peer' && (sC.ok || !/null/.test(sC.err)), { startLidar: sC.ok ? 'ok' : sC.err, startPeer: sP.ok ? 'ok' : sP.err, mode: st.mode, source: st.source, wsOpen: !!live.ws, logs });
  // この状態で配信 ON を押すと？
  const sh = await settle(live.setShare(true, 1));
  info('B5-share-in-broken-state', { result: sh.ok ? { sharing: sh.v.sharing } : sh, note: 'mode が lidar・source が null のまま配信を始めようとする' });
  await live.stopAll(); await live.setShare(false); await sleep(500);

  // ---- 配信 ON と「止める」を同時に
  await live.startLidar(dA.sn);
  const pS = settle(live.setShare(true, 1), 5000);
  const pStop = settle(live.stopAll(), 5000);
  const [rs, rstop] = await Promise.all([pS, pStop]);
  await sleep(500);
  check('B6-share-and-stop-race', !rs.hang && !rstop.hang && !live.sharer.server && !live.sharer.beacon, { share: rs.ok ? 'ok' : (rs.hang ? 'HANG（返事が来ない）' : rs.err), stop: rstop.ok ? 'ok' : rstop, serverLeft: !!live.sharer.server, beaconLeft: !!live.sharer.beacon, res: res() });
  await live.stopAll(); await live.setShare(false); await sleep(500);
  info('B6-resources-after', { res: res(), afterOpen: r1 });

  // ---- 配信を見ている途中で別の配信元を押す/LiDAR を押す（にせログが出ないか）
  logs.length = 0;
  await live.startPeer(peer.key); await sleep(20); await live.startLidar(dA.sn); await sleep(500);
  info('B7-peer-then-lidar-logs', { logs });
  logs.length = 0;
  await live.stopAll();
  const pp = live.startPeer(peer.key); await live.stopAll(); await pp; await sleep(500);
  info('B7-peer-connecting-then-stop-logs', { logs, note: 'つなぎかけで止めると「配信につながりません（…closed before the connection was established）」が出るか' });

  // ---- 閉じたあと
  live.close(); await sleep(800);
  const rEnd = res();
  check('B8-close-releases-all', !Object.keys(rEnd).some(k => /UDP|TCP/.test(k)), { rEnd, before: r0 });
  check('B9-no-uncaught', uncaught.length === 0 && unhandled.length === 0, { uncaught, unhandled });
  H.save('races');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
