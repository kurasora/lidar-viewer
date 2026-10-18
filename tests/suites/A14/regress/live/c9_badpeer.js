// （担当外・確認だけ）同じ LAN の誰かが「配信」の知らせを出し、受け手がそれを選ぶと、壊れたデータで主プロセスが落ちるか
//   ip netns exec <ns> node c9_badpeer.js
'use strict';
const dgram = require('node:dgram');
const WebSocket = require('/home/claude/pcd-viewer/node_modules/ws');
const { Live } = require('/home/claude/pcd-viewer/live.js');
process.on('uncaughtException', e => { console.log(JSON.stringify({ uncaughtException: e.message })); process.exit(3); });
(async () => {
  // 悪い送り手: 点数だけ大きい「PCV1」を送る WebSocket サーバと、知らせ（UDP 47800 のブロードキャスト）
  const wss = new WebSocket.Server({ port: 0 }); await new Promise(r => wss.once('listening', r));
  const port = wss.address().port;
  wss.on('connection', ws => { const b = Buffer.alloc(16); b.write('PCV1', 0, 'latin1'); b.writeUInt32LE(0x40000000, 4); ws.send(b); });
  const beacon = dgram.createSocket({ type: 'udp4', reuseAddr: true }); await new Promise(r => beacon.bind(0, r)); beacon.setBroadcast(true);
  const live = new Live(); live.on('log', t => console.log(JSON.stringify({ log: t })));
  await live.open();
  const msg = Buffer.from(JSON.stringify({ app: 'pcd-viewer', v: 1, name: '<b>evil</b>', port, model: 'MID-360', sn: 'x', id: 'evil' }));
  for (let i = 0; i < 3; i++) { beacon.send(msg, 47800, '127.255.255.255'); beacon.send(msg, 47800, '255.255.255.255'); await new Promise(r => setTimeout(r, 300)); }
  const peers = live.state().peers; console.log(JSON.stringify({ peers }));
  if (!peers.length) { console.log('no peer'); process.exit(2); }
  await live.startPeer(peers[0].key);
  await new Promise(r => setTimeout(r, 1500));
  console.log(JSON.stringify({ survived: true, mode: live.mode }));
  process.exit(0);
})();
