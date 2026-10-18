// ライブ表示（Electron の裏側で動く）
//   ・Livox MID-360 から点群を直接受け取る（Livox SDK2 と同じ通信手順。ドライバや ROS は使わない）
//   ・受け取った点群を、同じネットワークのほかの LiDAR Viewer に配信する
//   ・ほかの LiDAR Viewer が配信している点群を受け取る
//   ※ 配信の知らせに使う名前 app: 'pcd-viewer' は、旧名（PCD Viewer）の版とも互いに見つけられるよう、そのままにしている
// 画面へは、およそ 20 回/秒にまとめた点（x y z の float32 と 反射の uint8）を送る
'use strict';
const dgram = require('node:dgram');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const WebSocket = require('ws');

// ------------------------------------------------------------------ CRC（SDK2 の FastCRC と同じ）
const CRC32_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC32_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function crc16ccitt(b) { let c = 0xffff; for (let i = 0; i < b.length; i++) { c ^= b[i] << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; }

// ------------------------------------------------------------------ 定数（Livox SDK2 の define.h より）
const PORT = { detect: 56000, lidarCmd: 56100, lidarPoint: 56300, hostCmd: 56101, hostPush: 56201, hostPoint: 56301, hostImu: 56401 };
const CMD = { search: 0x0000, workModeControl: 0x0100 };
const KEY = { pclDataType: 0x0000, pointDataHostIp: 0x0006, workMode: 0x001a };
const DEV_TYPES = { 9: 'MID-360', 35: 'MID-360s', 41: 'MID-360L', 7: 'Avia', 40: 'Avia2', 10: 'HAP', 15: 'HAP', 6: 'Mid-70', 3: 'Horizon', 2: 'Tele-15', 1: 'Mid-40', 16: 'PA' };

let seq = 1;
// 命令の箱: sof(0xAA) 版 長さ 通し番号 命令 種類 送り手 予備6 CRC16（先頭18バイト） CRC32（中身）+ 中身
function packCmd(cmdId, data = Buffer.alloc(0), cmdType = 0, sender = 0, seqNo = null) {
  const b = Buffer.alloc(24 + data.length);
  b[0] = 0xaa; b[1] = 0; b.writeUInt16LE(b.length, 2); b.writeUInt32LE(seqNo === null ? (seq++ & 0xffff) : seqNo, 4);
  b.writeUInt16LE(cmdId, 8); b[10] = cmdType; b[11] = sender;
  b.writeUInt16LE(crc16ccitt(b.subarray(0, 18)), 18);
  b.writeUInt32LE(data.length ? crc32(data) : 0, 20);
  data.copy(b, 24);
  return b;
}
function parseCmd(b) {
  if (b.length < 24 || b[0] !== 0xaa) return null;
  const len = b.readUInt16LE(2);
  if (len > b.length || crc16ccitt(b.subarray(0, 18)) !== b.readUInt16LE(18)) return null;
  return { seq: b.readUInt32LE(4), cmd: b.readUInt16LE(8), type: b[10], sender: b[11], data: b.subarray(24, len) };
}
// 設定の中身: 項目の数(2) 予備(2) + [項目(2) 長さ(2) 値]...
function kvList(items) {
  const parts = [Buffer.alloc(4)];
  parts[0].writeUInt16LE(items.length, 0);
  for (const [k, v] of items) { const h = Buffer.alloc(4); h.writeUInt16LE(k, 0); h.writeUInt16LE(v.length, 2); parts.push(h, v); }
  return Buffer.concat(parts);
}
const ipBytes = ip => Buffer.from(ip.split('.').map(Number));
const ipInt = ip => ip.split('.').reduce((a, x) => ((a << 8) | Number(x)) >>> 0, 0);

// このパソコンの IPv4（ネットワークごと）
function localNets() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== 'IPv4' && a.family !== 4) continue;
    if (a.internal) continue;
    const ip = ipInt(a.address), mask = ipInt(a.netmask);
    const bc = ((ip & mask) | (~mask >>> 0)) >>> 0;
    out.push({ name, address: a.address, netmask: a.netmask, ip, mask, broadcast: [24, 16, 8, 0].map(s => (bc >>> s) & 255).join('.') });
  }
  return out;
}
const sameNet = (n, ip) => ((n.ip & n.mask) >>> 0) === ((ipInt(ip) & n.mask) >>> 0);

