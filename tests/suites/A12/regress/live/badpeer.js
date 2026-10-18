// A12（堅牢性試験）: 同じ LAN にいる「壊れたデータを送ってくる相手」を真似て、live.js が
//   その入力をちゃんと捌けるか（＝主プロセスが落ちないか）を確かめる。
//   これは実際の運用でも起こりうる: ポート 47800 に別のアプリのブロードキャストが流れる、
//   配信元が途中で異常終了する、版の違う相手が少し違う形の WebSocket メッセージを送る、など。
//   node badpeer.js beacon          … 47800 に、ポート番号が変な配信の知らせを流す（peer 一覧に出るか）
//   node badpeer.js wsserver        … LiDAR Viewer の受け手がつなぐ WebSocket サーバーを立て、
//                                      PCV1 の点数(n)だけ巨大で中身が短いメッセージを送る（受け手が落ちるか）
'use strict';
const dgram = require('node:dgram');
const os = require('node:os');
const WebSocket = require('/home/claude/pcd-viewer/node_modules/ws');
const BEACON_PORT = 47800;
const mode = process.argv[2] || 'beacon';

function broadcasts() {
  const out = ['255.255.255.255'];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if ((a.family === 'IPv4' || a.family === 4) && !a.internal) {
      const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
      out.push(ip.map((o, i) => (o & mask[i]) | (~mask[i] & 255)).join('.'));
    }
  }
  return [...new Set(out)];
}

if (mode === 'wsserver') {
  // 受け手（LiDAR Viewer）がつなぎに来るサーバー。知らせも流して見つけてもらう
  const server = new WebSocket.Server({ port: 0 });
  server.on('listening', () => {
    const port = server.address().port;
    console.log('WS_PORT', port);
    const beacon = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    beacon.bind(0, () => {
      beacon.setBroadcast(true);
      const msg = Buffer.from(JSON.stringify({ app: 'pcd-viewer', v: 1, name: 'badpeer', port, model: 'MID-360', sn: 'BAD', id: 'bad' + Math.random().toString(36).slice(2) }));
      setInterval(() => { for (const t of broadcasts()) beacon.send(msg, BEACON_PORT, t, () => {}); }, 1000);
    });
  });
  server.on('connection', ws => {
    console.log('受け手がつながりました。壊れたメッセージを送ります');
    // (1) PCV1 の点数 n を巨大に、中身は 8 バイトだけ（decodeBatch が範囲外を読む）
    const b1 = Buffer.alloc(8); b1.write('PCV1', 0, 'latin1'); b1.writeUInt32LE(0x7fffffff, 4); ws.send(b1);
    // (2) n を中くらい（100 万点）に、中身は短い
    const b2 = Buffer.alloc(8 + 100); b2.write('PCV1', 0, 'latin1'); b2.writeUInt32LE(1000000, 4); ws.send(b2);
    // (3) 印が違うメッセージ（decodeBatch は null を返す想定）
    ws.send(Buffer.from('XXXXabcd'));
    // (4) 短すぎるメッセージ
    ws.send(Buffer.from([0x50]));
  });
} else {
  // 配信の知らせだけを流す（ポート番号が 0・巨大・なし など）
  const beacon = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  beacon.bind(0, () => {
    beacon.setBroadcast(true);
    const variants = [
      { app: 'pcd-viewer', v: 1, name: 'p0', port: 0, model: 'X', sn: 'A', id: 'v0' },
      { app: 'pcd-viewer', v: 1, name: 'pbig', port: 999999, model: 'X', sn: 'B', id: 'v1' },
      { app: 'pcd-viewer', v: 1, name: 'pstr', port: '70000', model: 'X', sn: 'C', id: 'v2' },
      { app: 'pcd-viewer', name: 'noport', id: 'v3' },
    ];
    setInterval(() => { for (const v of variants) for (const t of broadcasts()) beacon.send(Buffer.from(JSON.stringify(v)), BEACON_PORT, t, () => {}); }, 500);
    console.log('知らせを流しています');
  });
}
