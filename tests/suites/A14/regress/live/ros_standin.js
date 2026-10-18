// livox_ros_driver2（Livox SDK2）の代わり: 受け手のポート（56101 命令 / 56201 / 56301 点群）を開き、
// LiDAR に「点群の送り先 = 自分」を設定して、届いた点群の箱を 1 秒ごとに数える
//   node ros_standin.js <自分の IP> <LiDAR の IP> <SO_REUSEADDR 0|1> <秒>
'use strict';
const dgram = require('node:dgram');
const { packCmd, PORT, CMD, KEY } = require('/home/claude/pcd-viewer/live.js');
const [me, lidar, reuse, secs] = [process.argv[2], process.argv[3], process.argv[4] === '1', +(process.argv[5] || 10)];
const bind = port => new Promise((res, rej) => { const s = dgram.createSocket({ type: 'udp4', reuseAddr: reuse }); s.once('error', rej); s.bind(port, () => res(s)); });
(async () => {
  let cmd, pts, push;
  try { cmd = await bind(PORT.hostCmd); push = await bind(PORT.hostPush); pts = await bind(PORT.hostPoint); }
  catch (e) { console.log(JSON.stringify({ who: 'ros', error: e.code })); process.exit(1); }
  let n = 0; pts.on('message', () => n++);
  const host = Buffer.alloc(8); Buffer.from(me.split('.').map(Number)).copy(host, 0); host.writeUInt16LE(PORT.hostPoint, 4); host.writeUInt16LE(PORT.lidarPoint, 6);
  const items = [[KEY.pclDataType, Buffer.from([1])], [KEY.pointDataHostIp, host], [KEY.workMode, Buffer.from([1])]];
  const parts = [Buffer.alloc(4)]; parts[0].writeUInt16LE(items.length, 0);
  for (const [k, v] of items) { const h = Buffer.alloc(4); h.writeUInt16LE(k, 0); h.writeUInt16LE(v.length, 2); parts.push(h, v); }
  cmd.send(packCmd(CMD.workModeControl, Buffer.concat(parts)), PORT.lidarCmd, lidar);
  console.log(JSON.stringify({ who: 'ros', started: true, reuse }));
  let t = 0;
  const iv = setInterval(() => { t++; console.log(JSON.stringify({ who: 'ros', t, pktsPerSec: n })); n = 0; if (t >= secs) { clearInterval(iv); process.exit(0); } }, 1000);
})();
