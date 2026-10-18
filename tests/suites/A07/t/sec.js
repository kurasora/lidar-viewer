// sec.js — 脅威の再現（主プロセス側）。配信元/見る側 = この PC（a072、enode）、LiDAR = a071、攻撃側 = a075
//   MEM=2500 light ip netns exec a072 lib/enode t/sec.js [part...]
'use strict';
const H = require('../lib/h.js');
const { check, info, sleep } = H;
const L = require(H.LIVEJS);
const path = require('node:path');
const ATK = path.join(H.W, 'lib', 'attacker.js');
const uncaught = []; process.on('uncaughtException', e => { uncaught.push(String(e.message)); });
const atk = o => H.spawnJson('a075', 'node', [ATK, JSON.stringify(o)], { name: 'atk-' + o.mode });
const mem = () => { const m = process.memoryUsage(); return { rss: Math.round(m.rss / 1048576), ab: Math.round(m.arrayBuffers / 1048576), heap: Math.round(m.heapUsed / 1048576) }; };
// 主プロセスの止まり具合（100 ms ごとのタイマーの遅れの最大）
let lagMax = 0; { let last = Date.now(); setInterval(() => { const now = Date.now(); lagMax = Math.max(lagMax, now - last - 100); last = now; }, 100).unref(); }
const parts = process.argv.slice(2);
const want = p => !parts.length || parts.includes(p);

async function sharerUp() {
  const live = new L.Live(); await live.open();
  let dev = null; const t = Date.now(); while (Date.now() - t < 6000 && !(dev = live.state().devices[0])) await sleep(100);
  await live.startLidar(dev.sn); await live.setShare(true, 1);
  return live;
}
async function watchMem(ms) { let peak = mem(); const t = Date.now(); while (Date.now() - t < ms) { const m = mem(); if (m.rss > peak.rss) peak = m; await sleep(250); } return peak; }

