// にせの「配信しているパソコン」の知らせ（UDP 47800 のブロードキャスト）を出し続ける
//   node fake_peer.js <ブロードキャスト先> <名前> <WebSocket のポート> [機種] [SN]
//   ポートに何も待ち受けていなければ、受け手がつなぐと失敗する（知らせの文言の確認用）
const dgram = require('node:dgram');
const [bc = '10.106.0.255', name = 'robot-pc', port = '9', model = 'MID-360', sn = '47MDL9T0020193'] = process.argv.slice(2);
const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
s.bind(0, () => {
  s.setBroadcast(true);
  const send = () => s.send(Buffer.from(JSON.stringify({ app: 'pcd-viewer', v: 1, name, port: +port, model, sn, id: 'fakepeer-' + name })), 47800, bc, () => {});
  send(); setInterval(send, 1000);
});
