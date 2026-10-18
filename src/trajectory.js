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
  let compressed = false;

  function records(dv2, start, end) {
    const c = new Cursor(dv2, start);
    while (c.pos + 9 <= end) {
      const op = c.u8();
      const len = c.u64();
      const body = c.pos;
      if (body + len > end) break;
      if (op === 0x03) { // Schema
        const id = c.u16(); const name = c.str();
        schemas.set(id, name);
      } else if (op === 0x04) { // Channel
        const id = c.u16(); const schemaId = c.u16(); const topic = c.str();
        channels.set(id, { topic, schema: schemaId });
      } else if (op === 0x05) { // Message
        const ch = c.u16(); c.u32(); c.u64(); c.u64();
        const info = channels.get(ch);
        const type = info && schemas.get(info.schema);
        const dec = type && DECODERS[type];
        if (dec) {
          const data = new Uint8Array(dv2.buffer, dv2.byteOffset + c.pos, body + len - c.pos);
          try {
            const v = dec(new Cdr(data));
            if (!byTopic.has(info.topic)) byTopic.set(info.topic, []);
            byTopic.get(info.topic).push(v);
          } catch (e) { /* 読めないメッセージは飛ばす */ }
        }
      } else if (op === 0x06) { // Chunk
        c.u64(); c.u64(); c.u64(); c.u32();
        const comp = c.str();
        const rlen = c.u64();
        if (comp) compressed = true;
        else records(dv2, c.pos, c.pos + rlen);
      }
      c.pos = body + len;
    }
  }
  records(dv, 8, buffer.byteLength);
  if (!byTopic.size) {
    throw new Error(compressed
      ? '圧縮された MCAP には対応していません（rosbag2 の既定は無圧縮です）'
      : '軌跡（Odometry / PoseStamped）のメッセージが見つかりません');
  }
  // メッセージが最も多いトピックを使う（/Odometry を優先）
  let topic = byTopic.has('/Odometry') ? '/Odometry' : [...byTopic.keys()].sort((a, b) => byTopic.get(b).length - byTopic.get(a).length)[0];
  const list = byTopic.get(topic);
  const poses = new Float64Array(list.length * 8);
  list.forEach((v, i) => poses.set(v, i * 8));
  return { poses, topic, count: list.length };
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
  // 時刻がナノ秒（EuRoC など。1e17 以上）なら秒に直す
  const ts = rows[rows.length >> 1][0] > 1e17 ? 1e-9 : 1;
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
    if (MAGIC.every((m, i) => b[i] === m)) return parseMcap(buffer);
    return parseText(buffer);
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    if (e instanceof Error && /[぀-ヿ一-鿿]/.test(msg)) throw e;
    throw new Error('軌跡のファイルが壊れているか、途中で切れているため開けません');
  }
}
