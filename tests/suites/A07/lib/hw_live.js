// hw_live.js — 本物の MID-360 で、アプリの live.js（主プロセスと同じもの）をそのまま動かして確かめる（実験室用、A07）
//   ELECTRON_RUN_AS_NODE=1 <electron> hw_live.js [--live <live.js のパス>] [--secs 10] [--share]
//   ・LiDAR Viewer・livox_ros_driver2・Livox Viewer は閉じておく（同じポートを使うため）
//   ・調べること: 見つかるまでの時間、一覧の中身、設定の返事（時間・ログ）、毎秒の点数、止めたあとも LiDAR が送ってくるか（送り元ごとの数）、
//     LiDAR が 2 台以上あれば A→止める→B で A の箱が混ざるか（A07-001）、配信の待ち受けポート
'use strict';
const args = process.argv.slice(2); const opt = k => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const L = require(opt('--live') || '/home/claude/pcd-viewer/live.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SECS = +(opt('--secs') || 10);
(async () => {
  const R = { when: new Date().toISOString(), platform: process.platform, logs: [] };
  const live = new L.Live(); live.on('log', t => R.logs.push(`${Date.now()} ${t}`));
  let pts = 0; live.on('points', b => { pts += b.n; });
  const t0 = Date.now(); const st0 = await live.open(); R.open = { errors: st0.errors, nets: st0.nets };
  let firstSeen = null; while (Date.now() - t0 < 8000) { const d = live.state().devices; if (d.length && !firstSeen) firstSeen = Date.now() - t0; await sleep(200); }
  R.detectMs = firstSeen; R.devices = live.state().devices;
  if (!R.devices.length) { R.result = '見つかりません'; console.log(JSON.stringify(R, null, 1)); live.close(); process.exit(2); }
  // 56301 に届く箱を送り元ごとに数える（アプリの処理とは別に、同じソケットへ聞き耳を立てる）
  const bySrc = {}; live.lidar.socks.pts.on('message', (m, r) => { const k = `${r.address}:${r.port}`; bySrc[k] = (bySrc[k] || 0) + 1; });
  const count = async ms => { for (const k in bySrc) delete bySrc[k]; await sleep(ms); return { ...bySrc }; };
  const devs = R.devices.filter(d => d.hostIp);
  R.runs = [];
  for (const d of devs.slice(0, 2)) {
    const t1 = Date.now(); const nLog = R.logs.length;
    let err = null; try { await live.startLidar(d.sn); } catch (e) { err = e.message; }
    const startMs = Date.now() - t1; const p0 = pts; await sleep(SECS * 1000);
    R.runs.push({ sn: d.sn, ip: d.ip, startMs, err, logs: R.logs.slice(nLog), ptsPerSec: Math.round((pts - p0) / SECS), stateRate: live.state().rate, stat: live.lidar.stat, sourcesWhileShowing: await count(2000) });
    if (opt('--share')) { const s = await live.setShare(true, 1); R.runs[R.runs.length - 1].share = { sharing: s.sharing, port: live.sharer.port }; await sleep(3000); await live.setShare(false); }
    await live.stopAll();
    R.runs[R.runs.length - 1].sourcesAfterStop = await count(3000); // 止めたあとも送ってくるか
  }
  if (devs.length >= 2) {
    // A を表示→止める→B を表示: 表示中に A の箱が届いていれば A07-001 と同じ
    await live.startLidar(devs[0].sn); await sleep(2000); await live.stopAll();
    await live.startLidar(devs[1].sn); await sleep(1000);
    R.mixCheck = { showing: devs[1].ip, sources: await count(3000), note: '表示中の LiDAR 以外の送り元があれば、その点も混ざって表示される' };
    await live.stopAll();
  }
  live.close();
  console.log(JSON.stringify(R, null, 1));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ fatal: e.stack })); process.exit(1); });