(async () => {
  const A = H.sim('a071', { ip: '10.107.0.1', sn: 'SECLIDAR000001', reply: 'broadcast', pattern: 'grid', rate: 200000 });
  await A.waitFor(e => e.ev === 'ready');

  if (want('bigmsg')) {
    const live = await sharerUp(); const target = `ws://10.107.0.2:${live.sharer.port}`;
    await sleep(1500); const m0 = mem(); lagMax = 0;
    const a = atk({ mode: 'bigmsg', target, conns: 4, mb: 90, count: 2, gapMs: 3000, holdMs: 3000 });
    const peak = await watchMem(12000);
    await a.waitFor(e => e.ev === 'done', 10000);
    check('I1-bigmsg-memory', peak.rss - m0.rss < 200, { before: m0, peak, lagMaxMs: lagMax, clients: live.state().shareClients, atk: a.ev.filter(e => e.ev !== 'sent').slice(0, 6), note: '認証なしの相手が 90 MB のメッセージを 4 本同時に送ると、配信元の主プロセスがどれだけ膨らむか（ws の maxPayload 既定 100 MiB）' });
    await a.kill(); live.close(); await sleep(1000);
  }
  if (want('slowframe')) {
    const live = await sharerUp(); const target = `ws://10.107.0.2:${live.sharer.port}`;
    await sleep(1500); const m0 = mem();
    const a = atk({ mode: 'slowframe', target, conns: 6, mb: 90, chunkKb: 1024, gapMs: 100, secs: 18, holdMs: 4000 });
    const peak = await watchMem(24000);
    check('I2-slowframe-memory', peak.rss - m0.rss < 200, { before: m0, peak, atk: a.last('done'), note: '長さだけ申告して少しずつ送るフレーム（完成するまで ws がためる・時間切れなし）' });
    await a.kill(); live.close(); await sleep(1000);
  }
  if (want('stuck')) {
    const live = await sharerUp(); const target = `ws://10.107.0.2:${live.sharer.port}`;
    await sleep(1500); const m0 = mem();
    const a = atk({ mode: 'stuck', target, conns: 16, staggerMs: 2500, holdMs: 15000 });
    const peak = await watchMem(55000);
    check('I3-stuck-clients-memory', peak.rss - m0.rss < 100, { before: m0, peak, clients: live.state().shareClients, note: '受け取らない相手 16 台（時間をずらして止まる）。1 台あたり最大 8 MB（bufferedAmount の上限）＋α をためる' });
    await a.kill(); live.close(); await sleep(1000);
  }
  if (want('hold')) {
    const live = await sharerUp(); const target = `ws://10.107.0.2:${live.sharer.port}`;
    await sleep(1500); const m0 = mem(); lagMax = 0;
    const a = atk({ mode: 'hold', target, conns: 300, holdMs: 15000 });
    await a.waitFor(e => e.ev === 'open', 30000);
    lagMax = 0; const peak = await watchMem(8000);
    info('I4-many-clients', { clients: live.state().shareClients, before: m0, peak, lagMaxMs: lagMax, note: 'つなぐ数に上限がない（300 台）' });
    await a.kill(); live.close(); await sleep(1000);
  }
  if (want('beacons')) {
    const live = new L.Live(); await live.open(); let nState = 0; live.on('state', () => nState++);
    await sleep(500); lagMax = 0; const m0 = mem();
    const a = atk({ mode: 'beacons', bcast: '10.107.0.255', n: 8000, perSec: 4000 });
    await a.waitFor(e => e.ev === 'done', 30000); await sleep(1000);
    const peers = live.state().peers.length;
    check('I5-beacon-flood', peers < 100, { peers, stateEvents: nState, lagMaxMs: lagMax, mem0: m0, mem1: mem(), note: '偽の配信の知らせ 8,000 件（1 件ごとに画面へ一覧全体を送る）' });
    await sleep(5500); info('I5-beacon-flood-expire', { peersAfter5s: live.state().peers.length });
    live.close(); await a.kill(); await sleep(500);
  }
  if (want('acks')) {
    const live = new L.Live(); await live.open(); let nState = 0; live.on('state', () => nState++);
    await sleep(500); lagMax = 0;
    const a = atk({ mode: 'acks', bcast: '10.107.0.255', n: 8000, perSec: 4000 });
    await a.waitFor(e => e.ev === 'done', 30000); await sleep(1000);
    const devs = live.state().devices.length;
    check('I6-detect-ack-flood', devs < 100, { devices: devs, stateEvents: nState, lagMaxMs: lagMax, note: 'こちらが探していなくても、誰からの「検出の返事」でも一覧に足す（SN ごと）' });
    live.close(); await a.kill(); await sleep(500);
  }
  if (want('peer')) {
    for (const kind of ['nbig', 'nan', 'junk']) {
      const live = new L.Live(); await live.open(); const logs = []; live.on('log', t => logs.push(t));
      let got = 0, nanPts = 0; live.on('points', b => { got += b.n; for (let i = 0; i < b.n * 3; i++) if (Number.isNaN(b.xyz[i])) { nanPts++; break; } });
      const a = atk({ mode: 'peer', bcast: '10.107.0.255', name: 'lab-pc', kind, every: 300, max: 5, secs: 15 });
      await a.waitFor(e => e.ev === 'ready', 5000);
      let p = null; const t = Date.now(); while (Date.now() - t < 5000 && !(p = live.state().peers[0])) await sleep(100);
      const u0 = uncaught.length;
      await live.startPeer(p.key); await sleep(2500);
      check(`I7-malicious-peer-${kind}`, uncaught.length === u0, { uncaughtNew: uncaught.slice(u0), points: got, nanBatches: nanPts, logs, peer: p, note: 'Electron の主プロセスでは、捕まえていない例外ごとにエラーの窓が出る' });
      live.close(); await a.kill(); await sleep(500);
    }
  }
  H.save('sec' + (parts.length ? '_' + parts.join('_') : ''));
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
