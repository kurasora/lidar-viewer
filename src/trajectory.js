// 軌跡の読み込み
//  - rosbag2 の MCAP（slam の maps/.../trajectory/*.mcap、/Odometry など）
//  - テキスト（1 行に t x y z [qx qy qz qw]、TUM 形式など）
// 戻り値: { poses: Float64Array(8 * n)  [t, x, y, z, qx, qy, qz, qw], topic }

const MAGIC = [0x89, 0x4d, 0x43, 0x41, 0x50]; // \x89MCAP

class Cursor {
  constructor(dv, pos = 0) { this.dv = dv; this.pos = pos; }
  u8() { return this.dv.getUint8(this.pos++); }
  u16() { const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
  u32() { const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  u64() { const v = Number(this.dv.getBigUint64(this.pos, true)); this.pos += 8; return v; }
  str() { const len = this.u32(); const s = new TextDecoder().decode(new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.pos, len)); this.pos += len; return s; }
}

// ROS 2 の CDR（little endian）。位置合わせの起点はカプセル化ヘッダー（4 バイト）の直後
class Cdr {
  constructor(bytes) {
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes[1] !== 1 && bytes[1] !== 3) throw new Error('little endian の CDR 以外には対応していません');
    this.pos = 4;
  }
  align(n) { const r = (this.pos - 4) % n; if (r) this.pos += n - r; }
  i32() { this.align(4); const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; }
  u32() { this.align(4); const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  f64() { this.align(8); const v = this.dv.getFloat64(this.pos, true); this.pos += 8; return v; }
  str() { const len = this.u32(); this.pos += len; }
  stamp() { const s = this.i32(); const ns = this.u32(); return s + ns * 1e-9; }
  pose() { return [this.f64(), this.f64(), this.f64(), this.f64(), this.f64(), this.f64(), this.f64()]; }
}

const DECODERS = {
  'nav_msgs/msg/Odometry': c => { const t = c.stamp(); c.str(); c.str(); return [t, ...c.pose()]; },
  'geometry_msgs/msg/PoseStamped': c => { const t = c.stamp(); c.str(); return [t, ...c.pose()]; },
  'geometry_msgs/msg/PoseWithCovarianceStamped': c => { const t = c.stamp(); c.str(); return [t, ...c.pose()]; },
};

function parseMcap(buffer) {
  const dv = new DataView(buffer);
  const schemas = new Map(), channels = new Map();
  const byTopic = new Map();
  let compressed = false, truncated = false;
  const skipped = new Map(); // トピック → 読めなかった数（NaN・符号化の違いなど）
  const otherEnc = new Set(); // Odometry らしいのに CDR でない符号化（R17-001/002）
  const bad = topic => skipped.set(topic, (skipped.get(topic) || 0) + 1);

  function records(dv2, start, end) {
    const c = new Cursor(dv2, start);
    while (c.pos + 9 <= end) {
      const op = c.u8();
      const len = c.u64();
      const body = c.pos;
      if (body + len > end) {
        truncated = true;
        // 途中で切れた無圧縮のチャンクは、中の記録を読めるところまで読む（R12-005）
        if (op === 0x06 && body + 48 <= end) {
          try { c.u64(); c.u64(); c.u64(); c.u32(); const comp = c.str(); c.u64(); if (comp) compressed = true; else records(dv2, c.pos, end); } catch (e) { /* 見出しも切れている */ }
        }
        break;
      }
      if (op === 0x03) { // Schema
        const id = c.u16(); const name = c.str(); const enc = c.str();
        schemas.set(id, { name, enc });
      } else if (op === 0x04) { // Channel
        const id = c.u16(); const schemaId = c.u16(); const topic = c.str(); const menc = c.str();
        channels.set(id, { topic, schema: schemaId, menc });
      } else if (op === 0x05) { // Message
        const ch = c.u16(); c.u32(); c.u64(); c.u64();
        const info = channels.get(ch);
        const sc = info && schemas.get(info.schema);
        const type = sc && sc.name;
        // CDR（ROS 2）だけを読む。名前が同じでも別の符号化はごみになる（R17-002）
        const cdr = info && (!info.menc || info.menc === 'cdr');
        const dec = type && cdr && DECODERS[type];
        if (type && !dec && /(^|\/)(Odometry|PoseStamped|PoseWithCovarianceStamped)$/.test(type)) otherEnc.add(cdr ? `${type}（ROS 1 の形式）` : (info.menc || '?'));
        if (dec) {
          const data = new Uint8Array(dv2.buffer, dv2.byteOffset + c.pos, body + len - c.pos);
          try {
            const v = dec(new Cdr(data));
            // NaN・Inf の姿勢（FAST-LIO の発散など）は除く（R12-001）
            if (v.slice(0, 4).every(Number.isFinite)) {
              if (!byTopic.has(info.topic)) byTopic.set(info.topic, []);
              byTopic.get(info.topic).push(v);
            } else bad(info.topic);
          } catch (e) { bad(info.topic); }
        }
      } else if (op === 0x06) { // Chunk
        c.u64(); c.u64(); c.u64(); c.u32();
        const comp = c.str();
        const rlen = c.u64();
        if (comp) compressed = true;
        else records(dv2, c.pos, Math.min(c.pos + rlen, body + len));
      }
      c.pos = body + len;
    }
  }
  records(dv, 8, buffer.byteLength);
  if (!byTopic.size) {
    const enc = [...otherEnc];
    const why = enc.some(e => /ros1/i.test(e)) || enc.some(e => /ROS 1/.test(e)) ? 'ROS 1 の bag から変換した MCAP（ros1）には対応していません。ROS 2 の rosbag2（CDR）で記録してください'
      : enc.length ? `${enc.join('・')} の符号化で記録した MCAP には対応していません。ROS 2 の rosbag2（CDR）で記録してください`
        : compressed ? '圧縮された MCAP には対応していません（rosbag2 の既定は無圧縮です）'
          : skipped.size ? '軌跡のメッセージはありますが、座標が NaN（発散など）か壊れていて読めません'
            : '軌跡（Odometry / PoseStamped）のメッセージが見つかりません';
    throw new Error(why);
  }
  // トピックの選び方: /Odometry → 名前の末尾が odometry（/fast_lio/Odometry など）→ メッセージが最も多いもの（R12-008）
  const keys = [...byTopic.keys()].sort((a, b) => byTopic.get(b).length - byTopic.get(a).length);
  const topic = keys.find(k => k === '/Odometry') || keys.find(k => /(^|\/)odometry$/i.test(k)) || keys[0];
  const list = byTopic.get(topic);
  const poses = new Float64Array(list.length * 8);
  list.forEach((v, i) => poses.set(v, i * 8));
  const notes = [];
  if (skipped.get(topic)) notes.push(`座標が NaN などの ${skipped.get(topic).toLocaleString()} 姿勢を除きました`);
  if (truncated) notes.push('ファイルが途中で切れています（読めた分だけ表示）');
  const others = keys.filter(k => k !== topic);
  if (others.length) notes.push(`ほかに ${others.slice(0, 3).map(k => `${k}（${byTopic.get(k).length.toLocaleString()} 個）`).join('、')}${others.length > 3 ? ' など' : ''} があります`);
  return { poses, topic, count: list.length, note: notes.join('。') };
}

// 大きな .mcap（数 GB の rosbag2）を丸ごと読まずに、Blob.slice で少しずつ読み、
// Schema・Channel・軌跡らしいメッセージの記録だけを集めた小さな MCAP にする（R12-002）
//   生データ（点群・画像）のメッセージや、圧縮チャンクの本体は読まない
export async function extractMcap(blob) {
  const WIN = 32 << 20;
  let wpos = -1, wbuf = null, cut = false;
  const read = async (pos, n) => { // pos から n バイト（窓の中にあれば窓から）
    if (n > WIN) return new Uint8Array(await blob.slice(pos, pos + n).arrayBuffer());
    if (wbuf && pos >= wpos && pos + n <= wpos + wbuf.length) return wbuf.subarray(pos - wpos, pos - wpos + n);
    wpos = pos; wbuf = new Uint8Array(await blob.slice(pos, Math.min(blob.size, pos + WIN)).arrayBuffer());
    return wbuf.subarray(0, Math.min(n, wbuf.length));
  };
  const u64 = (b, o) => Number(new DataView(b.buffer, b.byteOffset + o, 8).getBigUint64(0, true));
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const out = [new Uint8Array([0x89, 0x4d, 0x43, 0x41, 0x50, 0x30, 0x0d, 0x0a])];
  const want = new Set(); // 読む Channel の id
  const typeOf = new Map(); // Schema の id → 名前
  const TRAJ = /(^|\/)(Odometry|PoseStamped|PoseWithCovarianceStamped)$/;
  async function walk(start, end) {
    let pos = start;
    while (pos + 9 <= end) {
      const h = await read(pos, 9);
      if (h.length < 9) break;
      const op = h[0], len = u64(h, 1), body = pos + 9;
      if (body + len > end) { // 途中で切れた記録: 無圧縮のチャンクなら中を読めるところまで読む
        cut = true;
        if (op === 0x06 && body + 48 <= end) {
          const ch = await read(body, Math.min(end - body, 4096));
          const clen = new DataView(ch.buffer, ch.byteOffset + 28, 4).getUint32(0, true);
          if (clen === 0 && ch.length >= 40) await walkChunk(body + 40, end);
        }
        break;
      }
      if (op === 0x03 || op === 0x04) {
        const r = (await read(pos, 9 + len)).slice();
        if (op === 0x03) { const nl = new DataView(r.buffer, 11, 4).getUint32(0, true); typeOf.set(u16(r, 9), new TextDecoder().decode(r.subarray(15, 15 + nl))); }
        else if (TRAJ.test(typeOf.get(u16(r, 11)) || '')) want.add(u16(r, 9));
        out.push(r);
      } else if (op === 0x05) {
        const ch = await read(body, 2);
        if (want.has(u16(ch, 0)) && len < (64 << 20)) out.push((await read(pos, 9 + len)).slice());
      } else if (op === 0x06) {
        // チャンク: 見出し（start/end/size/crc/compression/records の長さ）を読み、無圧縮なら中を歩く。圧縮なら見出しだけ写す（「圧縮」の知らせ用）
        const hd = await read(body, Math.min(len, 4096));
        const clen = new DataView(hd.buffer, hd.byteOffset + 28, 4).getUint32(0, true);
        if (clen) {
          const comp = hd.slice(28, 32 + clen);
          const rec = new Uint8Array(9 + 28 + comp.length + 8);
          const dv = new DataView(rec.buffer);
          rec[0] = 0x06; dv.setBigUint64(1, BigInt(28 + comp.length + 8), true); rec.set(comp, 9 + 28);
          out.push(rec);
        } else await walkChunk(body + 40, Math.min(body + 40 + u64(hd, 32), body + len));
      }
      pos = body + len;
    }
  }
  // 無圧縮チャンクの中の記録は、外に出して並べ直す（チャンクに包まない）
  async function walkChunk(s, e) { await walk(s, e); }
  await walk(8, blob.size);
  // 切れていたことは、長さが残りより大きい印の記録（使われない opcode 0x7F）で parseMcap に伝える
  if (cut) out.push(new Uint8Array([0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f, 0x00]));
  return await new Blob(out).arrayBuffer();
}

const HINT = 'TUM 形式（t x y z qx qy qz qw）か t x y z の文字ファイル、または rosbag2 の .mcap を選んでください';

// 文字の軌跡: 1 行に t x y z [qx qy qz qw …]。区切りは空白・カンマ・セミコロン。
// 軌跡でないもの（KITTI の 12 列・FAST-LIO の pos_log・点群の文字ファイル）は、列の数・時刻の増え方・四元数の長さで見分けて断る
function parseText(buffer) {
  const text = new TextDecoder().decode(buffer);
  const all = [];
  let header = '';
  for (const line of text.split(/\r\n|\r|\n/)) {
    const s = line.trim();
    if (!s) continue;
    if (s.startsWith('#') || s.startsWith('//') || /[a-df-zA-DF-Z]/.test(s.replace(/e[-+]?\d/gi, ''))) { if (!all.length && !header) header = s; continue; }
    const v = s.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (v.length < 4 || v.some(x => !Number.isFinite(x))) continue;
    all.push(v);
  }
  if (all.length < 2) throw new Error(`軌跡として読める行がありません。${HINT}`);
  // いちばん多い列の数の行だけを使う
  const freq = new Map();
  for (const v of all) freq.set(v.length, (freq.get(v.length) || 0) + 1);
  const ncol = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const rows = all.filter(v => v.length === ncol);
  if (rows.length < all.length * 0.9) throw new Error(`行ごとに列の数がそろっていないため、軌跡として読めません。${HINT}`);
  // 時刻（1 列目）が増えているか
  let back = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i][0] < rows[i - 1][0]) back++;
  const monotonic = back <= Math.max(0, (rows.length - 1) * 0.02);
  if (ncol === 12) throw new Error(`KITTI 形式（3×4 の行列の 12 列）の姿勢は時刻がないため、軌跡として読めません。${HINT}`);
  if (!monotonic) throw new Error(`1 列目の時刻が増えていないため、軌跡として読めません（点群の文字ファイルではありませんか）。${HINT}`);
  // 四元数の並び: 見出しで w が x より前（EuRoC の q_RS_w …）なら w x y z
  const wFirst = /q\w*_?w\b[\s\S]*q\w*_?x\b/i.test(header) || /\bqw\b[\s\S]*\bqx\b/i.test(header);
  if (ncol >= 8) {
    let unit = 0;
    for (const v of rows) if (Math.abs(Math.hypot(v[4], v[5], v[6], v[7]) - 1) < 0.05) unit++;
    if (unit < rows.length * 0.95) throw new Error(`5〜8 列目が姿勢（四元数）になっていないため、軌跡として読めません（FAST-LIO の pos_log などは対応していません）。${HINT}`);
  } else if (ncol !== 4) throw new Error(`${ncol} 列の行は軌跡として読めません（時刻のない x y z qx qy qz qw などには対応していません）。${HINT}`);
  // 時刻がナノ秒（EuRoC など。1e17 以上）・マイクロ秒（1e14 以上）・ミリ秒（1e11 以上）なら秒に直す（R12-007。app.js の isTrajectory と同じ見分け方）
  const tm = Math.abs(rows[rows.length >> 1][0]);
  const ts = tm > 1e17 ? 1e-9 : tm > 1e14 ? 1e-6 : tm > 1e11 ? 1e-3 : 1;
  const poses = new Float64Array(rows.length * 8);
  rows.forEach((v, i) => {
    const q = ncol >= 8 ? (wFirst ? [v[5], v[6], v[7], v[4]] : [v[4], v[5], v[6], v[7]]) : [0, 0, 0, 1];
    poses.set([v[0] * ts, v[1], v[2], v[3], ...q], i * 8);
  });
  return { poses, topic: 'テキスト', count: rows.length };
}

export function parseTrajectory(buffer) {
  try {
    const b = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
    const r = MAGIC.every((m, i) => b[i] === m) ? parseMcap(buffer) : parseText(buffer);
    // 姿勢 1 つでは線にならない（R17-002 の偶然読めた 1 姿勢など）
    if (r.count < 2) throw new Error(`軌跡として読める姿勢が ${r.count} 個しかありません（2 個以上必要です）`);
    return r;
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    if (e instanceof Error && /[぀-ヿ一-鿿]/.test(msg)) throw e;
    throw new Error('軌跡のファイルが壊れているか、途中で切れているため開けません');
  }
}
