// src/trajectory.js の単体試験（テキスト・MCAP）
import { test, eq, ok, near, src, setFile } from './lib/harness.mjs';
import { enc } from './lib/read.mjs';
setFile('t_traj');
const { parseTrajectory } = await import(src('src/trajectory.js'));
const T = s => parseTrajectory(enc.encode(s).buffer);
const rows = r => Array.from({ length: r.count }, (_, i) => Array.from(r.poses.subarray(8 * i, 8 * i + 8)));
test('OK-T01', 'テキスト: TUM（t x y z qx qy qz qw）・見出しの # 行', () => {
  const r = T('# timestamp tx ty tz qx qy qz qw\n1.0 1 2 3 0 0 0 1\n2.0 4 5 6 0 0 0.7071 0.7071\n');
  eq(rows(r), [[1, 1, 2, 3, 0, 0, 0, 1], [2, 4, 5, 6, 0, 0, 0.7071, 0.7071]]);
});
test('OK-T02', 'テキスト: t x y z の 4 列（姿勢は単位四元数）・カンマ区切りの見出し・CRLF・BOM・指数表記', () => {
  eq(rows(T('1 1 2 3\n2 4 5 6\n')), [[1, 1, 2, 3, 0, 0, 0, 1], [2, 4, 5, 6, 0, 0, 0, 1]]);
  eq(rows(T('time,x,y,z\r\n1,1,2,3\r\n2,4,5,6\r\n')).length, 2);
  eq(rows(T('﻿1 1 2 3\n2 4 5 6\n')).length, 2);
  eq(rows(T('1e9 1.5E+02 2 3\n1.000000001e9 1 2 3\n'))[0].slice(0, 2), [1e9, 150]);
});
test('OK-T03', 'テキスト: nan を含む行は飛ばし、2 行未満なら日本語のエラー', () => {
  eq(T('1 nan 2 3\n2 4 5 6\n3 7 8 9\n').count, 2);
  let e = null; try { T('1 1 2 3\n'); } catch (x) { e = x; } ok(e && /軌跡として読める行/.test(e.message), e && e.message);
});
test('A04-038', 'テキスト: セミコロン区切りの CSV（Excel の地域設定で多い）も読む', () => {
  let r = null, e = null; try { r = T('1;1;2;3\n2;4;5;6\n'); } catch (x) { e = x; }
  ok(r && r.count === 2, e ? e.message : `count=${r.count}`);
});
test('A04-038', 'テキスト: 時刻がナノ秒（EuRoC の data.csv）でも秒に直す（所要時間が何十億秒にならない）', () => {
  const r = T('#timestamp, p_RS_R_x [m], p_RS_R_y [m], p_RS_R_z [m], q_RS_w [], q_RS_x [], q_RS_y [], q_RS_z []\n1403636579758555392,4.688319,-1.786938,0.783338,0.534108,-0.153029,-0.827383,-0.082152\n1403636589758555392,4.688177,-1.786770,0.787350,0.534640,-0.152990,-0.826976,-0.082863\n');
  const dur = r.poses[8] - r.poses[0];
  ok(dur > 5 && dur < 20, `所要時間 ${dur}（期待 10 秒）`);
});
// ---- MCAP（Schema・Channel・Message。チャンクあり・なし・圧縮）
function mcap(msgs, { compressed = false, inChunk = true, schemaName = 'nav_msgs/msg/Odometry', topic = '/Odometry' } = {}) {
  const head = new Uint8Array([0x89, 0x4d, 0x43, 0x41, 0x50, 0x30, 0x0d, 0x0a]);
  const rec = (op, body) => { const b = new Uint8Array(9 + body.length); b[0] = op; new DataView(b.buffer).setBigUint64(1, BigInt(body.length), true); b.set(body, 9); return b; };
  const str = s => { const e = enc.encode(s); const b = new Uint8Array(4 + e.length); new DataView(b.buffer).setUint32(0, e.length, true); b.set(e, 4); return b; };
  const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
  const u = (n, v) => { const b = new Uint8Array(n); const dv = new DataView(b.buffer); n === 2 ? dv.setUint16(0, v, true) : n === 4 ? dv.setUint32(0, v, true) : dv.setBigUint64(0, BigInt(v), true); return b; };
  const odom = (t, p) => {
    const b = new Uint8Array(1024); const dv = new DataView(b.buffer); b[1] = 1;
    let o = 4; dv.setInt32(o, Math.floor(t), true); o += 4; dv.setUint32(o, Math.round((t % 1) * 1e9), true); o += 4;
    const ws = s => { o = 4 + (((o - 4) + 3) & ~3); dv.setUint32(o, s.length + 1, true); o += 4; b.set(enc.encode(s), o); o += s.length + 1; };
    ws('map'); if (schemaName.endsWith('Odometry')) ws('body');
    o = 4 + (((o - 4) + 7) & ~7); for (const v of p) { dv.setFloat64(o, v, true); o += 8; }
    return b.subarray(0, o + 288);
  };
  const recs = [rec(3, cat(u(2, 1), str(schemaName), str('ros2msg'), u(4, 0))), rec(4, cat(u(2, 1), u(2, 1), str(topic), str('cdr'), u(4, 0))), ...msgs.map(([t, p]) => rec(5, cat(u(2, 1), u(4, 0), u(8, 0), u(8, 0), odom(t, p))))];
  if (!inChunk) return cat(head, ...recs);
  const body = cat(...recs);
  return cat(head, rec(6, cat(u(8, 0), u(8, 0), u(8, body.length), u(4, 0), str(compressed ? 'zstd' : ''), u(8, body.length), body)));
}
const M = b => parseTrajectory(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
test('OK-T04', 'MCAP: Odometry（チャンクあり・なし）・PoseStamped・時刻（秒 + ナノ秒）', () => {
  const a = M(mcap([[1.5, [1, 2, 3, 0, 0, 0, 1]], [2.25, [4, 5, 6, 0, 0, 0.7071, 0.7071]]]));
  eq([a.count, a.topic], [2, '/Odometry']); near(rows(a)[1], [2.25, 4, 5, 6, 0, 0, 0.7071, 0.7071], 1e-9);
  eq(M(mcap([[1.5, [1, 2, 3, 0, 0, 0, 1]], [2.5, [4, 5, 6, 0, 0, 0, 1]]], { inChunk: false })).count, 2);
  const ps = M(mcap([[3, [7, 8, 9, 0, 0, 0, 1]], [4, [7, 8, 9, 0, 0, 0, 1]]], { schemaName: 'geometry_msgs/msg/PoseStamped', topic: '/pose' }));
  eq([ps.topic, rows(ps)[0].slice(0, 4)], ['/pose', [3, 7, 8, 9]]);
});
test('OK-T05', 'MCAP: 圧縮チャンクだけ・メッセージなしは日本語のエラー、末尾が切れたチャンクは飛ばす', () => {
  let e = null; try { M(mcap([[1, [1, 2, 3, 0, 0, 0, 1]]], { compressed: true })); } catch (x) { e = x; } ok(e && /圧縮された MCAP/.test(e.message), e && e.message);
  e = null; try { M(new Uint8Array([0x89, 0x4d, 0x43, 0x41, 0x50, 0x30, 0x0d, 0x0a])); } catch (x) { e = x; } ok(e && /見つかりません/.test(e.message), e && e.message);
});
