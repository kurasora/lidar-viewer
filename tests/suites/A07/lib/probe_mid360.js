// probe_mid360.js — 本物の MID-360 の振る舞いを調べる道具（アプリとは独立。実験室での確認用、A07）
//   node probe_mid360.js [--ip LiDARのIP] [--host このPCのIP] [--stream 秒] [--types] [--query-only] [--no-restore] [--out 結果.json]
//   ・LiDAR Viewer・livox_ros_driver2・Livox Viewer を閉じてから使う（同じポートを使うため）
//   ・調べること: 検出の返事がブロードキャストかユニキャストか（Linux のみ判別）、返事の中身、設定の問い合わせ（0x0101）で
//     今の点群の送り先（0x0006）など、点群の箱（版・長さ・点数・型・udp_cnt の抜け・時刻・CRC32）、型 2/3 の点
//   ・最後に点群の送り先と点の型を元に戻す（--no-restore で戻さない＝電源を入れ直して設定が残るかを見るとき）
'use strict';
const dgram = require('node:dgram');
const os = require('node:os');
const fs = require('node:fs');
const args = process.argv.slice(2); const opt = k => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function crc16(buf) { let c = 0xffff; for (const b of buf) { c ^= b << 8; for (let k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; }
const T32 = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); T32[n] = c >>> 0; }
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = T32[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
let seqNo = 1;
function pack(cmd, data = Buffer.alloc(0)) { const b = Buffer.alloc(24 + data.length); b[0] = 0xaa; b.writeUInt16LE(b.length, 2); b.writeUInt32LE(seqNo++ & 0xffff, 4); b.writeUInt16LE(cmd, 8); b.writeUInt16LE(crc16(b.subarray(0, 18)), 18); b.writeUInt32LE(data.length ? crc32(data) : 0, 20); data.copy(b, 24); return b; }
function parse(b) { if (b.length < 24 || b[0] !== 0xaa) return null; const len = b.readUInt16LE(2); if (len < 24 || len > b.length) return null; const data = b.subarray(24, len); return { ver: b[1], seq: b.readUInt32LE(4), cmd: b.readUInt16LE(8), type: b[10], sender: b[11], crc16ok: crc16(b.subarray(0, 18)) === b.readUInt16LE(18), crc32ok: (data.length ? crc32(data) : 0) === b.readUInt32LE(20), data }; }
const nets = () => Object.entries(os.networkInterfaces()).flatMap(([n, l]) => (l || []).filter(a => a.family === 'IPv4' && !a.internal).map(a => { const ip = a.address.split('.').map(Number), m = a.netmask.split('.').map(Number); return { name: n, address: a.address, netmask: a.netmask, broadcast: ip.map((x, i) => (x & m[i]) | (~m[i] & 255)).join('.') }; }));
const bind = (port, addr) => new Promise(res => { const s = dgram.createSocket({ type: 'udp4', reuseAddr: true }); s.once('error', e => res({ err: e.message })); s.bind(port, addr, () => { try { s.setBroadcast(true); } catch (e) { /**/ } res({ s }); }); });
const KEYNAME = { 0x0000: 'pcl_data_type', 0x0001: 'pattern_mode', 0x0004: 'lidar_ipcfg', 0x0005: 'state_info_host_ipcfg', 0x0006: 'pointcloud_host_ipcfg', 0x0007: 'imu_host_ipcfg', 0x001a: 'work_tgt_mode', 0x001c: 'imu_data_en', 0x8000: 'sn', 0x8002: 'version_app', 0x8006: 'cur_work_state' };
function decodeKv(k, v) {
  if (k === 0x0004) return { ip: [...v.subarray(0, 4)].join('.'), mask: [...v.subarray(4, 8)].join('.'), gw: [...v.subarray(8, 12)].join('.') };
  if (k === 0x0005 || k === 0x0006 || k === 0x0007) return { hostIp: [...v.subarray(0, 4)].join('.'), hostPort: v.readUInt16LE(4), lidarPort: v.readUInt16LE(6) };
  if (k === 0x8000) return v.toString('latin1').replace(/\0.*$/, '');
  if (k === 0x8002) return [...v].join('.');
  return v.length === 1 ? v[0] : v.toString('hex');
}

(async () => {
  const R = { when: new Date().toISOString(), platform: process.platform, node: process.version, nets: nets(), notes: [] };
  const anyS = await bind(56000, '0.0.0.0');
  if (anyS.err) { console.log(JSON.stringify({ fatal: '56000 を開けません（ほかのソフトが使っていませんか）: ' + anyS.err })); process.exit(1); }
  const bc = process.platform === 'linux' ? await bind(56000, '255.255.255.255') : { err: 'Linux 以外は判別しない' };
  const cmdS = await bind(56101, '0.0.0.0'); if (cmdS.err) { console.log(JSON.stringify({ fatal: '56101: ' + cmdS.err })); process.exit(1); }
  const found = new Map(); const replies = [];
  const onDet = via => (m, r) => { const p = parse(m); if (!p || p.cmd !== 0 || p.type !== 1) return; const d = p.data; const rec = { via, from: `${r.address}:${r.port}`, ret: d[0], devType: d[1], sn: d.subarray(2, 18).toString('latin1').replace(/\0.*$/, ''), lidarIp: [...d.subarray(18, 22)].join('.'), cmdPort: d.length >= 24 ? d.readUInt16LE(22) : null, dataLen: d.length, crc16ok: p.crc16ok, crc32ok: p.crc32ok, seq: p.seq, ver: p.ver, sender: p.sender }; replies.push(rec); found.set(rec.sn, rec); };
  anyS.s.on('message', onDet('any')); if (bc.s) bc.s.on('message', onDet('broadcast-socket'));
  const want = opt('--ip');
  for (let i = 0; i < 3; i++) { const pk = pack(0x0000); for (const t of new Set(['255.255.255.255', ...nets().map(n => n.broadcast)])) anyS.s.send(pk, 56000, t, e => { if (e) R.notes.push(`検出の送信 ${t}: ${e.message}`); }); await sleep(1000); }
  // 同じ返事が any と broadcast の両方に来れば「ブロードキャストで返事」、any だけなら「ユニキャスト」
  R.detect = [...found.values()].map(f => ({ ...f, replyIsBroadcast: bc.s ? replies.some(r => r.sn === f.sn && r.via === 'broadcast-socket') : '不明（Linux 以外）', repliesSeen: replies.filter(r => r.sn === f.sn).length }));
  const dev = want ? R.detect.find(d => d.lidarIp === want || d.from.startsWith(want + ':')) : R.detect[0];
  if (!dev) { R.result = 'LiDAR が見つかりません'; console.log(JSON.stringify(R, null, 1)); process.exit(2); }
  const lidarIp = dev.lidarIp === '0.0.0.0' ? dev.from.split(':')[0] : dev.lidarIp;
  const hostIp = opt('--host') || (nets().find(n => n.address.split('.').slice(0, 3).join('.') === lidarIp.split('.').slice(0, 3).join('.')) || {}).address;
  R.target = { lidarIp, hostIp, cmdPort: dev.cmdPort || 56100 };
  // ---- 問い合わせ・設定
  let lastAck = null; cmdS.s.on('message', m => { const p = parse(m); if (p && p.type === 1) lastAck = p; });
  async function command(cmd, data, tries = 5) { for (let i = 0; i < tries; i++) { lastAck = null; const pk = pack(cmd, data); cmdS.s.send(pk, R.target.cmdPort, lidarIp); for (let k = 0; k < 10 && !(lastAck && lastAck.cmd === cmd); k++) await sleep(30); if (lastAck && lastAck.cmd === cmd) return lastAck; } return null; }
  async function query(keys) {
    const d = Buffer.alloc(4 + 2 * keys.length); d.writeUInt16LE(keys.length, 0); keys.forEach((k, i) => d.writeUInt16LE(k, 4 + 2 * i));
    const a = await command(0x0101, d); if (!a) return null;
    const out = { ret: a.data[0], seqEcho: a.seq === (seqNo - 1), crcOk: a.crc16ok && a.crc32ok }; const n = a.data.readUInt16LE(1); let o = 3;
    for (let i = 0; i < n && o + 4 <= a.data.length; i++) { const k = a.data.readUInt16LE(o), l = a.data.readUInt16LE(o + 2), v = a.data.subarray(o + 4, o + 4 + l); out[KEYNAME[k] || ('0x' + k.toString(16))] = decodeKv(k, v); o += 4 + l; }
    return out;
  }
  const kv = items => { const parts = [Buffer.alloc(4)]; parts[0].writeUInt16LE(items.length, 0); for (const [k, v] of items) { const h = Buffer.alloc(4); h.writeUInt16LE(k, 0); h.writeUInt16LE(v.length, 2); parts.push(h, v); } return Buffer.concat(parts); };
  const hostCfg = (ip, port) => { const b = Buffer.alloc(8); Buffer.from(ip.split('.').map(Number)).copy(b); b.writeUInt16LE(port, 4); b.writeUInt16LE(56300, 6); return b; };
  R.before = await query([0x0000, 0x0001, 0x0004, 0x0005, 0x0006, 0x0007, 0x001a, 0x001c, 0x8000, 0x8002, 0x8006]);
  if (opt('--query-only')) { console.log(JSON.stringify(R, null, 1)); if (opt('--out')) fs.writeFileSync(opt('--out'), JSON.stringify(R, null, 1)); process.exit(0); }
  // ---- 点群を受ける（アプリと同じ設定: 型 1・送り先 = この PC:56301・SAMPLING）
  const ptsS = await bind(56301, '0.0.0.0'); if (ptsS.err) { R.result = '56301: ' + ptsS.err; console.log(JSON.stringify(R, null, 1)); process.exit(1); }
  const secs = +(opt('--stream') || 5);
  async function capture(type, s) {
    const ack = await command(0x0100, kv([[0x0000, Buffer.from([type])], [0x0006, hostCfg(hostIp, 56301)], [0x001a, Buffer.from([1])]]));
    const st = { type, ack: ack ? { ret: ack.data[0], errKey: ack.data.length >= 3 ? ack.data.readUInt16LE(1) : null, seqEcho: ack.seq === (seqNo - 1) } : null, pkts: 0, pts: 0, zeros: 0, crcBad: 0, lenMismatch: 0, types: {}, dotNums: {}, versions: {}, timeTypes: {}, udpGaps: 0, udpReorders: 0, tsBackwards: 0, frameCnts: new Set(), sources: {}, refl: [255, 0], tags: {} };
    let lastUdp = null, lastTs = null;
    const on = (m, r) => {
      st.pkts++; st.sources[`${r.address}:${r.port}`] = (st.sources[`${r.address}:${r.port}`] || 0) + 1;
      if (m.length < 36) return;
      const ver = m[0], len = m.readUInt16LE(1), n = m.readUInt16LE(5), udp = m.readUInt16LE(7), fc = m[9], dt = m[10], tt = m[11], crc = m.readUInt32LE(24), ts = m.readBigUInt64LE(28);
      st.versions[ver] = (st.versions[ver] || 0) + 1; st.types[dt] = (st.types[dt] || 0) + 1; st.dotNums[n] = (st.dotNums[n] || 0) + 1; st.timeTypes[tt] = (st.timeTypes[tt] || 0) + 1; st.frameCnts.add(fc);
      if (len !== m.length) st.lenMismatch++;
      if (crc32(m.subarray(28)) !== crc) st.crcBad++;
      if (lastUdp !== null) { const d = (udp - lastUdp) & 0xffff; if (d === 0 || d > 0x8000) st.udpReorders++; else if (d > 1) st.udpGaps += d - 1; }
      lastUdp = udp; if (lastTs !== null && ts < lastTs) st.tsBackwards++; lastTs = ts;
      const sz = { 1: 14, 2: 8, 3: 10 }[dt];
      if (sz) for (let i = 0, o = 36; i < n && o + sz <= m.length; i++, o += sz) {
        st.pts++;
        const zero = dt === 1 ? (m.readInt32LE(o) === 0 && m.readInt32LE(o + 4) === 0 && m.readInt32LE(o + 8) === 0) : dt === 2 ? (m.readInt16LE(o) === 0 && m.readInt16LE(o + 2) === 0 && m.readInt16LE(o + 4) === 0) : m.readUInt32LE(o) === 0;
        if (zero) st.zeros++;
        const rf = m[o + sz - 2], tag = m[o + sz - 1]; st.refl[0] = Math.min(st.refl[0], rf); st.refl[1] = Math.max(st.refl[1], rf); st.tags[tag] = (st.tags[tag] || 0) + 1;
      }
    };
    ptsS.s.on('message', on); await sleep(s * 1000); ptsS.s.off('message', on);
    st.ptsPerSec = Math.round(st.pts / s); st.frameCnts = st.frameCnts.size; st.udpLossPct = +(100 * st.udpGaps / Math.max(1, st.pkts + st.udpGaps)).toFixed(3);
    return st;
  }
  R.stream = [await capture(1, secs)];
  if (opt('--types')) { R.stream.push(await capture(2, 2)); R.stream.push(await capture(3, 2)); }
  R.during = await query([0x0000, 0x0006, 0x001a, 0x8006]);
  // ---- 元に戻す
  if (!opt('--no-restore') && R.before && R.before.pointcloud_host_ipcfg) {
    const b = R.before.pointcloud_host_ipcfg; const h = Buffer.alloc(8); Buffer.from(b.hostIp.split('.').map(Number)).copy(h); h.writeUInt16LE(b.hostPort, 4); h.writeUInt16LE(b.lidarPort, 6);
    const ack = await command(0x0100, kv([[0x0000, Buffer.from([R.before.pcl_data_type || 1])], [0x0006, h]]));
    R.restored = { ack: ack && ack.data[0], to: b };
    R.after = await query([0x0000, 0x0006]);
  } else R.notes.push('元に戻していません（--no-restore）。LiDAR の電源を入れ直してから --query-only で送り先が残っているか確かめてください');
  console.log(JSON.stringify(R, null, 1));
  if (opt('--out')) fs.writeFileSync(opt('--out'), JSON.stringify(R, null, 1));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ fatal: e.stack })); process.exit(1); });
