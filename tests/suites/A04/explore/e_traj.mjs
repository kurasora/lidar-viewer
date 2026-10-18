import { join } from 'node:path';
import { show, ROOT, enc, tryRead } from './lib.mjs';
const { parseTrajectory } = await import(join(ROOT, 'src/trajectory.js'));
const T = s => { try { const r = parseTrajectory(enc.encode(s).buffer); return { n: r.count, topic: r.topic, first: Array.from(r.poses.subarray(0, 8)), second: Array.from(r.poses.subarray(8, 16)) }; } catch (e) { return 'エラー: ' + e.message; } };
show('TUM（t x y z qx qy qz qw）', T('# timestamp tx ty tz qx qy qz qw\n1.0 1 2 3 0 0 0 1\n2.0 4 5 6 0 0 0.7071 0.7071\n'));
show('t x y z だけ', T('1 1 2 3\n2 4 5 6\n'));
show('CSV（カンマ・見出し）', T('time,x,y,z,qx,qy,qz,qw\n1,1,2,3,0,0,0,1\n2,4,5,6,0,0,0,1\n'));
show('セミコロン区切り', T('1;1;2;3\n2;4;5;6\n'));
show('時刻が逆順', T('2 4 5 6\n1 1 2 3\n3 7 8 9\n'));
show('EuRoC（t, p xyz, q wxyz, …）', T('#timestamp, p_RS_R_x [m], p_RS_R_y [m], p_RS_R_z [m], q_RS_w [], q_RS_x [], q_RS_y [], q_RS_z []\n1403636579758555392,4.688319,-1.786938,0.783338,0.534108,-0.153029,-0.827383,-0.082152\n1403636579763555584,4.688177,-1.786770,0.787350,0.534640,-0.152990,-0.826976,-0.082863\n'));
show('KITTI（3×4 行列 12 個）', T('1 0 0 0 0 1 0 0 0 0 1 0\n1 0 0 1 0 1 0 0 0 0 1 0\n'));
show('7 列（x y z qx qy qz qw、時刻なし）', T('1 2 3 0 0 0 1\n4 5 6 0 0 0 1\n'));
show('指数表記と大文字 E', T('1e9 1.5E+02 2 3\n1.000000001e9 1 2 3\n'));
show('nan を含む行', T('1 nan 2 3\n2 4 5 6\n3 7 8 9\n'));
show('CRLF', T('1 1 2 3\r\n2 4 5 6\r\n'));
show('1 行だけ', T('1 1 2 3\n'));
show('BOM', T('﻿1 1 2 3\n2 4 5 6\n'));
// MCAP: 壊れた・空・圧縮
const mcapHead = [0x89, 0x4d, 0x43, 0x41, 0x50, 0x30, 0x0d, 0x0a];
show('MCAP 先頭の印だけ', (() => { try { parseTrajectory(new Uint8Array(mcapHead).buffer); return 'エラーなし'; } catch (e) { return 'エラー: ' + e.message; } })());
// 自作の MCAP（Schema・Channel・Message。Odometry 2 件）
function mcap(msgs, { compressedChunk = false, inChunk = true } = {}) {
  const parts = [new Uint8Array(mcapHead)];
  const rec = (op, body) => { const b = new Uint8Array(9 + body.length); b[0] = op; new DataView(b.buffer).setBigUint64(1, BigInt(body.length), true); b.set(body, 9); return b; };
  const str = s => { const e = enc.encode(s); const b = new Uint8Array(4 + e.length); new DataView(b.buffer).setUint32(0, e.length, true); b.set(e, 4); return b; };
  const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0); const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
  const u16 = v => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; };
  const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
  const u64 = v => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return b; };
  const schema = rec(0x03, cat(u16(1), str('nav_msgs/msg/Odometry'), str('ros2msg'), u32(0)));
  const chan = rec(0x04, cat(u16(1), u16(1), str('/Odometry'), str('cdr'), u32(0)));
  const cdrOdom = (t, p) => {
    // CDR: 4 バイトの頭 + header(stamp sec,nsec, frame_id) + child_frame_id + pose(7 f64) + cov(36 f64) + twist...
    const b = new Uint8Array(4 + 8 + 4 + 8 + 4 + 8 + 4 + 56 + 288 + 400); const dv = new DataView(b.buffer); b[1] = 1;
    let o = 4; dv.setInt32(o, Math.floor(t), true); o += 4; dv.setUint32(o, Math.round((t % 1) * 1e9), true); o += 4;
    const ws = s => { o = 4 + (((o - 4) + 3) & ~3); dv.setUint32(o, s.length + 1, true); o += 4; b.set(enc.encode(s), o); o += s.length + 1; };
    ws('map'); ws('body');
    o = 4 + (((o - 4) + 7) & ~7);
    for (const v of p) { dv.setFloat64(o, v, true); o += 8; }
    return b.subarray(0, o + 288);
  };
  const msgRecs = msgs.map(([t, p]) => rec(0x05, cat(u16(1), u32(0), u64(0), u64(0), cdrOdom(t, p))));
  if (inChunk) {
    const recs = cat(schema, chan, ...msgRecs);
    const chunk = rec(0x06, cat(u64(0), u64(0), u64(recs.length), u32(0), str(compressedChunk ? 'zstd' : ''), u64(recs.length), recs));
    parts.push(chunk);
  } else parts.push(schema, chan, ...msgRecs);
  return cat(...parts);
}
const M = (b) => { try { const r = parseTrajectory(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); return { n: r.count, topic: r.topic, first: Array.from(r.poses.subarray(0, 8)).map(v => +v.toFixed(6)) }; } catch (e) { return 'エラー: ' + e.message; } };
show('MCAP Odometry 2 件（チャンク）', M(mcap([[1.5, [1, 2, 3, 0, 0, 0, 1]], [2.5, [4, 5, 6, 0, 0, 0.7071, 0.7071]]])));
show('MCAP Odometry 2 件（チャンクなし）', M(mcap([[1.5, [1, 2, 3, 0, 0, 0, 1]], [2.5, [4, 5, 6, 0, 0, 0, 1]]], { inChunk: false })));
show('MCAP 圧縮チャンク', M(mcap([[1.5, [1, 2, 3, 0, 0, 0, 1]]], { compressedChunk: true })));
{
  const b = mcap([[1.5, [1, 2, 3, 0, 0, 0, 1]], [2.5, [4, 5, 6, 0, 0, 0, 1]]]);
  show('MCAP 途中で切れた（末尾 100 バイトなし）', M(b.subarray(0, b.length - 100)));
}