function bindUdp(port, onMsg, onErr) {
  const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  s.on('message', onMsg);
  s.on('error', onErr);
  return new Promise((res, rej) => {
    s.once('error', rej);
    s.bind(port, () => { s.off('error', rej); try { s.setBroadcast(true); } catch (e) { /* なくても動く */ } res(s); });
  });
}

// ------------------------------------------------------------------ 点をまとめて画面へ送る入れ物
class Batcher {
  constructor(emit, ms = 50) { this.emit = emit; this.ms = ms; this.reset(); this.timer = setInterval(() => this.flush(), ms); }
  reset() { this.cap = 1 << 16; this.xyz = new Float32Array(this.cap * 3); this.refl = new Uint8Array(this.cap); this.n = 0; }
  push(x, y, z, r) {
    if (this.n >= this.cap) { const c = this.cap * 2, a = new Float32Array(c * 3), b = new Uint8Array(c); a.set(this.xyz); b.set(this.refl); this.xyz = a; this.refl = b; this.cap = c; }
    const i = this.n++; this.xyz[3 * i] = x; this.xyz[3 * i + 1] = y; this.xyz[3 * i + 2] = z; this.refl[i] = r;
  }
  flush() {
    if (!this.n) return;
    const n = this.n;
    this.emit({ n, xyz: this.xyz.slice(0, 3 * n), refl: this.refl.slice(0, n) });
    this.n = 0;
  }
  close() { clearInterval(this.timer); }
}

