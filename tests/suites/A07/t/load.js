// load.js — 主プロセスの受信の負荷（毎秒 20 万・50 万・100 万点）。取りこぼし・CPU・止まり。enode で a072 の中で実行（LiDAR=a071）
//   ※ このマシンは 2 CPU で、にせ LiDAR も同じ CPU を使う。ほかの担当の試験が動いていると数字が下がる（試験環境の制約）
'use strict';
const H = require('../lib/h.js');
const { check, info, sleep, ns, ip } = H;
const L = require(H.LIVEJS);
let lagMax = 0; { let last = Date.now(); setInterval(() => { const now = Date.now(); lagMax = Math.max(lagMax, now - last - 100); last = now; }, 100).unref(); }

(async () => {
  const A = H.sim(ns(1), { ip: ip(1), sn: 'LOADLIDAR00001', reply: 'broadcast', pattern: 'grid', rate: 200000 });
  await A.waitFor(e => e.ev === 'ready');
  const live = new L.Live(); await live.open();
  let dev = null; const t = Date.now(); while (Date.now() - t < 6000 && !(dev = live.state().devices[0])) await sleep(100);
  let pts = 0, maxBatch = 0; live.on('points', b => { pts += b.n; if (b.n > maxBatch) maxBatch = b.n; });
  await live.startLidar(dev.sn);
  const rows = [];
  for (const rate of [200000, 500000, 1000000]) {
    A.send('rate ' + rate); await sleep(2500);
    const s0 = A.last('stats'), p0 = pts, c0 = process.cpuUsage(), t0 = Date.now(); lagMax = 0; maxBatch = 0;
    await sleep(5000);
    await sleep(1100); const s1 = A.last('stats');
    const dt = (Date.now() - t0) / 1000, cpu = process.cpuUsage(c0);
    const sent = (s1.sentPts - s0.sentPts), got = pts - p0;
    const r = { target: rate, simSentPerSec: Math.round(sent / dt), appGotPerSec: Math.round(got / dt), lossPct: +(100 * (1 - got / Math.max(1, sent))).toFixed(2), mainCpuPct: Math.round((cpu.user + cpu.system) / 1e4 / dt), lagMaxMs: lagMax, maxBatchPts: maxBatch, ipcMBperSec: +(got * 13 / dt / 1e6).toFixed(1) };
    rows.push(r); info('E2-load-' + rate, r);
  }
  check('E2-loss-at-200k', rows[0].lossPct < 1, rows[0]);
  info('E2-rcvbuf', { note: 'live.js は受信バッファ（SO_RCVBUF）を指定しない（Linux の既定 208 KB ≒ 毎秒 100 万点で約 15 ms 分）。SDK2 は 200 MB を要求する', rmem_default: H.shq('cat /proc/sys/net/core/rmem_default').trim(), rmem_max: H.shq('cat /proc/sys/net/core/rmem_max').trim() });
  live.close();
  H.save('load');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
