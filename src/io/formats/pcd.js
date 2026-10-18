// PCD（Point Cloud Library）: ascii / binary / binary_compressed
//   ascii と binary は少しずつ読むので、メモリより大きなファイルでも開ける
import { parseHeader, lzfDecompress } from '../../pcd.js';
import { eachLine, numbersIn } from '../util.js';

const RD = {
  F4: (dv, o) => dv.getFloat32(o, true), F8: (dv, o) => dv.getFloat64(o, true),
  U1: (dv, o) => dv.getUint8(o), U2: (dv, o) => dv.getUint16(o, true), U4: (dv, o) => dv.getUint32(o, true),
  I1: (dv, o) => dv.getInt8(o), I2: (dv, o) => dv.getInt16(o, true), I4: (dv, o) => dv.getInt32(o, true),
  U8: (dv, o) => Number(dv.getBigUint64(o, true)), I8: (dv, o) => Number(dv.getBigInt64(o, true)),
};

export async function read(src, sink, ctx) {
  const h = parseHeader(await src.read(0, 1 << 16));
  const names = (h.FIELDS || h.COLUMNS || []).map(s => s.toLowerCase());
  const nf = names.length;
  const sizes = (h.SIZE || []).map(Number);
  const types = (h.TYPE || []).map(s => s.toUpperCase());
  const counts = h.COUNT ? h.COUNT.map(Number) : names.map(() => 1);
  const declared = h.POINTS !== undefined ? Number(h.POINTS[0]) : (h.WIDTH !== undefined ? Number(h.WIDTH[0]) * Number((h.HEIGHT || [1])[0]) : undefined);
  const n = declared || 0;
  const data = (h.DATA || [''])[0].toLowerCase();
  if (!nf) throw new Error('PCD のヘッダーに FIELDS がありません');
  if (declared === undefined) throw new Error('PCD のヘッダーに POINTS がありません');
  if (declared === 0) throw new Error('この PCD は点が 0 個です（POINTS 0 の空の点群）');
  if (!(n > 0) || Math.floor(n) !== n) throw new Error(`PCD の点の数（${h.POINTS?.[0] ?? h.WIDTH?.[0]}）が正しくありません`);
  const ix = names.indexOf('x'), iy = names.indexOf('y'), iz = names.indexOf('z');
  if (ix < 0 || iy < 0 || iz < 0) throw new Error('x, y, z の項目がありません');
  const rgbIdx = names.findIndex(nm => nm === 'rgb' || nm === 'rgba');
  if (rgbIdx >= 0) sink.rgb();
  // F8・64/32 bit の整数の欄（時刻など）は double で持つ（float32 の桁落ちを防ぐ）
  const fslot = names.map((nm, f) => (nm === '_' || f === ix || f === iy || f === iz || f === rgbIdx || names.indexOf(nm) !== f) ? -1 : sink.field(nm, sizes[f] === 8 || (sizes[f] === 4 && types[f] !== 'F')));
  sink.hint(n);
  const offs = []; let stride = 0;
  for (let f = 0; f < nf; f++) { offs.push(stride); stride += sizes[f] * counts[f]; }
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  const putRgb = (k, c) => { const C = sink.C; C[3 * k] = (c >> 16) & 255; C[3 * k + 1] = (c >> 8) & 255; C[3 * k + 2] = c & 255; };

  if (data === 'ascii') {
    const first = []; let acc = 0;
    for (let f = 0; f < nf; f++) { first.push(acc); acc += counts[f]; }
    const v = new Float64Array(acc + 4);
    let p = 0;
    await eachLine(src, h.dataOffset, (b, s, e) => {
      if (p >= n) return false;
      const cnt = numbersIn(b, s, e, v);
      if (cnt < 3) return;
      for (let j = cnt; j < v.length; j++) v[j] = NaN; // 値が足りない行: 前の行の値を残さない
      p++;
      const k = sink.slot(v[first[ix]], v[first[iy]], v[first[iz]]);
      if (k < 0) return;
      for (let f = 0; f < nf; f++) if (fslot[f] >= 0) sink.F[fslot[f]][k] = v[first[f]];
      if (rgbIdx >= 0) { const x = v[first[rgbIdx]]; if (x === x) { f32[0] = x; putRgb(k, types[rgbIdx] === 'F' ? u32[0] : x >>> 0); } }
    }, ctx.progress);
  } else if (data === 'binary') {
    const rd = names.map((_, f) => { const r = RD[types[f] + sizes[f]]; if (!r) throw new Error(`未対応の型です: ${types[f]}${sizes[f]}`); return r; });
    const per = Math.max(1, Math.floor((1 << 24) / stride));
    for (let p0 = 0; p0 < n; p0 += per) {
      const m = Math.min(per, n - p0);
      const buf = await src.read(h.dataOffset + p0 * stride, m * stride);
      if (buf.length < m * stride) throw new Error(`データが途中で切れています（${(p0 + Math.floor(buf.length / stride)).toLocaleString()} / ${n.toLocaleString()} 点）`);
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.length);
      for (let i = 0; i < m; i++) {
        const o = i * stride;
        const k = sink.slot(rd[ix](dv, o + offs[ix]), rd[iy](dv, o + offs[iy]), rd[iz](dv, o + offs[iz]));
        if (k < 0) continue;
        for (let f = 0; f < nf; f++) if (fslot[f] >= 0) sink.F[fslot[f]][k] = rd[f](dv, o + offs[f]);
        if (rgbIdx >= 0) putRgb(k, dv.getUint32(o + offs[rgbIdx], true));
      }
      ctx.progress((p0 + m) / n);
    }
  } else if (data === 'binary_compressed') {
    const rd = names.map((_, f) => { const r = RD[types[f] + sizes[f]]; if (!r) throw new Error(`未対応の型です: ${types[f]}${sizes[f]}`); return r; });
    const head = await src.read(h.dataOffset, 8);
    if (head.length < 8) throw new Error('データが途中で切れています（圧縮データの頭がありません）');
    const hv = new DataView(head.buffer);
    const csize = hv.getUint32(0, true), usize = hv.getUint32(4, true);
    // 展開後の大きさは「点数 × 1 点の大きさ」と同じはず。LZF は 100 倍を超えて縮まないので、それより大きい宣言は壊れたファイル
    if (usize !== n * stride) throw new Error('圧縮データの大きさが点数と合いません（ファイルが壊れている可能性があります）');
    if (usize > csize * 100 + 1024 || csize > src.size) throw new Error(`圧縮データの大きさ（展開後 ${usize.toLocaleString()} バイト）がファイルの大きさに合いません。ファイルが壊れている可能性があります`);
    const comp = await src.read(h.dataOffset + 8, csize);
    const out = lzfDecompress(comp, usize);
    if (out.length < n * stride) throw new Error('圧縮データの大きさが合いません');
    const dv = new DataView(out.buffer);
    // 項目ごとに n 個ずつ並んでいる
    const base = names.map((_, f) => n * offs[f]), step = names.map((_, f) => sizes[f] * counts[f]);
    for (let p = 0; p < n; p++) {
      const k = sink.slot(rd[ix](dv, base[ix] + p * step[ix]), rd[iy](dv, base[iy] + p * step[iy]), rd[iz](dv, base[iz] + p * step[iz]));
      if (k < 0) continue;
      for (let f = 0; f < nf; f++) if (fslot[f] >= 0) sink.F[fslot[f]][k] = rd[f](dv, base[f] + p * step[f]);
      if (rgbIdx >= 0) putRgb(k, dv.getUint32(base[rgbIdx] + p * step[rgbIdx], true));
      if ((p & 0xfffff) === 0) ctx.progress(p / n);
    }
  } else throw new Error(`未対応の DATA 形式です: ${data}`);
  return { format: `PCD（${data}）`, fields: names };
}