// ------------------------------------------------------------------ LiDAR を探す・つなぐ・受け取る
class LivoxLink extends EventEmitter {
  constructor() { super(); this.devices = new Map(); this.socks = {}; this.active = null; this.stat = { pts: 0, pkts: 0, bad: 0 }; }
  async open() {
    if (this.socks.det) return;
    const err = e => this.emit('log', `通信のエラー: ${e.message}`);
    try {
      this.socks.det = await bindUdp(PORT.detect, (m, r) => this.onDetect(m, r), err);
      this.socks.cmd = await bindUdp(PORT.hostCmd, (m, r) => this.onCmd(m, r), err);
      this.socks.pts = await bindUdp(PORT.hostPoint, (m) => this.onPoints(m), err);
      this.socks.push = await bindUdp(PORT.hostPush, () => {}, err);
    } catch (e) {
      this.close();
      throw new Error(e.code === 'EADDRINUSE' ? `ポート ${e.port || ''} がほかのソフト（livox_ros_driver2 など）に使われています。そちらを止めてから試してください` : e.message);
    }
    this.searchTimer = setInterval(() => this.search(), 1000);
    this.search();
  }
  close() {
    clearInterval(this.searchTimer); this.searchTimer = null;
    for (const s of Object.values(this.socks)) try { s.close(); } catch (e) { /* 閉じ済み */ }
    this.socks = {};
    this.stop();
  }
  // 見つける: 探す命令を、全体と各ネットワークのブロードキャスト宛てに送る
  search() {
    const pkt = packCmd(CMD.search);
    const targets = new Set(['255.255.255.255', ...localNets().map(n => n.broadcast)]);
    for (const t of targets) this.socks.det?.send(pkt, PORT.detect, t, () => {});
    const now = Date.now();
    let changed = false;
    for (const [k, d] of this.devices) if (now - d.seen > 4000 && (!this.active || this.active.sn !== k)) { this.devices.delete(k); changed = true; }
    if (changed) this.emit('devices', this.list());
  }
  onDetect(m, r) {
    const p = parseCmd(m);
    if (!p || p.cmd !== CMD.search || p.type !== 1 || p.data.length < 24) return; // 返事（ack）だけ
    const d = p.data;
    const sn = d.subarray(2, 18).toString('latin1').replace(/\0.*$/, '');
    const ip = [...d.subarray(18, 22)].join('.');
    const dev = { sn, ip: ip === '0.0.0.0' ? r.address : ip, type: d[1], model: DEV_TYPES[d[1]] || `種類 ${d[1]}`, cmdPort: d.readUInt16LE(22) || PORT.lidarCmd, seen: Date.now() };
    const old = this.devices.get(sn);
    this.devices.set(sn, dev);
    if (!old || old.ip !== dev.ip) this.emit('devices', this.list());
  }
  list() {
    const nets = localNets();
    return [...this.devices.values()].map(d => { const n = nets.find(x => sameNet(x, d.ip)); return { sn: d.sn, ip: d.ip, model: d.model, hostIp: n ? n.address : null }; });
  }
  // つなぐ: 点群の送り先をこのパソコンにし、形式（座標・高精度）と動作モード（通常）を設定する
  async start(sn) {
    const dev = this.devices.get(sn);
    if (!dev) throw new Error('その LiDAR が見つかりません');
    const net = localNets().find(n => sameNet(n, dev.ip));
    if (!net) throw new Error(`この PC には LiDAR（${dev.ip}）と同じネットワークの IP がありません。有線 LAN の IP を ${dev.ip.split('.').slice(0, 3).join('.')}.50 などに設定してください`);
    this.stop();
    this.active = { ...dev, hostIp: net.address };
    this.batch = new Batcher(b => this.emit('points', b));
    this.stat = { pts: 0, pkts: 0, bad: 0, t0: Date.now() };
    const host = Buffer.alloc(8); ipBytes(net.address).copy(host, 0); host.writeUInt16LE(PORT.hostPoint, 4); host.writeUInt16LE(PORT.lidarPoint, 6);
    const body = kvList([[KEY.pclDataType, Buffer.from([1])], [KEY.pointDataHostIp, host], [KEY.workMode, Buffer.from([1])]]);
    // 返事が来るまで何度か送る
    this.ack = null;
    for (let i = 0; i < 10 && !this.ack; i++) {
      this.socks.cmd.send(packCmd(CMD.workModeControl, body), dev.cmdPort, dev.ip, () => {});
      await new Promise(r => setTimeout(r, 300));
    }
    if (!this.ack) this.emit('log', 'LiDAR から設定の返事がありません（点群が届けばそのまま表示します）');
    else if (this.ack.ret !== 0) this.emit('log', `LiDAR が設定を受け付けませんでした（返事 ${this.ack.ret}、項目 0x${this.ack.key.toString(16)}）`);
    return this.active;
  }
  stop() { if (this.batch) { this.batch.close(); this.batch = null; } this.active = null; }
  onCmd(m) {
    const p = parseCmd(m);
    if (p && p.cmd === CMD.workModeControl && p.type === 1 && p.data.length >= 3) this.ack = { ret: p.data[0], key: p.data.readUInt16LE(1) };
  }
  // 点群の箱: 版 長さ 時間間隔 点数 箱の番号 フレーム番号 種類 時刻の種類 予備12 CRC32 時刻8 = 36 バイト + 点
  onPoints(m) {
    if (!this.batch || m.length < 36) return;
    const n = m.readUInt16LE(5), type = m[10];
    this.stat.pkts++;
    const b = this.batch;
    let o = 36;
    if (type === 1) { // x y z（mm、int32）反射 タグ = 14 バイト
      for (let i = 0; i < n && o + 14 <= m.length; i++, o += 14) {
        const x = m.readInt32LE(o), y = m.readInt32LE(o + 4), z = m.readInt32LE(o + 8);
        if (x === 0 && y === 0 && z === 0) continue;
        b.push(x / 1000, y / 1000, z / 1000, m[o + 12]); this.stat.pts++;
      }
    } else if (type === 2) { // x y z（cm、int16）反射 タグ = 8 バイト
      for (let i = 0; i < n && o + 8 <= m.length; i++, o += 8) {
        const x = m.readInt16LE(o), y = m.readInt16LE(o + 2), z = m.readInt16LE(o + 4);
        if (x === 0 && y === 0 && z === 0) continue;
        b.push(x / 100, y / 100, z / 100, m[o + 6]); this.stat.pts++;
      }
    } else if (type === 3) { // 距離（mm）方位 天頂（0.01 度）反射 タグ = 10 バイト
      for (let i = 0; i < n && o + 10 <= m.length; i++, o += 10) {
        const d = m.readUInt32LE(o) / 1000; if (!d) continue;
        const th = m.readUInt16LE(o + 4) / 100 * Math.PI / 180, ph = m.readUInt16LE(o + 6) / 100 * Math.PI / 180;
        b.push(d * Math.sin(th) * Math.cos(ph), d * Math.sin(th) * Math.sin(ph), d * Math.cos(th), m[o + 8]); this.stat.pts++;
      }
    } else this.stat.bad++;
  }
}

