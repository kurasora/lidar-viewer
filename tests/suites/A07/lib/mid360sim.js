// mid360sim.js — 試験用の「にせ MID-360」（A07 自作）
//   アプリの live.js を使わず、Livox 公開の MID-360 通信仕様（v1.4.x）と Livox-SDK2 のソースから独立に書いたもの。
//   CRC も自前（CRC-16/CCITT-FALSE、CRC-32）なので、アプリの箱の作り方の誤りも見つけられる。
//   使い方: node mid360sim.js '<JSON の設定>'   （標準入力に 1 行ずつ命令: gone / back / pause / resume / rate N / type N / ip A.B.C.D / bad KIND / quit）
//   標準出力に 1 行 1 JSON で出来事を出す（{ev:'ready'} {ev:'search'} {ev:'cmd'} {ev:'host'} {ev:'stats'} …）
'use strict';
const dgram = require('node:dgram');
const fs = require('node:fs');

const o = Object.assign({
  ip: '10.107.0.1',          // 返事に書く LiDAR の IP（lidar_ip）
  sn: '47MDL9T0020193',      // 返事に書く SN（16 バイトまで）
  devType: 9,                // 9 = MID-360
  reply: 'broadcast',        // 検出の返事: broadcast（本物の仕様どおり 255.255.255.255）/ subnet（サブネットのブロードキャスト）/ unicast / none
  replyTo: null,             // reply=subnet のときの宛先（例 10.107.0.255）
  ack: true,                 // 設定の命令に返事をするか
  ackRet: 0,                 // 返事のコード
  ackErrKey: 0,
  ackDelay: 0,               // 返事を遅らせる ms
  ackSeq: 'echo',            // echo（本物どおり命令と同じ番号）/ other
  rate: 200000,              // 毎秒の点数
  pktPts: 96,                // 1 箱の点数（MID-360 は 96）
  forceType: 0,              // 0 = アプリの指定（キー 0x0000）に従う / 1,2,3 = 指定を無視してこの型で送る
  pattern: 'grid',           // grid（値の照合ができる決まった点）/ map（廊下の地図から）/ ring（原点まわりの輪）
  loss: 0, reorder: 0, dup: 0, // 取りこぼし・入れ替え・重複の割合
  bad: '',                   // 壊れた箱を混ぜる: short / hdronly / dotnum_big / dotnum_small / type0 / type9 / len_lie / garbage / zero
  badEvery: 0,               // 何箱に 1 つ壊れた箱を混ぜるか（0 = 混ぜない）
  autoStart: null,           // {ip, port} … 設定の命令なしでこの宛先へ送り始める（設定が電源を切っても残る本物を模す）
  sendFromPort: 56300,
  checkCrc: true,            // 受けた命令の CRC16/CRC32 を調べる（合わなければ本物と同じく捨てる＝返事をしない）
  verbose: false,
}, JSON.parse(process.argv[2] || '{}'));

