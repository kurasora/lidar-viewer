// 試験用の「にせの MID-360」: 本物と同じ通信手順で、検出に答え、設定を受け付け、点群の箱を送る
//   node tools/fake_mid360.js [自分の IP] [SN]
//   点群は前回の廊下の地図から、軌跡に沿って動くセンサーで見える点を選んで作る（毎秒 20 万点、96 点ずつの箱）
'use strict';
const dgram = require('node:dgram');
const fs = require('node:fs');
const path = require('node:path');
const { packCmd, parseCmd, kvList, PORT, CMD, KEY } = require('../live.js');

const MY_IP = process.argv[2] || '192.168.1.160';
const SN = (process.argv[3] || '47MDL9T0020193').padEnd(16, '\0').slice(0, 16);
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '../sample/map.json'), 'utf8'));
const q = new Uint16Array(Buffer.from(d.b64, 'base64').buffer.slice(0));
const inten = Buffer.from(d.b64i, 'base64');
const N = d.n, P = new Float32Array(N * 3);
for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) P[3 * i + k] = d.lo[k] + d.sc[k] * q[3 * i + k];
const traj = fs.readFileSync(path.join(__dirname, '../sample/trajectory.txt'), 'utf8').split('\n').filter(l => /^\d/.test(l)).map(l => l.split(/\s+/).map(Number));

let host = null; // { ip, port }
const reply = (sock, req, data, to) => sock.send(packCmd(req.cmd, data, 1, 1, req.seq), to.port, to.address); // 返事の番号は命令と同じ
const det = dgram.createSocket({ type: 'udp4', reuseAddr: true });
det.on('message', (m, r) => {
  const p = parseCmd(m);
  if (!p || p.cmd !== CMD.search || p.type !== 0) return;
  const data = Buffer.alloc(24); data[0] = 0; data[1] = 9; Buffer.from(SN, 'latin1').copy(data, 2);
  Buffer.from(MY_IP.split('.').map(Number)).copy(data, 18); data.writeUInt16LE(PORT.lidarCmd, 22);
  reply(det, p, data, r);
});
det.bind(PORT.detect, MY_IP === '0.0.0.0' ? undefined : undefined, () => { det.setBroadcast(true); });
let work = 0x01, pcl = 1; // 動作モード（0x01 送る・0x02 待機）と点の形式
const cmd = dgram.createSocket({ type: 'udp4', reuseAddr: true });
cmd.on('message', (m, r) => {
  const p = parseCmd(m);
  if (!p || p.type !== 0) return;
  if (p.cmd === CMD.getInternalInfo) { // 設定の問い合わせ（0x0101）: ret(1) 数(2) + [項目 長さ 値]
    const n = p.data.readUInt16LE(0), items = [];
    for (let i = 0; i < n && 4 + 2 * i + 2 <= p.data.length; i++) {
      const k = p.data.readUInt16LE(4 + 2 * i);
      if (k === KEY.pointDataHostIp) { const v = Buffer.alloc(8); if (host) { Buffer.from(host.ip.split('.').map(Number)).copy(v, 0); v.writeUInt16LE(host.port, 4); v.writeUInt16LE(host.src || PORT.lidarPoint, 6); } items.push([k, v]); }
      else if (k === KEY.workMode) items.push([k, Buffer.from([work])]);
      else if (k === KEY.pclDataType) items.push([k, Buffer.from([pcl])]);
    }
    const kv = kvList(items); // 数(2) 予備(2) + … → 返事は ret(1) 数(2) + …
    reply(cmd, p, Buffer.concat([Buffer.from([0]), kv.subarray(0, 2), kv.subarray(4)]), r);
    return;
  }
  if (p.cmd !== CMD.workModeControl) return;
  const n = p.data.readUInt16LE(0);
  let o = 4;
  for (let i = 0; i < n; i++) {
    const k = p.data.readUInt16LE(o), len = p.data.readUInt16LE(o + 2), v = p.data.subarray(o + 4, o + 4 + len);
    if (k === KEY.pointDataHostIp) { host = { ip: [...v.subarray(0, 4)].join('.'), port: v.readUInt16LE(4), src: v.readUInt16LE(6) }; console.log('点群の送り先:', host); }
    if (k === KEY.workMode) { work = v[0]; console.log('動作モード:', work === 1 ? '送る' : work === 2 ? '待機' : work); }
    if (k === KEY.pclDataType) pcl = v[0];
    o += 4 + len;
  }
  const ack = Buffer.alloc(3); reply(cmd, p, ack, r);
});
cmd.bind(PORT.lidarCmd);
const pts = dgram.createSocket('udp4');
pts.bind(PORT.lidarPoint);

// 送る点を作る
let t = 0, ti = 0, pool = null, poolAt = null, frame = 0, udp = 0;
function pose() { const r = traj[Math.min(traj.length - 1, ti)]; return [r[1], r[2], r[3] + 0.4]; }
setInterval(() => { ti = (ti + 1) % traj.length; }, 100); // 軌跡を 10 倍速で進む
function refreshPool(c) {
  const idx = [];
  for (let i = 0; i < N; i++) { const dx = P[3 * i] - c[0], dy = P[3 * i + 1] - c[1]; if (dx * dx + dy * dy < 30 * 30) idx.push(i); }
  pool = Uint32Array.from(idx); poolAt = c;
}
setInterval(() => {
  if (!host || work !== 0x01) return; // 待機中は送らない
  const c = pose();
  if (!poolAt || Math.hypot(c[0] - poolAt[0], c[1] - poolAt[1]) > 2) refreshPool(c);
  if (!pool.length) return;
  // 10 ms ごとに 2,000 点（毎秒 20 万点）= 96 点の箱を約 21 個
  for (let b = 0; b < 21; b++) {
    const buf = Buffer.alloc(36 + 96 * 14);
    buf[0] = 0; buf.writeUInt16LE(buf.length, 1); buf.writeUInt16LE(50, 3); buf.writeUInt16LE(96, 5); buf.writeUInt16LE(udp++ & 0xffff, 7);
    buf[9] = frame & 255; buf[10] = 1; buf[11] = 0;
    buf.writeBigUInt64LE(BigInt(Date.now()) * 1000000n, 28);
    for (let i = 0; i < 96; i++) {
      const j = pool[(Math.random() * pool.length) | 0];
      const o = 36 + 14 * i;
      buf.writeInt32LE(Math.round((P[3 * j] - c[0]) * 1000), o);
      buf.writeInt32LE(Math.round((P[3 * j + 1] - c[1]) * 1000), o + 4);
      buf.writeInt32LE(Math.round((P[3 * j + 2] - c[2]) * 1000), o + 8);
      buf[o + 12] = inten[j]; buf[o + 13] = 0;
    }
    pts.send(buf, host.port, host.ip);
  }
  t++; if (t % 10 === 0) frame++;
}, 10);
console.log(`にせの MID-360（${MY_IP}、SN ${SN.replace(/\0/g, '')}）を起動しました`);