// ------------------------------------------------------------------ 配信（ほかの LiDAR Viewer へ）
const BEACON_PORT = 47800;
// 送る形: 'PCV1' 点数(4) + xyz(float32 × 3n) + 反射(n)
function encodeBatch(b, step = 1) {
  const n = Math.ceil(b.n / step);
  const buf = Buffer.alloc(8 + 13 * n);
  buf.write('PCV1', 0, 'latin1'); buf.writeUInt32LE(n, 4);
  const xyz = new Float32Array(buf.buffer, buf.byteOffset + 8, 3 * n);
  const refl = buf.subarray(8 + 12 * n);
  for (let i = 0, j = 0; i < b.n; i += step, j++) { xyz[3 * j] = b.xyz[3 * i]; xyz[3 * j + 1] = b.xyz[3 * i + 1]; xyz[3 * j + 2] = b.xyz[3 * i + 2]; refl[j] = b.refl[i]; }
  return buf;
}
function decodeBatch(buf) {
  if (buf.length < 8 || buf.toString('latin1', 0, 4) !== 'PCV1') return null;
  const n = buf.readUInt32LE(4);
  const copy = Buffer.from(buf); // float32 の並びをそろえるために写す
  return { n, xyz: new Float32Array(copy.buffer, copy.byteOffset + 8, 3 * n).slice(), refl: new Uint8Array(copy.buffer, copy.byteOffset + 8 + 12 * n, n).slice() };
}

class Sharer {
  constructor() { this.server = null; this.step = 1; }
  async start(info) {
    this.stop();
    this.info = info;
    this.server = new WebSocket.Server({ port: 0 });
    await new Promise((res, rej) => { this.server.once('listening', res); this.server.once('error', rej); });
    this.port = this.server.address().port;
    this.beacon = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    await new Promise(r => this.beacon.bind(0, r));
    this.beacon.setBroadcast(true);
    const send = () => {
      const msg = Buffer.from(JSON.stringify({ app: 'pcd-viewer', v: 1, name: os.hostname(), port: this.port, model: info.model, sn: info.sn, id: this.id ||= Math.random().toString(36).slice(2) }));
      const targets = new Set(['255.255.255.255', ...localNets().map(n => n.broadcast)]);
      for (const t of targets) this.beacon.send(msg, BEACON_PORT, t, () => {});
    };
    send();
    this.timer = setInterval(send, 1000);
    return this.port;
  }
  clients() { return this.server ? this.server.clients.size : 0; }
  send(b) {
    if (!this.server || !this.server.clients.size) return;
    const buf = encodeBatch(b, this.step);
    for (const c of this.server.clients) if (c.readyState === 1 && c.bufferedAmount < 8e6) c.send(buf); // 遅れている相手には送らずに間引く
  }
  stop() {
    clearInterval(this.timer); this.timer = null;
    if (this.beacon) { try { this.beacon.close(); } catch (e) { /* 閉じ済み */ } this.beacon = null; }
    if (this.server) { for (const c of this.server.clients) c.terminate(); this.server.close(); this.server = null; }
  }
}

