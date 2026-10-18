// A12: 主プロセスのライブ機能（live.js）を Node でそのまま動かす「被害側」
//   node victim.js share   … にせの LiDAR 受信中（mode=lidar）にして配信を始め、配信のポートを出して待つ
//   node victim.js peer    … 配信の知らせ（UDP 47800）を待ち、最初に見つけた配信を受ける（startPeer）
//   node victim.js peerkey <key> … 指定の key の配信を受ける
//   uncaughtException の扱いは Node の既定のまま（＝落ちる）。Electron では「A JavaScript error occurred in the main process」の窓になる
'use strict';
const { Live } = require('/home/claude/pcd-viewer/live.js');
const mode = process.argv[2] || 'share';
const live = new Live();
live.on('log', t => console.log('LOG', t));
let pts = 0, garbage = 0;
live.on('points', b => { pts += b.n; for (let i = 0; i < b.n; i++) if (Math.abs(b.xyz[3 * i]) > 1e6 || !Number.isFinite(b.xyz[3 * i])) garbage++; });
const iv = setInterval(() => console.log(`alive pts=${pts} garbage=${garbage} mode=${live.mode}`), 1000);
// 生き残ったかを見るため、一定時間後に自分で正常終了する（落ちれば終了コードが 0 以外になる）
const runMs = Number(process.env.RUN_MS || 8000);
setTimeout(() => { clearInterval(iv); console.log(`SURVIVED pts=${pts} garbage=${garbage} mode=${live.mode}`); try { live.close(); } catch (e) {} process.exit(0); }, runMs);
(async () => {
  if (mode === 'share') {
    live.mode = 'lidar'; live.source = { kind: 'lidar', sn: 'TEST', ip: '10.112.0.2', model: 'MID-360', hostIp: '10.112.0.1' };
    await live.setShare(true, 1);
    console.log('SHARE_PORT', live.sharer.port);
  } else {
    await live.open();
    const t0 = Date.now();
    while (!live.finder.peers.size && Date.now() - t0 < 10000) await new Promise(r => setTimeout(r, 200));
    const key = process.argv[3] || [...live.finder.peers.keys()][0];
    console.log('PEERS', JSON.stringify(live.state().peers));
    try { const st = await live.startPeer(key); console.log('STARTED', JSON.stringify(st.source), 'mode=', st.mode); }
    catch (e) { console.log('START_ERROR', e.message, '/ その後の状態:', JSON.stringify({ mode: live.mode, source: live.source })); }
  }
})();
