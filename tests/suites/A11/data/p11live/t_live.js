// live.js の点の箱の読み方（データ型 1/2/3）を、作った箱で確かめる。正解は livox_ros_driver2 の式
'use strict';
const { Live } = require('/home/claude/pcd-viewer/live.js');
const L = new Live();
const link = L.lidar;
const got = [];
link.batch = { push: (x, y, z, r) => got.push([x, y, z, r]), close() {} };
function header(type, n) { const b = Buffer.alloc(36); b[0] = 0; b.writeUInt16LE(36, 1); b.writeUInt16LE(n, 5); b[10] = type; return b; }
function pkt(type, pts) {
  const size = { 1: 14, 2: 8, 3: 10 }[type];
  const body = Buffer.alloc(size * pts.length);
  pts.forEach((p, i) => {
    const o = i * size;
    if (type === 1) { body.writeInt32LE(p[0], o); body.writeInt32LE(p[1], o + 4); body.writeInt32LE(p[2], o + 8); body[o + 12] = p[3]; body[o + 13] = 0; }
    if (type === 2) { body.writeInt16LE(p[0], o); body.writeInt16LE(p[1], o + 2); body.writeInt16LE(p[2], o + 4); body[o + 6] = p[3]; body[o + 7] = 0; }
    if (type === 3) { body.writeUInt32LE(p[0], o); body.writeUInt16LE(p[1], o + 4); body.writeUInt16LE(p[2], o + 6); body[o + 8] = p[3]; body[o + 9] = 0; }
  });
  const h = header(type, pts.length); h.writeUInt16LE(36 + body.length, 1);
  return Buffer.concat([h, body]);
}
const ref = (t, p) => {
  if (t === 1) return [p[0] / 1000, p[1] / 1000, p[2] / 1000, p[3]];
  if (t === 2) return [p[0] / 100, p[1] / 100, p[2] / 100, p[3]];
  const r = p[0] / 1000, th = p[1] / 100 / 180 * Math.PI, ph = p[2] / 100 / 180 * Math.PI;
  return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th), p[3]];
};
const cases = {
  1: [[1000, -2000, 3000, 50], [0, 0, 0, 9], [-70000, 70000, -1, 255], [2147483647, -2147483648, 1, 1], [1, 0, 0, 0]],
  2: [[100, -200, 300, 50], [0, 0, 0, 9], [-32768, 32767, -1, 255], [1, 0, 0, 7]],
  3: [[5000, 9000, 0, 10], [5000, 9000, 9000, 11], [5000, 0, 1234, 12], [5000, 18000, 0, 13], [5000, 9000, 27000, 14], [12345, 4500, 13500, 15], [0, 9000, 0, 16], [70000, 18000, 36000, 17], [4294967295, 9000, 0, 18]],
};
let bad = 0;
for (const [t, pts] of Object.entries(cases)) {
  got.length = 0;
  link.onPoints(pkt(+t, pts));
  const want = pts.map(p => ref(+t, p)).filter((w, i) => !(+t === 3 ? pts[i][0] === 0 : (pts[i][0] === 0 && pts[i][1] === 0 && pts[i][2] === 0)));
  const ok = got.length === want.length && got.every((g, i) => g.every((v, k) => Math.abs(v - want[i][k]) < 1e-9));
  if (!ok) bad++;
  console.log(`型 ${t}: ${ok ? '一致' : '不一致'} got=${JSON.stringify(got.map(g => g.map(v => +v.toFixed(6))))}`);
}
// 点数（dot_num）が箱の中身より多い・少ない
got.length = 0; const p = pkt(1, [[1000, 0, 0, 1], [2000, 0, 0, 2]]); p.writeUInt16LE(96, 5); link.onPoints(p);
console.log('dot_num=96 で中身 2 点:', got.length, '点');
got.length = 0; const p2 = pkt(1, [[1000, 0, 0, 1], [2000, 0, 0, 2]]); p2.writeUInt16LE(1, 5); link.onPoints(p2);
console.log('dot_num=1 で中身 2 点:', got.length, '点');
// IMU（型 0）や未知の型は数えて捨てる
link.onPoints(header(0, 1)); link.onPoints(header(9, 1));
console.log('stat', JSON.stringify(link.stat));
// 配信の形（PCV1）で往復
const { encodeBatch, decodeBatch } = require('/home/claude/pcd-viewer/live.js');
const b = { n: 3, xyz: new Float32Array([1.5, -2.25, 3.125, 100.001, 0, -0.001, 1e6, 2e-3, 7]), refl: new Uint8Array([1, 2, 255]) };
for (const step of [1, 2]) { const d = decodeBatch(encodeBatch(b, step)); console.log(`配信 step=${step}:`, d.n, Array.from(d.xyz), Array.from(d.refl)); }
L.close();
process.exitCode = bad;
