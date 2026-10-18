// 「同じネットワークのパソコンに配信する」を素早く 3 回押したとき（入→切→入→（2 秒後）切）
//   配信をやめたあとも知らせ（UDP 47800）が出続けないか・サーバが残らないか
//   ip netns exec a14i2 node c9_share_mash.js   （a14i1 で にせ LiDAR）
'use strict';
const dgram = require('node:dgram');
const { Live } = require('/home/claude/pcd-viewer/live.js');
process.on('unhandledRejection', e => console.log(JSON.stringify({ unhandledRejection: e && e.message })));
(async () => {
  const live = new Live(); live.on('log', t => console.log(JSON.stringify({ log: t })));
  await live.open();
  await new Promise(r => setTimeout(r, 2500));
  const d = live.state().devices[0]; if (!d) { console.log('no device'); process.exit(2); }
  await live.startLidar(d.sn);
  // 素早く 3 回（画面の checkbox の change が続けて来たときと同じ: true, false, true）
  const wrap = (pr, i) => Promise.race([pr.then(v => 'ok', e => 'rejected: ' + e.message), new Promise(r => setTimeout(() => r('pending (5 秒たっても終わらない)'), 5000))]).then(s => `${i}: ${s}`);
  const res = await Promise.all([live.setShare(true, 1), live.setShare(false, 1), live.setShare(true, 1)].map(wrap));
  console.log(JSON.stringify({ results: res, sharingNow: live.state().sharing }));
  await new Promise(r => setTimeout(r, 2000));
  await live.setShare(false, 1);
  console.log(JSON.stringify({ afterOff: { sharing: live.state().sharing, server: !!live.sharer.server, beacon: !!live.sharer.beacon, timer: !!live.sharer.timer } }));
  // 配信をやめたあと 4 秒間、知らせが届くか（別のソケットで 47800 を聞く。reuseAddr）
  const s = dgram.createSocket({ type: 'udp4', reuseAddr: true }); let n = 0, ports = new Set();
  s.on('message', m => { try { const j = JSON.parse(m); if (j.app === 'pcd-viewer') { n++; ports.add(j.port); } } catch (e) { } });
  await new Promise(r => s.bind(47800, r));
  await new Promise(r => setTimeout(r, 4000));
  console.log(JSON.stringify({ beaconsAfterOff: n, ports: [...ports] }));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