// 配信を探す（ほかのパソコンの知らせを聞く）
class PeerFinder extends EventEmitter {
  constructor() { super(); this.peers = new Map(); }
  async open() {
    if (this.sock) return;
    this.sock = await bindUdp(BEACON_PORT, (m, r) => {
      let j; try { j = JSON.parse(m.toString()); } catch (e) { return; }
      if (j.app !== 'pcd-viewer' || !j.port) return;
      if (this.selfId && j.id === this.selfId) return; // 自分の配信は出さない
      const key = `${r.address}:${j.port}`;
      const isNew = !this.peers.has(key);
      this.peers.set(key, { key, address: r.address, port: j.port, name: j.name, model: j.model, sn: j.sn, seen: Date.now() });
      if (isNew) this.emit('peers', this.list());
    }, () => {});
    this.timer = setInterval(() => { const now = Date.now(); let ch = false; for (const [k, p] of this.peers) if (now - p.seen > 4000) { this.peers.delete(k); ch = true; } if (ch) this.emit('peers', this.list()); }, 1000);
  }
  list() { return [...this.peers.values()].map(({ key, address, port, name, model, sn }) => ({ key, address, port, name, model, sn })); }
  close() { clearInterval(this.timer); if (this.sock) try { this.sock.close(); } catch (e) { /* 閉じ済み */ } this.sock = null; }
}

// ------------------------------------------------------------------ まとめ役（main.js から使う）
class Live extends EventEmitter {
  constructor() {
    super();
    this.lidar = new LivoxLink(); this.sharer = new Sharer(); this.finder = new PeerFinder();
    this.mode = null; // 'lidar' | 'peer' | null
    this.lidar.on('devices', l => this.emit('state', this.state()));
    this.lidar.on('log', t => this.emit('log', t));
    this.finder.on('peers', () => this.emit('state', this.state()));
    this.lidar.on('points', b => { this.count += b.n; this.emit('points', b); this.sharer.send(b); });
    this.count = 0;
    this.rateTimer = setInterval(() => { this.rate = this.count; this.count = 0; if (this.mode) this.emit('state', this.state()); }, 1000);
  }
  async open() {
    const errs = [];
    try { await this.lidar.open(); } catch (e) { errs.push(e.message); }
    try { await this.finder.open(); } catch (e) { errs.push(`配信を探せません（${e.message}）`); }
    this.openErrors = errs;
    return this.state();
  }
  state() {
    return {
      devices: this.lidar.list(), peers: this.finder.list(), errors: this.openErrors || [],
      mode: this.mode, source: this.source || null, rate: this.rate || 0,
      sharing: !!this.sharer.server, shareClients: this.sharer.clients(), shareStep: this.sharer.step,
      nets: localNets().map(n => `${n.name} ${n.address}`),
    };
  }
  async startLidar(sn) {
    await this.stopAll();
    const a = await this.lidar.start(sn);
    this.mode = 'lidar'; this.source = { kind: 'lidar', sn: a.sn, ip: a.ip, model: a.model, hostIp: a.hostIp };
    return this.state();
  }
  async startPeer(key) {
    await this.stopAll();
    const p = this.finder.peers.get(key);
    if (!p) throw new Error('その配信が見つかりません');
    this.mode = 'peer'; this.source = { kind: 'peer', name: p.name, model: p.model, address: p.address };
    const ws = new WebSocket(`ws://${p.address}:${p.port}`);
    ws.binaryType = 'nodebuffer';
    this.ws = ws;
    ws.on('message', d => { const b = decodeBatch(d); if (b) { this.count += b.n; this.emit('points', b); } });
    ws.on('close', () => { if (this.ws === ws) { this.ws = null; this.emit('log', '配信が終わりました'); this.mode = null; this.source = null; this.emit('state', this.state()); } });
    ws.on('error', e => this.emit('log', `配信につながりません（${e.message}）`));
    return this.state();
  }
  async setShare(on, step = 1) {
    this.sharer.step = step;
    if (!on) { this.sharer.stop(); return this.state(); }
    if (this.mode !== 'lidar') throw new Error('配信できるのは、このパソコンにつながった LiDAR だけです');
    if (!this.sharer.server) { await this.sharer.start(this.source); this.finder.selfId = this.sharer.id; }
    return this.state();
  }
  async stopAll() {
    this.lidar.stop(); this.sharer.stop();
    if (this.ws) { const w = this.ws; this.ws = null; w.close(); }
    this.mode = null; this.source = null;
    return this.state();
  }
  close() { clearInterval(this.rateTimer); this.stopAll(); this.lidar.close(); this.finder.close(); }
}

module.exports = { Live, packCmd, parseCmd, crc32, crc16ccitt, PORT, CMD, KEY, encodeBatch, decodeBatch, localNets };
