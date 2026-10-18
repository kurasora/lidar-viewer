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
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ------------------------------------------------------------------ CRC（SDK2 の FastCRC と同じ）
const CRC32_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC32_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function crc16ccitt(b) { let c = 0xffff; for (let i = 0; i < b.length; i++) { c ^= b[i] << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; }

// ------------------------------------------------------------------ 定数（Livox SDK2 の define.h より）
const PORT = { detect: 56000, lidarCmd: 56100, lidarPoint: 56300, hostCmd: 56101, hostPush: 56201, hostPoint: 56301, hostImu: 56401 };
const CMD = { search: 0x0000, workModeControl: 0x0100, getInternalInfo: 0x0101 };
const WORK = { sampling: 0x01, idle: 0x02 };
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

// LiDAR 用の受け口は reuseAddr を付けない（同じ PC の livox_ros_driver2 などと黙って取り合わず、bind の失敗として分かるように）
function bindUdp(port, onMsg, onErr, { reuse = false, address } = {}) {
  const s = dgram.createSocket({ type: 'udp4', reuseAddr: reuse });
  s.on('message', onMsg);
  s.on('error', onErr);
  return new Promise((res, rej) => {
    const fail = e => { try { s.close(); } catch (x) { /* 閉じ済み */ } rej(e); };
    s.once('error', fail);
    s.bind(port, address, () => { s.off('error', fail); try { s.setBroadcast(true); } catch (e) { /* なくても動く */ } res(s); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isMulticast = ip => { const a = +ip.split('.')[0]; return a >= 224 && a <= 239; };
// 設定の問い合わせの返事（ret(1) 数(2) + [項目(2) 長さ(2) 値]...）を読む
function parseKv(d, off) {
  const out = new Map();
  if (d.length < off + 2) return out;
  const n = d.readUInt16LE(off);
  let o = off + 2;
  for (let i = 0; i < n && o + 4 <= d.length; i++) { const k = d.readUInt16LE(o), len = d.readUInt16LE(o + 2); if (o + 4 + len > d.length) break; out.set(k, Buffer.from(d.subarray(o + 4, o + 4 + len))); o += 4 + len; }
  return out;
}
const CANCELLED = 'CANCELLED';

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
  constructor() { super(); this.devices = new Map(); this.socks = {}; this.nicSocks = new Map(); this.pending = new Map(); this.active = null; this.restore = null; this.stat = { pts: 0, pkts: 0, bad: 0 }; }
  get isOpen() { return !!this.socks.det; }
  async open() {
    if (this.socks.det) return;
    const err = e => this.emit('log', `通信のエラー: ${e.message}`);
    try {
      this.socks.det = await bindUdp(PORT.detect, (m, r) => this.onDetect(m, r), err);
      this.socks.cmd = await bindUdp(PORT.hostCmd, (m, r) => this.onCmd(m, r), err);
      this.socks.pts = await bindUdp(PORT.hostPoint, (m, r) => this.onPoints(m, r), err);
      this.socks.push = await bindUdp(PORT.hostPush, () => {}, err);
    } catch (e) {
      this.closeSocks();
      const port = e.port || (String(e.message).match(/:(\d+)$/) || [])[1] || '';
      if (e.code === 'EADDRINUSE' || e.code === 'EACCES') throw new Error(`ポート ${port} がほかのソフト（livox_ros_driver2・Livox Viewer など）に使われています。そちらを止めてから、ライブのカードを開き直してください`);
      throw new Error(`LiDAR 用のポートを開けません（${e.message}）`);
    }
    this.searchTimer = setInterval(() => this.search(), 1000);
    this.search();
  }
  closeSocks() {
    clearInterval(this.searchTimer); this.searchTimer = null;
    for (const s of [...Object.values(this.socks), ...this.nicSocks.values()]) try { s.close(); } catch (e) { /* 閉じ済み */ }
    this.socks = {}; this.nicSocks = new Map();
    for (const w of this.pending.values()) w.done(null);
    if (this.devices.size) { this.devices.clear(); this.emit('devices', this.list()); }
  }
  // 閉じる前に、横取りした LiDAR の送り先を戻す
  async close() { await this.stop(); this.closeSocks(); }
  // 見つける: 探す命令を、全体と各ネットワークのブロードキャスト宛てに送る。
  // さらに NIC ごとに、その IP に bind したソケットからも 255.255.255.255 へ送る（既定の経路がない NIC からも出て、別のサブネットの LiDAR に届くように）
  search() {
    if (!this.socks.det) return;
    const pkt = packCmd(CMD.search);
    const nets = localNets();
    const targets = new Set(['255.255.255.255', ...nets.map(n => n.broadcast)]);
    for (const t of targets) this.socks.det.send(pkt, PORT.detect, t, () => {});
    for (const [a, s] of this.nicSocks) if (!nets.some(n => n.address === a)) { try { s.close(); } catch (e) { /* 閉じ済み */ } this.nicSocks.delete(a); }
    for (const n of nets) {
      const s = this.nicSocks.get(n.address);
      if (s) { if (s.ready) s.send(pkt, PORT.detect, '255.255.255.255', () => {}); continue; }
      const ns = dgram.createSocket({ type: 'udp4' });
      ns.on('message', (m, r) => this.onDetect(m, r)); ns.on('error', () => {});
      this.nicSocks.set(n.address, ns);
      try { ns.bind(0, n.address, () => { try { ns.setBroadcast(true); ns.ready = true; ns.send(pkt, PORT.detect, '255.255.255.255', () => {}); } catch (e) { /* 閉じ済み */ } }); } catch (e) { /* 次の回に */ }
    }
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
    // 送り手を確かめる: 返事に書かれた IP と、実際に送ってきた IP が同じものだけ（ほかの機械のなりすましを一覧に出さない）
    if (!sn || !/^[\x20-\x7e]+$/.test(sn) || (ip !== '0.0.0.0' && r.address !== ip)) return;
    const dev = { sn, ip: ip === '0.0.0.0' ? r.address : ip, type: d[1], model: DEV_TYPES[d[1]] || `種類 ${d[1]}`, cmdPort: d.readUInt16LE(22) || PORT.lidarCmd, seen: Date.now() };
    const old = this.devices.get(sn);
    this.devices.set(sn, dev);
    if (!old || old.ip !== dev.ip) this.emit('devices', this.list());
  }
  list() {
    const nets = localNets();
    return [...this.devices.values()].map(d => { const n = nets.find(x => sameNet(x, d.ip)); return { sn: d.sn, ip: d.ip, model: d.model, hostIp: n ? n.address : null }; });
  }
  // 命令を送り、同じ通し番号・同じ LiDAR からの返事を待つ（返事が来るまで何度か送る）。返事の中身か null を返す
  request(dev, cmdId, body, tries = 5, interval = 300, isCurrent = () => true) {
    return new Promise(resolve => {
      const s = seq++ & 0xffff;
      let timer = null, n = 0;
      const w = { ip: dev.ip, cmd: cmdId, done: d => { if (this.pending.get(s) !== w) return; this.pending.delete(s); clearTimeout(timer); resolve(d); } };
      this.pending.set(s, w);
      const pkt = packCmd(cmdId, body, 0, 0, s);
      const tick = () => {
        if (!this.socks.cmd || !isCurrent() || n++ >= tries) { w.done(null); return; }
        this.socks.cmd.send(pkt, dev.cmdPort, dev.ip, () => {});
        timer = setTimeout(tick, interval);
      };
      tick();
    });
  }
  // つなぐ: まず今の点群の送り先を問い合わせ（0x0101 で 0x0006 を読む）、ほかの PC に送っているなら確かめてから
  // 送り先をこのパソコンにし、形式（座標・高精度）と動作モード（通常）を設定する。止めるときに元へ戻す
  async start(sn, { takeover = false, isCurrent = () => true } = {}) {
    const dev = this.devices.get(sn);
    if (!dev) throw new Error('その LiDAR が見つかりません');
    const net = localNets().find(n => sameNet(n, dev.ip));
    if (!net) throw new Error(`この PC には LiDAR（${dev.ip}）と同じネットワークの IP がありません。有線 LAN の IP を ${dev.ip.split('.').slice(0, 3).join('.')}.50 などに設定してください`);
    await this.stop();
    if (!isCurrent()) throw new Error(CANCELLED);
    const keys = [KEY.pointDataHostIp, KEY.workMode, KEY.pclDataType];
    const qb = Buffer.alloc(4 + 2 * keys.length); qb.writeUInt16LE(keys.length, 0); keys.forEach((k, i) => qb.writeUInt16LE(k, 4 + 2 * i));
    const q = await this.request(dev, CMD.getInternalInfo, qb, 4, 250, isCurrent);
    if (!isCurrent()) throw new Error(CANCELLED);
    let orig = null;
    if (q && q.length >= 3 && q[0] === 0) {
      const kv = parseKv(q, 1), h = kv.get(KEY.pointDataHostIp);
      orig = { host: h && h.length >= 8 ? h : null, work: kv.has(KEY.workMode) ? kv.get(KEY.workMode)[0] : null, pcl: kv.has(KEY.pclDataType) ? kv.get(KEY.pclDataType)[0] : null };
    }
    const origIp = orig && orig.host ? [...orig.host.subarray(0, 4)].join('.') : null;
    const other = !!origIp && origIp !== '0.0.0.0' && !localNets().some(n => n.address === origIp);
    if (other && !takeover) throw new Error(`TAKEOVER:${origIp}${isMulticast(origIp) ? '（マルチキャスト）' : ''}`);
    this.active = { ...dev, hostIp: net.address };
    this.restore = { other, host: other ? orig.host : null, work: orig ? orig.work : null, pcl: orig ? orig.pcl : null, ip: origIp };
    this.batch = new Batcher(b => this.emit('points', b));
    this.stat = { pts: 0, pkts: 0, bad: 0, t0: Date.now(), last: 0 };
    const host = Buffer.alloc(8); ipBytes(net.address).copy(host, 0); host.writeUInt16LE(PORT.hostPoint, 4); host.writeUInt16LE(PORT.lidarPoint, 6);
    const body = kvList([[KEY.pclDataType, Buffer.from([1])], [KEY.pointDataHostIp, host], [KEY.workMode, Buffer.from([WORK.sampling])]]);
    const ack = await this.request(dev, CMD.workModeControl, body, 10, 300, isCurrent);
    if (!isCurrent()) throw new Error(CANCELLED);
    let warn = null;
    if (!ack) warn = q ? 'LiDAR から設定の返事がありません（点群が届けばそのまま表示します）'
      : 'LiDAR から返事がありません。同じパソコンで livox_ros_driver2 などが動いていれば止めてください（点群が届けばそのまま表示します）';
    else if (ack.length >= 3 && ack[0] !== 0) warn = `LiDAR が設定を受け付けませんでした（返事 ${ack[0]}、項目 0x${ack.readUInt16LE(1).toString(16)}）`;
    return { ...this.active, warn, tookFrom: other ? origIp : null, origUnknown: !orig };
  }
  // 止める: 横取りした送り先を元へ戻す。もともとほかの PC へ送っていなければ、LiDAR を待機（IDLE）にして送信を止める
  async stop() {
    if (this.batch) { this.batch.close(); this.batch = null; }
    const a = this.active, rs = this.restore;
    this.active = null; this.restore = null;
    if (!a || !rs || !this.socks.cmd) return null;
    const settable = [WORK.sampling, WORK.idle, 0x09];
    let items;
    if (rs.other) {
      items = [[KEY.pointDataHostIp, rs.host]];
      if ([1, 2, 3].includes(rs.pcl)) items.push([KEY.pclDataType, Buffer.from([rs.pcl])]);
      items.push([KEY.workMode, Buffer.from([settable.includes(rs.work) ? rs.work : WORK.sampling])]);
    } else items = [[KEY.workMode, Buffer.from([rs.work === WORK.idle || rs.work === 0x09 ? rs.work : WORK.idle])]];
    const r = await this.request(a, CMD.workModeControl, kvList(items), 4, 250);
    if (!r || (r.length && r[0] !== 0)) { this.emit('log', rs.other ? `LiDAR の点群の送り先を ${rs.ip} に戻せませんでした（LiDAR が返事をしません）。ロボット側のドライバを起動し直してください` : 'LiDAR を待機にできませんでした（返事がありません）'); return false; }
    return true;
  }
  onCmd(m, r) {
    const p = parseCmd(m);
    if (!p || p.type !== 1) return;
    const w = this.pending.get(p.seq & 0xffff);
    // 送り手を確かめる: 待っている命令と同じ種類・同じ通し番号で、その LiDAR の IP から来た返事だけ
    if (w && w.cmd === p.cmd && r && r.address === w.ip && p.seq <= 0xffff) w.done(Buffer.from(p.data));
  }
  // 点群の箱: 版 長さ 時間間隔 点数 箱の番号 フレーム番号 種類 時刻の種類 予備12 CRC32 時刻8 = 36 バイト + 点
  onPoints(m, r) {
    if (!this.batch || !this.active || m.length < 36) return;
    // 表示中の LiDAR から来た箱だけを使う（前に表示した LiDAR が送り続けている点や、ほかの機械からの箱を混ぜない）
    if (r && r.address !== this.active.ip) { this.stat.other = (this.stat.other || 0) + 1; return; }
    const n = m.readUInt16LE(5), type = m[10];
    // 版（0）・箱の長さ・点数と長さが合う箱だけを使う（でたらめな UDP を点にしない）
    const size = { 1: 14, 2: 8, 3: 10 }[type];
    if (m[0] !== 0 || m.readUInt16LE(1) !== m.length || !size || 36 + n * size !== m.length) { this.stat.bad++; return; }
    this.stat.pkts++; this.stat.last = Date.now();
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
  if (!Buffer.isBuffer(buf) || buf.length < 8 || buf.toString('latin1', 0, 4) !== 'PCV1') return null;
  const n = buf.readUInt32LE(4);
  if (buf.length !== 8 + 13 * n) return null; // 点数と長さが合わない箱は捨てる（壊れた・悪意のあるデータで落ちないように）
  const copy = Buffer.from(buf); // float32 の並びをそろえるために写す
  return { n, xyz: new Float32Array(copy.buffer, copy.byteOffset + 8, 3 * n).slice(), refl: new Uint8Array(copy.buffer, copy.byteOffset + 8 + 12 * n, n).slice() };
}

const MAX_VIEWERS = 4;        // 同時に見られる台数
const MAX_FRAME = 64 << 20;  // 受け取る 1 通の大きさの上限（見る側）
class Sharer {
  constructor() { this.server = null; this.step = 1; this.code = null; this.bad = new Map(); }
  // 合言葉を確かめる。同じ相手が 5 回まちがえたら 1 分は受け付けない（4 桁を総当たりされないように）
  verify(req) {
    const ip = req.socket.remoteAddress || '';
    const b = this.bad.get(ip);
    if (b && b.n >= 5 && Date.now() - b.t < 60000) return [false, 429];
    if (this.server && this.server.clients.size >= MAX_VIEWERS) return [false, 503];
    let code = '';
    try { code = new URL(req.url || '/', 'http://x').searchParams.get('code') || ''; } catch (e) { /* 読めなければ空 */ }
    if (!this.code || code !== this.code) { this.bad.set(ip, { n: (b && Date.now() - b.t < 60000 ? b.n : 0) + 1, t: Date.now() }); return [false, 401]; }
    this.bad.delete(ip);
    return [true];
  }
  // 待ちの途中で stop() されたら、待ちを CANCELLED で終える（返らないまま残らないように）
  wait(p) {
    return new Promise((res, rej) => {
      const g = this.gen;
      this.cancel = () => rej(new Error(CANCELLED));
      p.then(v => { this.cancel = null; if (g !== this.gen) rej(new Error(CANCELLED)); else res(v); }, e => { this.cancel = null; rej(e); });
    });
  }
  async start(info) {
    this.stop();
    this.info = info;
    this.server = new WebSocket.Server({ port: 0, maxPayload: 1024, verifyClient: (x, cb) => { const [ok, st] = this.verify(x.req); cb(ok, st); } });
    const srv = this.server;
    await this.wait(new Promise((res, rej) => { srv.once('listening', res); srv.once('error', rej); }));
    this.port = this.server.address().port;
    const beacon = this.beacon = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    beacon.on('error', () => {});
    await this.wait(new Promise(r => beacon.bind(0, r)));
    this.beacon.setBroadcast(true);
    const send = () => {
      const msg = Buffer.from(JSON.stringify({ app: 'pcd-viewer', v: 2, auth: 1, hid: this.hostId, name: os.hostname(), port: this.port, model: info.model, sn: info.sn, id: this.id ||= Math.random().toString(36).slice(2) }));
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
    this.gen = (this.gen || 0) + 1;
    if (this.cancel) { const c = this.cancel; this.cancel = null; c(); }
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
    const sock = await bindUdp(BEACON_PORT, (m, r) => {
      let j; try { j = JSON.parse(m.toString()); } catch (e) { return; }
      if (!j || j.app !== 'pcd-viewer' || !Number.isInteger(j.port) || j.port < 1 || j.port > 65535) return;
      if (this.selfId && j.id === this.selfId) return; // 自分の配信は出さない
      const key = `${r.address}:${j.port}`;
      const isNew = !this.peers.has(key);
      if (isNew && this.peers.size >= 32) return; // 知らせの洪水で一覧が増え続けないように
      const str = (v, n) => String(v ?? '').slice(0, n);
      this.peers.set(key, { key, address: r.address, port: j.port, name: str(j.name, 64), model: str(j.model, 32), sn: str(j.sn, 32), hid: str(j.hid, 64), auth: !!j.auth, seen: Date.now() });
      if (isNew) this.emit('peers', this.list());
    }, () => {}, { reuse: true }); // 配信の知らせは同じ PC の別の LiDAR Viewer とも聞けるよう共有のまま
    if (this.sock) { sock.close(); return; } // 同時に開かれたとき
    this.sock = sock;
    clearInterval(this.timer);
    this.timer = setInterval(() => { const now = Date.now(); let ch = false; for (const [k, p] of this.peers) if (now - p.seen > 4000) { this.peers.delete(k); ch = true; } if (ch) this.emit('peers', this.list()); }, 1000);
  }
  list() { return [...this.peers.values()].map(({ key, address, port, name, model, sn, auth }) => ({ key, address, port, name, model, sn, auth })); }
  close() { clearInterval(this.timer); if (this.sock) try { this.sock.close(); } catch (e) { /* 閉じ済み */ } this.sock = null; if (this.peers.size) { this.peers.clear(); this.emit('peers', this.list()); } }
}

// ------------------------------------------------------------------ まとめ役（main.js から使う）
class Live extends EventEmitter {
  // dataDir: 合言葉などを覚えておく場所（アプリの設定の置き場所）
  constructor(dataDir = null) {
    super();
    this.lidar = new LivoxLink(); this.sharer = new Sharer(); this.finder = new PeerFinder();
    this.store = loadStore(dataDir);
    this.sharer.code = this.store.data.shareCode; this.sharer.hostId = this.store.data.hostId;
    this.mode = null; // 'lidar' | 'peer' | null
    this.lidar.on('devices', l => this.emit('state', this.state()));
    this.lidar.on('log', t => this.emit('log', t));
    this.finder.on('peers', () => this.emit('state', this.state()));
    this.lidar.on('points', b => { this.count += b.n; this.emit('points', b); this.sharer.send(b); });
    this.count = 0; this.gen = 0; this.lastOpen = 0;
    this.rateTimer = setInterval(() => this.tick(), 1000);
  }
  // 毎秒: 点数の集計・点が届かないときの案内・使っていないポートを放す
  tick() {
    this.rate = this.count; this.count = 0;
    const st = this.lidar.stat, now = Date.now();
    let hint = null;
    if (this.mode === 'lidar' && st.t0 && now - (st.last || st.t0) > 4000) {
      hint = (st.last ? '点が届かなくなりました。' : 'LiDAR は見つかりましたが、点が届いていません。')
        + (process.platform === 'win32'
          ? 'Windows のファイアウォールが受信を止めている可能性があります。「Windows セキュリティ」→「ファイアウォールとネットワーク保護」→「ファイアウォールによるアプリケーションの許可」→「設定の変更」で「LiDAR Viewer」（「Electron」と出ることもあります）の「プライベート」と「パブリック」の両方にチェックを入れ、ライブを止めてもう一度表示してください（LiDAR を直結した有線 LAN はパブリックになりやすい）。'
          : 'ファイアウォール（ufw など）で UDP 56301 の受信を許可してください。')
        + '同じパソコンで livox_ros_driver2 などが動いていれば止めてください。';
    }
    const ch = hint !== this.lidarHint; this.lidarHint = hint;
    if (this.mode || ch) this.emit('state', this.state());
    // ライブのカードが閉じていて（画面が数秒ごとに open を呼ばなくなって）何も表示していなければ、LiDAR 用・配信を探すポートを放す
    if (!this.mode && !this.busy && (this.lidar.isOpen || this.finder.sock) && now - this.lastOpen > 12000) {
      this.lidar.closeSocks(); this.finder.close(); this.openErrors = [];
      this.emit('state', this.state());
    }
  }
  async open() {
    this.lastOpen = Date.now();
    if (this.opening) return this.opening;
    this.opening = (async () => {
      const errs = [];
      try { await this.lidar.open(); } catch (e) { errs.push(e.message); }
      try { await this.finder.open(); } catch (e) { errs.push(`配信を探せません（${e.message}）`); }
      this.openErrors = errs;
      return this.state();
    })();
    try { return await this.opening; } finally { this.opening = null; }
  }
  state() {
    return {
      devices: this.lidar.list(), peers: this.finder.list(), errors: this.openErrors || [],
      mode: this.mode, source: this.source || null, rate: this.rate || 0,
      sharing: !!this.sharer.server, shareClients: this.sharer.clients(), shareStep: this.sharer.step, shareCode: this.sharer.code,
      peerError: this.peerError || null, warn: this.warn || null, lidarHint: this.lidarHint || null,
      nets: localNets().map(n => `${n.name} ${n.address}`),
    };
  }
  // takeover: ほかの PC に送っている LiDAR を、確かめたうえで横取りする
  // 待っている間にほかの操作（表示・止める）が来たら、古い方は何も変えずに CANCELLED で終える
  async startLidar(sn, takeover = false) {
    const g = await this.stopFor();
    this.busy = true;
    try {
      const a = await this.lidar.start(sn, { takeover, isCurrent: () => g === this.gen });
      if (g !== this.gen) throw new Error(CANCELLED);
      this.mode = 'lidar'; this.source = { kind: 'lidar', sn: a.sn, ip: a.ip, model: a.model, hostIp: a.hostIp, tookFrom: a.tookFrom };
      this.warn = a.warn; this.lidarHint = null;
      return this.state();
    } finally { if (g === this.gen) this.busy = false; }
  }
  // 配信を見る。code を省くと、前に通った合言葉を使う。合言葉が要るのに分からなければ NEED_CODE の誤りを返す
  async startPeer(key, code) {
    const g = await this.stopFor();
    if (g !== this.gen) throw new Error(CANCELLED);
    this.peerError = null;
    const p = this.finder.peers.get(key);
    if (!p) throw new Error('その配信が見つかりません');
    if (code != null && !/^\d{4}$/.test(String(code))) throw new Error('合言葉は 4 桁の数字です');
    const known = p.hid ? this.store.data.peerCodes[p.hid] : null;
    const use = code != null ? String(code) : known;
    if (p.auth && !use) throw new Error('NEED_CODE');
    this.mode = 'peer'; this.source = { kind: 'peer', name: p.name, model: p.model, address: p.address };
    const ws = new WebSocket(`ws://${p.address}:${p.port}/?code=${encodeURIComponent(use || '')}`, { maxPayload: MAX_FRAME, handshakeTimeout: 5000 });
    ws.binaryType = 'nodebuffer';
    this.ws = ws;
    let failed = null;
    ws.on('open', () => { if (p.hid && use) { this.store.data.peerCodes[p.hid] = use; this.store.save(); } });
    ws.on('message', d => {
      // 壊れた・悪意のあるデータでも主プロセスを落とさない
      try { const b = decodeBatch(d); if (b) { this.count += b.n; this.emit('points', b); } } catch (e) { /* その 1 通は捨てる */ }
    });
    ws.on('unexpected-response', (req, res) => {
      const st = res.statusCode;
      failed = st === 401 ? { needCode: true, msg: '合言葉が違います。配信している画面に出ている 4 桁を入れてください' }
        : st === 503 ? { msg: `その配信はいっぱいです（同時に見られるのは ${MAX_VIEWERS} 台まで）` }
          : st === 429 ? { msg: '合言葉を何度もまちがえたので、1 分たってからやり直してください' }
            : { msg: `配信につながりません（${st}）` };
      if (st === 401 && p.hid) { delete this.store.data.peerCodes[p.hid]; this.store.save(); }
      try { req.destroy(); } catch (e) { /* 閉じ済み */ }
      ws.emit('close');
    });
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null; this.mode = null; this.source = null;
      if (failed) this.peerError = { key, ...failed };
      this.emit('log', failed ? failed.msg : '配信が終わりました');
      this.emit('state', this.state());
    });
    ws.on('error', e => { if (!failed) this.emit('log', `配信につながりません（${e.message}）`); });
    return this.state();
  }
  async setShare(on, step = 1) {
    this.sharer.step = [1, 2, 4].includes(+step) ? +step : 1; // 画面から来る値を確かめる（0 や負の数で落ちないように）
    if (!on) { this.sharer.stop(); return this.state(); }
    if (this.mode !== 'lidar') throw new Error('配信できるのは、このパソコンにつながった LiDAR だけです');
    if (!this.sharer.server) {
      // 配信を始める途中で「止める」が来たら、待ちを解いて「配信していない」状態を返す（返らないまま残さない）
      try { await this.sharer.start(this.source); this.finder.selfId = this.sharer.id; } catch (e) { this.sharer.stop(); if (e.message !== CANCELLED) throw e; }
    }
    return this.state();
  }
  // 今の表示を止める（LiDAR の送り先を戻すのを待つ）。止めた時点の世代を返す
  async stopFor() {
    const g = ++this.gen;
    this.sharer.stop();
    if (this.ws) { const w = this.ws; this.ws = null; w.close(); }
    this.mode = null; this.source = null; this.warn = null; this.lidarHint = null;
    await this.lidar.stop();
    return g;
  }
  async stopAll() {
    const g = await this.stopFor();
    if (g === this.gen) this.busy = false;
    this.lastOpen = Date.now(); // 止めたあと少しのあいだは一覧のためにポートを開いておく
    return this.state();
  }
  // アプリの終了: LiDAR の送り先を戻してからポートを閉じる（何度呼んでも同じ約束を返す）
  close() {
    if (!this.closing) {
      clearInterval(this.rateTimer);
      const done = (async () => { await this.stopFor(); await this.lidar.close(); this.finder.close(); })();
      this.closing = Promise.race([done, sleep(2000)]).catch(() => {}).then(() => { this.closed = true; });
    }
    return this.closing;
  }
}

// 合言葉などを覚えておく小さなファイル（live.json）
function loadStore(dir) {
  const file = dir ? path.join(dir, 'live.json') : null;
  let data = {};
  try { if (file) data = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { data = {}; }
  if (!/^\d{4}$/.test(data.shareCode || '')) data.shareCode = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  if (typeof data.hostId !== 'string' || !data.hostId) data.hostId = crypto.randomUUID();
  if (!data.peerCodes || typeof data.peerCodes !== 'object') data.peerCodes = {};
  const store = { data, save() { try { if (file) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); } } catch (e) { /* 覚えられなくても動く */ } } };
  store.save();
  return store;
}

module.exports = { Live, packCmd, parseCmd, crc32, crc16ccitt, PORT, CMD, KEY, WORK, kvList, parseKv, encodeBatch, decodeBatch, localNets };
