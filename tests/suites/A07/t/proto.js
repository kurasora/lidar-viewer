// proto.js — 通信手順の照合（Node で live.js を直接動かす。a072 の中で実行し、にせ LiDAR は a071）
//   enode t/proto.js   （ip netns exec a072 の中で）
'use strict';
const H = require('../lib/h.js');
const { check, info, sleep } = H;
const L = require(H.LIVEJS);
const uncaught = [];
process.on('uncaughtException', e => { uncaught.push(String(e && e.stack || e)); console.log('UNCAUGHT', e && e.message); });

function gridCheck(b, type) {
  // grid の点: x=(1000+a)mm, y=-(2000+b)mm, z=300+10c mm, r=g%256（mid360sim.js の gridPoint）
  let bad = 0, n = 0, first = null;
  for (let i = 0; i < b.n; i++) {
    const x = b.xyz[3 * i], y = b.xyz[3 * i + 1], z = b.xyz[3 * i + 2], r = b.refl[i];
    n++;
    let ok;
    if (type === 1) {
      const xm = Math.round(x * 1000), ym = Math.round(y * 1000), zm = Math.round(z * 1000);
      ok = x === Math.fround(xm / 1000) && y === Math.fround(ym / 1000) && z === Math.fround(zm / 1000)
        && xm >= 1000 && xm <= 1999 && ym <= -2000 && ym >= -2776 && zm >= 300 && zm <= 420 && (zm - 300) % 10 === 0
        && ((xm - 1000) % 8) === (r % 8); // g%1000 と g%256 は 8 で割った余りが一致するはず
    } else if (type === 2) {
      const xc = Math.round(x * 100), yc = Math.round(y * 100), zc = Math.round(z * 100);
      ok = x === Math.fround(xc / 100) && y === Math.fround(yc / 100) && z === Math.fround(zc / 100) && xc >= 100 && xc <= 200 && yc <= -200 && yc >= -278 && zc >= 30 && zc <= 42;
    } else {
      ok = x > 0.99 && x < 2.01 && y < -1.99 && y > -2.79 && z > 0.29 && z < 0.43;
    }
    if (!ok) { bad++; if (!first) first = { i, x, y, z, r }; }
  }
  return { n, bad, first };
}