// ---- CRC（仕様: CRC-16/CCITT-FALSE poly 0x1021 init 0xFFFF / CRC-32 poly 0x04C11DB7 init/xorout 0xFFFFFFFF reflect）
function crc16(buf) { let c = 0xffff; for (const b of buf) { c ^= b << 8; for (let k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; }
const T32 = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); T32[n] = c >>> 0; }
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = T32[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function pack(cmdId, cmdType, seq, data) {
  const b = Buffer.alloc(24 + data.length);
  b[0] = 0xaa; b[1] = 0; b.writeUInt16LE(b.length, 2); b.writeUInt32LE(seq >>> 0, 4); b.writeUInt16LE(cmdId, 8); b[10] = cmdType; b[11] = 1; // 送り手 = LiDAR
  b.writeUInt16LE(crc16(b.subarray(0, 18)), 18); b.writeUInt32LE(data.length ? crc32(data) : 0, 20); data.copy(b, 24); return b;
}
function parse(b) {
  if (b.length < 24 || b[0] !== 0xaa) return { err: 'sof' };
  const len = b.readUInt16LE(2);
  if (len < 24 || len > b.length) return { err: 'len' };
  const h16 = crc16(b.subarray(0, 18)), c16 = b.readUInt16LE(18);
  const data = b.subarray(24, len);
  const c32 = b.readUInt32LE(20), h32 = data.length ? crc32(data) : 0;
  return { ver: b[1], len, seq: b.readUInt32LE(4), cmd: b.readUInt16LE(8), type: b[10], sender: b[11], resv: [...b.subarray(12, 18)], data, crc16ok: h16 === c16, crc32ok: h32 === c32, rawLen: b.length };
}
const out = o2 => process.stdout.write(JSON.stringify(o2) + '\n');

let gone = false, paused = false, host = o.autoStart, dataType = o.forceType || 1, workMode = 1, ipNow = o.ip;
const stats = { searches: 0, cmds: 0, badCrc: 0, sentPkts: 0, sentPts: 0, acks: 0 };

// ---- 検出（56000）
const det = dgram.createSocket({ type: 'udp4', reuseAddr: true });
det.on('error', e => out({ ev: 'error', sock: 'det', msg: e.message }));
det.on('message', (m, r) => {
  const p = parse(m);
  if (p.err || p.cmd !== 0x0000 || p.type !== 0) return; // 自分の返事（type 1）は無視
  stats.searches++;
  if (o.checkCrc && !(p.crc16ok && p.crc32ok)) { stats.badCrc++; out({ ev: 'badcrc', where: 'search', from: r.address, crc16ok: p.crc16ok, crc32ok: p.crc32ok }); return; }
  if (o.verbose || stats.searches <= 2) out({ ev: 'search', from: `${r.address}:${r.port}`, len: p.len, ver: p.ver, sender: p.sender, dataLen: p.data.length, n: stats.searches });
  if (gone || o.reply === 'none') return;
  const d = Buffer.alloc(24); d[0] = 0; d[1] = o.devType;
  Buffer.from(o.sn, 'latin1').subarray(0, 16).copy(d, 2);
  Buffer.from(ipNow.split('.').map(Number)).copy(d, 18); d.writeUInt16LE(56100, 22);
  const ack = pack(0x0000, 1, p.seq, d);
  const to = o.reply === 'unicast' ? [r.address, r.port] : o.reply === 'subnet' ? [o.replyTo, 56000] : ['255.255.255.255', 56000];
  det.send(ack, to[1], to[0], e => { if (e && stats.searches <= 3) out({ ev: 'error', sock: 'det-send', to, msg: e.message }); });
});
det.bind(56000, () => { det.setBroadcast(true); });

// ---- 命令（56100）
const cmd = dgram.createSocket({ type: 'udp4', reuseAddr: true });
cmd.on('error', e => out({ ev: 'error', sock: 'cmd', msg: e.message }));
cmd.on('message', (m, r) => {
  const p = parse(m);
  if (p.err) { out({ ev: 'cmdjunk', err: p.err, from: r.address }); return; }
  stats.cmds++;
  const rec = { ev: 'cmd', from: `${r.address}:${r.port}`, cmd: p.cmd, type: p.type, sender: p.sender, ver: p.ver, seq: p.seq, len: p.len, rawLen: p.rawLen, crc16ok: p.crc16ok, crc32ok: p.crc32ok, keys: [] };
  if (o.checkCrc && !(p.crc16ok && p.crc32ok)) { stats.badCrc++; rec.dropped = 'crc'; out(rec); return; }
  if (p.cmd === 0x0100 && p.type === 0) {
    const n = p.data.readUInt16LE(0); let off = 4;
    rec.keyNum = n; rec.rsvd = p.data.readUInt16LE(2);
    for (let i = 0; i < n && off + 4 <= p.data.length; i++) {
      const k = p.data.readUInt16LE(off), l = p.data.readUInt16LE(off + 2), v = p.data.subarray(off + 4, off + 4 + l);
      rec.keys.push({ key: k, len: l, hex: v.toString('hex') });
      if (k === 0x0006 && l >= 8) host = { ip: [...v.subarray(0, 4)].join('.'), port: v.readUInt16LE(4), lidarPort: v.readUInt16LE(6) };
      if (k === 0x0000 && l >= 1 && !o.forceType) dataType = v[0];
      if (k === 0x001a && l >= 1) workMode = v[0];
      off += 4 + l;
    }
    rec.trailing = p.data.length - off;
    out(rec);
    if (host) out({ ev: 'host', host, dataType, workMode });
    if (!o.ack || gone) return;
    const a = Buffer.alloc(3); a[0] = o.ackRet; a.writeUInt16LE(o.ackErrKey, 1);
    const seq = o.ackSeq === 'echo' ? p.seq : (p.seq + 1000);
    setTimeout(() => { cmd.send(pack(0x0100, 1, seq, a), r.port, r.address); stats.acks++; }, o.ackDelay);
  } else if (p.cmd === 0x0101 && p.type === 0) {
    // 設定の問い合わせ: key_num(2) rsvd(2) key… → ret(1) param_num(2) [key len value]…
    const n = p.data.readUInt16LE(0); const keys = []; for (let i = 0; i < n; i++) keys.push(p.data.readUInt16LE(4 + 2 * i));
    rec.query = keys; out(rec);
    const parts = [];
    for (const k of keys) {
      let v = null;
      if (k === 0x0000) v = Buffer.from([dataType]);
      else if (k === 0x0006) { v = Buffer.alloc(8); if (host) { Buffer.from(host.ip.split('.').map(Number)).copy(v); v.writeUInt16LE(host.port, 4); v.writeUInt16LE(56300, 6); } }
      else if (k === 0x001a) v = Buffer.from([workMode]);
      else if (k === 0x8000) { v = Buffer.alloc(16); Buffer.from(o.sn, 'latin1').copy(v); }
      if (!v) continue;
      const h = Buffer.alloc(4); h.writeUInt16LE(k, 0); h.writeUInt16LE(v.length, 2); parts.push(h, v);
    }
    const head = Buffer.alloc(3); head[0] = 0; head.writeUInt16LE(parts.length / 2, 1);
    if (o.ack && !gone) cmd.send(pack(0x0101, 1, p.seq, Buffer.concat([head, ...parts])), r.port, r.address);
  } else out(rec);
});
cmd.bind(56100);

// ---- 点群（56300 から送る）
const pts = dgram.createSocket({ type: 'udp4', reuseAddr: true });
pts.on('error', e => out({ ev: 'error', sock: 'pts', msg: e.message }));
pts.bind(o.sendFromPort);

// 点の作り方
let MAP = null, TRAJ = null;
if (o.pattern === 'map') {
  const d = JSON.parse(fs.readFileSync('/home/claude/pcd-viewer/sample/map.json', 'utf8'));
  const q = new Uint16Array(Buffer.from(d.b64, 'base64').buffer.slice(0)); const inten = Buffer.from(d.b64i, 'base64');
  const P = new Float32Array(d.n * 3); for (let i = 0; i < d.n; i++) for (let k = 0; k < 3; k++) P[3 * i + k] = d.lo[k] + d.sc[k] * q[3 * i + k];
  MAP = { P, inten, n: d.n };
  TRAJ = fs.readFileSync('/home/claude/pcd-viewer/sample/trajectory.txt', 'utf8').split('\n').filter(l => /^\d/.test(l)).map(l => l.split(/\s+/).map(Number));
}
let g = 0; // 送った点の通し番号
// grid: 点 g は x = 1000 + g%1000 mm, y = -(2000 + g%777) mm, z = 300 + (g%13)*10 mm, 反射 = g%256 … 受け手は (x,y,z,r) の組から g の剰余を照合できる
function gridPoint(gg) { return [1000 + gg % 1000, -(2000 + gg % 777), 300 + (gg % 13) * 10, gg % 256]; }
let mapPool = null, mapAt = null, ti = 0;
function nextPoint() {
  const gg = g++;
  if (o.pattern === 'grid') return gridPoint(gg);
  if (o.pattern === 'ring') { const a = (gg % 3600) / 10 * Math.PI / 180, R = o.ringR || 5000; return [Math.round(R * Math.cos(a)), Math.round(R * Math.sin(a)), (gg % 7) * 100, gg % 256]; }
  // map
  const r = TRAJ[ti % TRAJ.length]; const c = [r[1], r[2], r[3] + 0.4];
  if (!mapAt || Math.hypot(c[0] - mapAt[0], c[1] - mapAt[1]) > 2) { const idx = []; for (let i = 0; i < MAP.n; i++) { const dx = MAP.P[3 * i] - c[0], dy = MAP.P[3 * i + 1] - c[1]; if (dx * dx + dy * dy < 900) idx.push(i); } mapPool = Uint32Array.from(idx); mapAt = c; }
  const j = mapPool[(Math.random() * mapPool.length) | 0];
  return [Math.round((MAP.P[3 * j] - c[0]) * 1000), Math.round((MAP.P[3 * j + 1] - c[1]) * 1000), Math.round((MAP.P[3 * j + 2] - c[2]) * 1000), MAP.inten[j]];
}
if (o.pattern === 'map') setInterval(() => { ti++; }, 100);

const PSZ = { 1: 14, 2: 8, 3: 10 };
let udpCnt = 0, frame = 0;
function makePacket(type) {
  const n = o.pktPts, sz = PSZ[type] || 14;
  const b = Buffer.alloc(36 + n * sz);
  b[0] = 0; b.writeUInt16LE(b.length, 1); b.writeUInt16LE(Math.round(n * 0.5e-5 / 1e-7), 3); b.writeUInt16LE(n, 5); b.writeUInt16LE(udpCnt++ & 0xffff, 7);
  b[9] = frame & 0xff; b[10] = type; b[11] = 0;
  b.writeBigUInt64LE(BigInt(Date.now()) * 1000000n, 28);
  for (let i = 0; i < n; i++) {
    const [x, y, z, r] = nextPoint(); const q = 36 + i * sz;
    if (type === 1) { b.writeInt32LE(x, q); b.writeInt32LE(y, q + 4); b.writeInt32LE(z, q + 8); b[q + 12] = r; b[q + 13] = 0; }
    else if (type === 2) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x / 10))), q); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(y / 10))), q + 2); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(z / 10))), q + 4); b[q + 6] = r; b[q + 7] = 0; }
    else if (type === 3) {
      const d = Math.round(Math.hypot(x, y, z)); const th = d ? Math.acos(z / Math.hypot(x, y, z)) : 0; let ph = Math.atan2(y, x); if (ph < 0) ph += 2 * Math.PI;
      b.writeUInt32LE(d, q); b.writeUInt16LE(Math.round(th * 180 / Math.PI * 100), q + 4); b.writeUInt16LE(Math.round(ph * 180 / Math.PI * 100) % 36000, q + 6); b[q + 8] = r; b[q + 9] = 0;
    }
  }
  b.writeUInt32LE(crc32(b.subarray(28)), 24); // 仕様: 時刻＋点の CRC32
  return b;
}
function corrupt(b, kind) {
  switch (kind) {
    case 'short': return b.subarray(0, 20);
    case 'hdronly': return b.subarray(0, 36);
    case 'dotnum_big': { const c = Buffer.from(b); c.writeUInt16LE(60000, 5); return c; }
    case 'dotnum_small': { const c = Buffer.from(b); c.writeUInt16LE(3, 5); return c; }
    case 'type0': { const c = Buffer.from(b); c[10] = 0; return c; }
    case 'type9': { const c = Buffer.from(b); c[10] = 9; return c; }
    case 'len_lie': return b.subarray(0, b.length - 7); // 途中で切れた箱（最後の点が欠ける）
    case 'garbage': { const c = Buffer.alloc(b.length); for (let i = 0; i < c.length; i++) c[i] = (Math.random() * 256) | 0; return c; }
    case 'zero': return Buffer.alloc(b.length);
    default: return b;
  }
}
let held = null, pktNo = 0;
function sendPkt(b) {
  if (Math.random() < o.loss) return;
  if (o.reorder && Math.random() < o.reorder && !held) { held = b; return; }
  pts.send(b, host.port, host.ip); stats.sentPkts++;
  if (held) { pts.send(held, host.port, host.ip); stats.sentPkts++; held = null; }
  if (o.dup && Math.random() < o.dup) { pts.send(b, host.port, host.ip); stats.sentPkts++; }
}
let last = process.hrtime.bigint(), owed = 0;
setInterval(() => {
  const now = process.hrtime.bigint(); const dt = Number(now - last) / 1e9; last = now;
  if (!host || gone || paused) { owed = 0; return; }
  owed += o.rate * dt / o.pktPts;
  let k = Math.floor(owed); owed -= k; if (k > 2000) k = 2000;
  for (let i = 0; i < k; i++) {
    let b = makePacket(dataType);
    pktNo++;
    if (o.bad && o.badEvery && pktNo % o.badEvery === 0) b = corrupt(b, o.bad);
    else stats.sentPts += o.pktPts;
    sendPkt(b);
  }
  if (pktNo % 100 === 0) frame++;
}, 5);
setInterval(() => out({ ev: 'stats', ...stats, host, dataType, workMode, gone, paused }), 1000);

require('node:readline').createInterface({ input: process.stdin }).on('line', l => {
  const [c, a] = l.trim().split(/\s+/);
  if (c === 'gone') gone = true; else if (c === 'back') gone = false;
  else if (c === 'pause') paused = true; else if (c === 'resume') paused = false;
  else if (c === 'rate') o.rate = +a; else if (c === 'type') { dataType = +a; o.forceType = +a; }
  else if (c === 'ip') ipNow = a; else if (c === 'bad') { const [k, e] = (a || '').split(':'); o.bad = k; o.badEvery = +(e || 10); }
  else if (c === 'host') { const [ip, port] = a.split(':'); host = { ip, port: +port }; }
  else if (c === 'nohost') host = null;
  else if (c === 'quit') process.exit(0);
  out({ ev: 'ctl', line: l });
});
setTimeout(() => out({ ev: 'ready', ip: o.ip, sn: o.sn, reply: o.reply, pattern: o.pattern }), 100);
