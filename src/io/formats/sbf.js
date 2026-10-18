// CloudCompare の Simple Binary File: 文字の見出し（.sbf）+ 中身（.sbf.data、ビッグエンディアン）
//   .sbf.data: 2 バイトの印（42 42）・点数（8）・値の欄の数（2）・座標のずれ（double × 3）→ 64 バイトまで空き
//   以降は 1 点ごとに float の x y z と値の欄
import { decode } from '../util.js';

export async function read(src, sink, ctx) {
  let head = '', data = null;
  if (ctx.name.toLowerCase().endsWith('.data')) {
    data = src;
    const hn = ctx.name.slice(0, -5);
    const h = Object.entries(ctx.companions).find(([n]) => n.toLowerCase() === hn.toLowerCase());
    if (h) head = await h[1].text();
  } else {
    head = decode(await src.all(1e6));
    const dn = Object.entries(ctx.companions).find(([n]) => n.toLowerCase() === (ctx.name + '.data').toLowerCase());
    if (!dn) throw new Error(`中身のファイル ${ctx.name}.data も一緒に選んでください`);
    data = { blob: dn[1], size: dn[1].size, read: async (o, l) => new Uint8Array(await dn[1].slice(o, o + l).arrayBuffer()) };
  }
  const kv = {};
  for (const l of head.split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) kv[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  // GlobalShift は CloudCompare の中の座標に戻すための値。.sbf.data の「座標のずれ」を足せば元の座標になるので使わない
  const h = await data.read(0, 64);
  if (h.length < 64) throw new Error('.sbf.data の頭が途中で切れています');
  const dv = new DataView(h.buffer);
  if (dv.getUint16(0, false) !== (42 | (42 << 8))) throw new Error('.sbf.data の印が違います');
  const n = Number(dv.getBigUint64(2, false)), nsf = dv.getUint16(10, false);
  const cs = [dv.getFloat64(12, false), dv.getFloat64(20, false), dv.getFloat64(28, false)];
  const sfs = [];
  for (let i = 0; i < nsf; i++) {
    const w = (kv[`SF${i + 1}`] || `sf${i + 1}`).split(',').map(s => s.trim());
    const s = w.find(t => t.startsWith('s='));
    const off = s ? Number(s.slice(2)) || 0 : 0;
    // 値のずれ（s=）がある欄は double で持つ（float に足すと桁が落ちる）
    sfs.push({ k: sink.field(w[0].toLowerCase(), Math.abs(off) >= 1e5), off });
  }
  sink.hint(n);
  const stride = 4 * (3 + nsf), per = Math.floor((1 << 24) / stride);
  for (let p0 = 0; p0 < n; p0 += per) {
    const m = Math.min(per, n - p0);
    const b = await data.read(64 + p0 * stride, m * stride);
    const d = new DataView(b.buffer, b.byteOffset, b.length);
    const got = Math.floor(b.length / stride);
    for (let i = 0; i < got; i++) {
      const o = i * stride;
      // 元の座標 = 書かれた値 + 座標のずれ
      const k = sink.slot(d.getFloat32(o, false) + cs[0], d.getFloat32(o + 4, false) + cs[1], d.getFloat32(o + 8, false) + cs[2]);
      if (k < 0) continue;
      for (let j = 0; j < nsf; j++) sink.F[sfs[j].k][k] = d.getFloat32(o + 12 + 4 * j, false) + sfs[j].off;
    }
    ctx.progress((p0 + m) / n);
    if (got < m) break;
  }
  return { format: `CloudCompare SBF（値の欄 ${nsf} 個）` };
}