(async () => {
  // ---------------------------------------------------------------- 1. ネットワークなしの照合
  check('A1-crc16-check', L.crc16ccitt(Buffer.from('123456789')) === 0x29b1, '0x' + L.crc16ccitt(Buffer.from('123456789')).toString(16) + '（CRC-16/CCITT-FALSE の検査値は 0x29b1）');
  check('A1-crc32-check', L.crc32(Buffer.from('123456789')) === 0xcbf43926, '0x' + L.crc32(Buffer.from('123456789')).toString(16));
  const p0 = L.packCmd(0x0000, Buffer.alloc(0), 0, 0, 0x12345);
  check('A1-pack-search', p0.length === 24 && p0[0] === 0xaa && p0[1] === 0 && p0.readUInt16LE(2) === 24 && p0.readUInt32LE(4) === 0x12345 && p0.readUInt16LE(8) === 0 && p0[10] === 0 && p0[11] === 0 && p0.readUInt32LE(20) === 0, p0.toString('hex'));
  info('A1-seq-mask', 'packCmd は seqNo 指定時は & 0xffff しない（SDK2 は & 0xFFFF）。自動採番時は & 0xffff: ' + L.packCmd(0, Buffer.alloc(0)).readUInt32LE(4));
  const pd = L.packCmd(0x0100, Buffer.from([1, 2, 3]));
  check('A1-pack-data', pd.readUInt16LE(2) === 27 && pd.readUInt32LE(20) === L.crc32(Buffer.from([1, 2, 3])) && L.parseCmd(pd).data.equals(Buffer.from([1, 2, 3])), pd.toString('hex'));
  // parseCmd の境界
  const junk = [Buffer.alloc(0), Buffer.alloc(23), Buffer.from([0xab, ...Buffer.alloc(23)]), (() => { const b = Buffer.from(p0); b.writeUInt16LE(500, 2); return b; })(), (() => { const b = Buffer.from(p0); b[18] ^= 1; return b; })()];
  check('A1-parse-reject', junk.every(b => L.parseCmd(b) === null), junk.map(b => L.parseCmd(b) === null));
  const shortLen = Buffer.from(p0); shortLen.writeUInt16LE(5, 2); shortLen.writeUInt16LE(L.crc16ccitt(shortLen.subarray(0, 18)), 18);
  info('A1-parse-len<24', { result: L.parseCmd(shortLen), note: '長さ欄が 24 未満でも受け付ける（SDK2 は 24 未満を捨てる）。data は空になるだけで害はない' });
  const badCrc32 = L.packCmd(0x0000, Buffer.from('x'.repeat(24))); badCrc32[30] ^= 0xff;
  info('A1-parse-crc32', { accepted: !!L.parseCmd(badCrc32), note: 'parseCmd は CRC32（中身）を確かめない。SDK2 の CheckPreamble は確かめて捨てる' });

  // ---------------------------------------------------------------- 2. 検出・設定（にせ LiDAR A: ブロードキャストで返事、本物の仕様どおり）
  const A = H.sim('a071', { ip: '10.107.0.1', sn: 'SIMA0000000001', reply: 'broadcast', pattern: 'grid', rate: 100000 });
  await A.waitFor(e => e.ev === 'ready', 5000);
  const live = new L.Live();
  const logs = []; live.on('log', t => logs.push(t));
  const states = []; live.on('state', s => states.push(s));
  let got = null; live.on('points', b => { if (got) got.push(b); });
  const st0 = await live.open();
  check('A2-open-no-error', st0.errors.length === 0, st0.errors);
  info('A2-nets', st0.nets);
  const t0 = Date.now(); let dev = null;
  while (Date.now() - t0 < 6000 && !(dev = live.state().devices[0])) await sleep(100);
  check('A2-detect-broadcast-reply', !!dev, dev);
  check('A2-detect-fields', dev && dev.sn === 'SIMA0000000001' && dev.ip === '10.107.0.1' && dev.model === 'MID-360' && dev.hostIp === '10.107.0.2', dev);
  const s1 = A.last('search');
  check('A2-search-packet', s1 && s1.len === 24 && s1.ver === 0 && s1.sender === 0 && s1.dataLen === 0, s1);
  check('A2-search-crc', A.all('badcrc').length === 0, A.all('badcrc').length);

  got = [];
  const t1 = Date.now();
  const st1 = await live.startLidar(dev.sn);
  const startMs = Date.now() - t1;
  const cmd = A.last('cmd');
  check('A3-config-crc', cmd && cmd.crc16ok && cmd.crc32ok && !cmd.dropped, cmd && { crc16ok: cmd.crc16ok, crc32ok: cmd.crc32ok });
  check('A3-config-header', cmd && cmd.cmd === 0x0100 && cmd.type === 0 && cmd.sender === 0 && cmd.ver === 0 && cmd.len === cmd.rawLen, cmd);
  const keys = cmd ? cmd.keys.map(k => `${k.key.toString(16).padStart(4, '0')}:${k.len}:${k.hex}`) : [];
  // 期待: 0x0000=01（直交座標・32bit）、0x0006=ホスト IP 10.107.0.2・56301・56300、0x001A=01（SAMPLING）
  const host = Buffer.alloc(8); Buffer.from([10, 107, 0, 2]).copy(host); host.writeUInt16LE(56301, 4); host.writeUInt16LE(56300, 6);
  const expKeys = ['0000:1:01', `0006:8:${host.toString('hex')}`, '001a:1:01'];
  check('A3-config-keys', JSON.stringify(keys) === JSON.stringify(expKeys) && cmd.keyNum === 3 && cmd.rsvd === 0 && cmd.trailing === 0, { keys, expKeys });
  check('A3-ack-fast', startMs < 1000, `startLidar ${startMs} ms`);
  check('A3-no-log-on-ack', logs.length === 0, logs);
  await sleep(2000);
  const all1 = got.splice(0);
  const n1 = all1.reduce((a, b) => a + b.n, 0);
  const g1 = all1.map(b => gridCheck(b, 1)).reduce((a, r) => ({ n: a.n + r.n, bad: a.bad + r.bad, first: a.first || r.first }), { n: 0, bad: 0, first: null });
  check('A5-type1-values-exact', n1 > 100000 && g1.bad === 0, g1);
  info('A5-type1-rate', { pts2s: n1, state: live.state().rate, stat: live.lidar.stat });

  // 型 2・型 3（アプリの指定を無視して送る＝LiDAR 側の設定が違うときを模す）
  A.send('type 2'); await sleep(300); got.splice(0); await sleep(1000);
  const all2 = got.splice(0); const g2 = all2.map(b => gridCheck(b, 2)).reduce((a, r) => ({ n: a.n + r.n, bad: a.bad + r.bad, first: a.first || r.first }), { n: 0, bad: 0, first: null });
  check('A5-type2-values', g2.n > 10000 && g2.bad === 0, g2);
  A.send('type 3'); await sleep(300); got.splice(0); await sleep(1000);
  const all3 = got.splice(0); const g3 = all3.map(b => gridCheck(b, 3)).reduce((a, r) => ({ n: a.n + r.n, bad: a.bad + r.bad, first: a.first || r.first }), { n: 0, bad: 0, first: null });
  check('A5-type3-values', g3.n > 10000 && g3.bad === 0, g3);
  // 型 3 の精度（同じ点を型 1 と型 3 で比べる）: 点 g=0 は (1.000, -2.000, 0.300)
  const enc3 = (x, y, z) => { const d = Math.round(Math.hypot(x, y, z)); const th = Math.round(Math.acos(z / Math.hypot(x, y, z)) * 18000 / Math.PI); let ph = Math.atan2(y, x); if (ph < 0) ph += 2 * Math.PI; return [d, th, Math.round(ph * 18000 / Math.PI) % 36000]; };
  const [dd, th, ph] = enc3(1000, -2000, 300); const thr = th / 100 * Math.PI / 180, phr = ph / 100 * Math.PI / 180;
  info('A5-type3-precision', { in: [1, -2, 0.3], out: [dd / 1000 * Math.sin(thr) * Math.cos(phr), dd / 1000 * Math.sin(thr) * Math.sin(phr), dd / 1000 * Math.cos(thr)], note: '0.01 度の量子化で 2.2 m 先 ≈ 0.4 mm（仕様どおり）' });
  A.send('type 1');

  // ---------------------------------------------------------------- 3. 壊れた箱（ファジングは別の試験）
  const kinds = ['short', 'hdronly', 'dotnum_big', 'dotnum_small', 'type0', 'type9', 'len_lie', 'zero'];
  for (const k of kinds) {
    const s0 = { ...live.lidar.stat };
    A.send(`bad ${k}:5`); await sleep(400); got.splice(0); await sleep(800);
    const bb = got.splice(0); const gk = bb.map(b => gridCheck(b, 1)).reduce((a, r) => ({ n: a.n + r.n, bad: a.bad + r.bad, first: a.first || r.first }), { n: 0, bad: 0, first: null });
    const s1b = live.lidar.stat;
    check(`E1-bad-${k}`, gk.bad === 0 && uncaught.length === 0, { pts: gk.n, garbage: gk.bad, first: gk.first, statBad: s1b.bad - s0.bad, pkts: s1b.pkts - s0.pkts });
  }
  // garbage（でたらめな中身）: 型の欄がたまたま 1〜3 になると、でたらめな点が出る
  A.send('bad garbage:2'); await sleep(400); got.splice(0); await sleep(1500);
  { const bb = got.splice(0); const gk = bb.map(b => gridCheck(b, 1)).reduce((a, r) => ({ n: a.n + r.n, bad: a.bad + r.bad, first: a.first || r.first }), { n: 0, bad: 0, first: null });
    info('E1-bad-garbage', { pts: gk.n, garbagePts: gk.bad, first: gk.first, note: '点の箱の版・長さ欄・CRC32 を確かめないため、型の欄が 1〜3 のでたらめな箱は点として表示される' }); }
  A.send('bad none:0');

  // ---------------------------------------------------------------- 4. 返事のいろいろ
  await live.stopAll();
  check('A4-stopall-no-throw', true);
  info('A2-stop-does-not-tell-lidar', { cmdsAfterStop: 'stopAll は LiDAR に何も送らない（送り先も動作モードも元に戻さない）' });
  const statsBefore = A.last('stats');
  await sleep(1500);
  const statsAfter = A.last('stats');
  check('C0-lidar-keeps-sending-after-stop', statsAfter.sentPkts > statsBefore.sentPkts, `止めたあとも LiDAR は送り続ける: ${statsBefore.sentPkts} → ${statsAfter.sentPkts} 箱`);

  // 返事なし（ack: false）
  await A.kill(); await sleep(300);
  const B = H.sim('a071', { ip: '10.107.0.1', sn: 'SIMNOACK000001', reply: 'broadcast', ack: false, pattern: 'grid', rate: 50000 });
  await B.waitFor(e => e.ev === 'ready');
  let dB = null; const t2 = Date.now(); while (Date.now() - t2 < 6000 && !(dB = live.state().devices.find(d => d.sn === 'SIMNOACK000001'))) await sleep(100);
  logs.length = 0;
  const t3 = Date.now(); await live.startLidar('SIMNOACK000001'); const noAckMs = Date.now() - t3;
  check('A4-noack-log', logs.some(l => /返事がありません/.test(l)), { logs, ms: noAckMs, cmds: B.all('cmd').length });
  await live.stopAll(); await B.kill(); await sleep(300);
  // 返事のコードが 0 以外
  const C = H.sim('a071', { ip: '10.107.0.1', sn: 'SIMRET01000001', reply: 'broadcast', ackRet: 1, ackErrKey: 0x001a, pattern: 'grid', rate: 50000 });
  await C.waitFor(e => e.ev === 'ready');
  const t4 = Date.now(); while (Date.now() - t4 < 6000 && !live.state().devices.find(d => d.sn === 'SIMRET01000001')) await sleep(100);
  logs.length = 0; await live.startLidar('SIMRET01000001');
  check('A4-ackret-log', logs.some(l => /受け付けませんでした/.test(l) && /1a/.test(l)), logs);
  await live.stopAll(); await C.kill(); await sleep(300);
  // 返事の番号が違う（別の命令への返事）でも「返事あり」とみなすか
  const D = H.sim('a071', { ip: '10.107.0.1', sn: 'SIMSEQ00000001', reply: 'broadcast', ackSeq: 'other', pattern: 'grid', rate: 50000 });
  await D.waitFor(e => e.ev === 'ready');
  const t5 = Date.now(); while (Date.now() - t5 < 6000 && !live.state().devices.find(d => d.sn === 'SIMSEQ00000001')) await sleep(100);
  logs.length = 0; await live.startLidar('SIMSEQ00000001');
  info('A4-ack-seq-not-checked', { logs, note: '返事の通し番号を照合しないので、別の命令への返事でも受け付けたことになる' });
  await live.stopAll(); await D.kill(); await sleep(300);
  // ユニキャストの返事（にせ LiDAR tools/fake_mid360.js と同じ）・サブネットへのブロードキャストの返事
  for (const reply of ['unicast', 'subnet']) {
    const E = H.sim('a071', { ip: '10.107.0.1', sn: 'SIMR' + reply.toUpperCase().slice(0, 4) + '000001', reply, replyTo: '10.107.0.255', pattern: 'grid', rate: 10000 });
    await E.waitFor(e => e.ev === 'ready');
    const t6 = Date.now(); let dd2 = null; while (Date.now() - t6 < 6000 && !(dd2 = live.state().devices.find(d => d.sn.startsWith('SIMR' + reply.toUpperCase().slice(0, 4))))) await sleep(100);
    check(`A2-detect-${reply}-reply`, !!dd2, dd2);
    await E.kill(); await sleep(200);
  }
  // SN のいろいろ（16 バイトちょうど・NUL なし／途中に NUL／ラテン 1 以外）
  for (const sn of ['ABCDEFGHIJKLMNOP', 'AB\u0000CD', '測定器']) {
    const E = H.sim('a071', { ip: '10.107.0.1', sn, reply: 'broadcast', pattern: 'grid', rate: 10000 });
    await E.waitFor(e => e.ev === 'ready'); await sleep(2500);
    info('A2-sn-' + JSON.stringify(sn), live.state().devices.map(d => d.sn));
    await E.kill(); await sleep(4500);
  }
  info('A2-devtypes', { map: '9 MID-360 / 35 MID-360s / 41 MID-360L / 40 Avia2 / 10,15 HAP / 16 PA は SDK2 の livox_lidar_def.h と一致。0（Hub）は「種類 0」と出る。1/2/3/6/7 は SDK1 の機種で SDK2 の検出には答えない（害はない）' });

  live.close();
  check('A9-no-uncaught', uncaught.length === 0, uncaught);
  H.save('proto');
  await H.cleanup();
  process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
