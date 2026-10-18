// LAS 1.0〜1.4（点の形式 0〜10）と LAZ（laz-perf で展開）
//   LAS は少しずつ読む（10 億点でも可）。LAZ はファイル全体を展開器に渡すため、1.8 GB までのファイルに限る
import createLazPerf from 'laz-perf/lib/web/laz-perf.js';

// 展開部品（wasm）はファイルごとに作り、読み終えたら捨てる。
// 使い回すと、一度大きく広がった wasm のメモリ（≒ いちばん大きかった LAZ の大きさ）が別スレッドに残り続ける
async function lazPerf(ctx) {
  return createLazPerf({ wasmBinary: await ctx.asset('laz-perf.wasm') });
}

function header(b) {
  if (b.length < 4 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'LASF') throw new Error('LAS ファイルではありません（先頭が LASF でない）');
  if (b.length < 227) throw new Error(`LAS のヘッダーが途中で切れています（${b.length} バイト）`);
  const dv = new DataView(b.buffer, b.byteOffset, b.length);
  const h = {
    major: b[24], minor: b[25], headerSize: dv.getUint16(94, true), dataOffset: dv.getUint32(96, true), nvlr: dv.getUint32(100, true),
    rawFormat: b[104], format: b[104] & 0x3f, recLen: dv.getUint16(105, true), count: dv.getUint32(107, true),
    scale: [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)],
    off: [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)],
  };
  if (h.minor >= 4 && h.headerSize >= 375) { const c = Number(dv.getBigUint64(247, true)); if (c) h.count = c; }
  h.compressed = (h.rawFormat & 0xc0) !== 0;
  return h;
}

const RGB_AT = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 };
const GPS_AT = { 1: 20, 3: 20, 4: 20, 5: 20, 6: 22, 7: 22, 8: 22, 9: 22, 10: 22 };

// 1 点を読む関数を作る
//   rgbShift: 8（16 bit の色）/ 0（8 bit）/ null（LAZ: 上位 8 bit を色に、下位 8 bit を lo に持ち、最後に決める）
function decoder(h, sink, rgbShift, lo = null) {
  const f = h.format, ext = f >= 6;
  const fi = sink.field('intensity'), fc = sink.field('classification'), fr = sink.field('return_number');
  const gpsAt = GPS_AT[f], fg = gpsAt !== undefined ? sink.field('gps_time') : -1;
  const fs = sink.field('point_source_id');
  const rgbAt = RGB_AT[f];
  if (rgbAt !== undefined) sink.rgb();
  const [sx, sy, sz] = h.scale, [ox, oy, oz] = h.off;
  let t0 = null;
  const dec = (dv, o) => {
    const k = sink.slot(dv.getInt32(o, true) * sx + ox, dv.getInt32(o + 4, true) * sy + oy, dv.getInt32(o + 8, true) * sz + oz);
    if (k < 0) return;
    const F = sink.F;
    F[fi][k] = dv.getUint16(o + 12, true);
    const rb = dv.getUint8(o + 14);
    F[fr][k] = ext ? rb & 15 : rb & 7;
    F[fc][k] = ext ? dv.getUint8(o + 16) : dv.getUint8(o + 15) & 31;
    F[fs][k] = dv.getUint16(o + (ext ? 20 : 18), true);
    // GPS 時刻は最初の点からの差で持つ（float32 の桁落ちを防ぐ）。基準値は fieldBase で画面へ渡す
    if (fg >= 0) { const t = dv.getFloat64(o + gpsAt, true); if (t0 === null) { t0 = t; sink.base.gps_time = t0; } F[fg][k] = t - t0; }
    if (rgbAt !== undefined) {
      const C = sink.C;
      const r = dv.getUint16(o + rgbAt, true), g = dv.getUint16(o + rgbAt + 2, true), b = dv.getUint16(o + rgbAt + 4, true);
      if (lo) {
        const m = r | g | b;
        if (m > dec.max) dec.max = m;
        C[3 * k] = r >> 8; C[3 * k + 1] = g >> 8; C[3 * k + 2] = b >> 8;
        if (lo.a.length < sink.C.length) { const a = new Uint8Array(sink.C.length); a.set(lo.a); lo.a = a; }
        lo.a[3 * k] = r; lo.a[3 * k + 1] = g; lo.a[3 * k + 2] = b;
      } else {
        // 抜き出した点では 8 bit に見えたが、255 を超える値が来たら以後は 16 bit とみなす（下位 8 bit だけの色にしない）
        if (rgbShift === 0 && (r | g | b) > 255) rgbShift = 8;
        C[3 * k] = r >> rgbShift; C[3 * k + 1] = g >> rgbShift; C[3 * k + 2] = b >> rgbShift;
      }
    }
  };
  dec.max = 0;
  return dec;
}
// 色が 16 bit（0〜65535）か 8 bit（0〜255）かを、ファイル全体から等間隔に抜き出した点で判断する
// （先頭に色のない 0,0,0 の点や暗い点が並ぶファイルで 8 bit と誤らないように）
async function rgbShiftOf(src, h) {
  const at = RGB_AT[h.format];
  if (at === undefined || !h.count) return 0;
  const blocks = 64, per = 512;
  const avail = Math.max(0, Math.min(h.count, Math.floor((src.size - h.dataOffset) / h.recLen)));
  let mx = 0;
  for (let j = 0; j < blocks && mx <= 255; j++) {
    const p0 = Math.floor(j * Math.max(0, avail - per) / (blocks - 1));
    const m = Math.min(per, avail - p0);
    if (m <= 0) break;
    const b = await src.read(h.dataOffset + p0 * h.recLen, m * h.recLen);
    const dv = new DataView(b.buffer, b.byteOffset, b.length);
    const got = Math.floor(b.length / h.recLen);
    for (let i = 0; i < got; i++) { const o = i * h.recLen + at; mx = Math.max(mx, dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true)); }
    if (avail <= per) break;
  }
  return mx > 255 ? 8 : 0;
}

export async function read(src, sink, ctx) {
  const h = header(await src.read(0, 400));
  if (h.format > 10) throw new Error(`未対応の点の形式です（${h.format}）`);
  sink.hint(h.count);
  const name = `${h.compressed ? 'LAZ' : 'LAS'} ${h.major}.${h.minor}（点の形式 ${h.format}）`;
  if (!h.compressed) {
    if (h.recLen < 20) throw new Error(`LAS の 1 点の大きさ（${h.recLen} バイト）が正しくありません。ファイルが壊れている可能性があります`);
    const per = Math.max(1, Math.floor((1 << 24) / h.recLen));
    const dec = decoder(h, sink, await rgbShiftOf(src, h));
    let read = 0;
    for (let p0 = 0; p0 < h.count; p0 += per) {
      const m = Math.min(per, h.count - p0);
      const buf = await src.read(h.dataOffset + p0 * h.recLen, m * h.recLen);
      const got = Math.floor(buf.length / h.recLen);
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.length);
      for (let i = 0; i < got; i++) dec(dv, i * h.recLen);
      read += got;
      ctx.progress((p0 + got) / h.count);
      if (got < m) break; // 途中で切れている
    }
    const note = read < h.count ? `ヘッダーでは ${h.count.toLocaleString()} 点ですが、${read.toLocaleString()} 点で途切れています（ファイルが途中で切れている可能性があります）` : '';
    return { format: name, note };
  }
  // LAZ
  if (src.size > 1.8e9) throw new Error('LAZ は 1.8 GB までのファイルに対応しています。それより大きい場合は LAS に変換してください');
  let L = await lazPerf(ctx);
  const filePtr = L._malloc(src.size);
  if (!filePtr) throw new Error('LAZ を展開するメモリが足りません');
  const laz = new L.LASZip();
  let dataPtr = 0;
  const lo = { a: new Uint8Array(0) }; // 色の下位 8 bit（全体が 8 bit の色だったときに使う）
  let dec = null;
  try {
    for (let off = 0; off < src.size; off += 1 << 24) {
      const b = await src.read(off, 1 << 24);
      L.HEAPU8.set(b, filePtr + off);
      ctx.progress(0.2 * (off + b.length) / src.size);
    }
    laz.open(filePtr, src.size);
    const n = laz.getCount(), len = laz.getPointLength();
    const hh = { ...h, recLen: len, format: laz.getPointFormat() };
    const per = 20000;
    dataPtr = L._malloc(len * per);
    const tmp = new Uint8Array(len * per);
    const dv = new DataView(tmp.buffer);
    // LAZ は全体を見てから色の bit 数を決める（読みながら最大値を取り、最後に 8 bit だったら下位の値に戻す）
    dec = decoder(hh, sink, null, RGB_AT[hh.format] !== undefined ? lo : null);
    for (let p0 = 0; p0 < n; p0 += per) {
      const m = Math.min(per, n - p0);
      for (let i = 0; i < m; i++) laz.getPoint(dataPtr + i * len);
      tmp.set(L.HEAPU8.subarray(dataPtr, dataPtr + m * len));
      for (let i = 0; i < m; i++) dec(dv, i * len);
      ctx.progress(0.2 + 0.8 * (p0 + m) / n);
    }
  } finally {
    laz.delete();
    L._free(filePtr);
    if (dataPtr) L._free(dataPtr);
    L = null; // wasm のメモリごと捨てる
  }
  if (dec && lo.a.length && dec.max <= 255 && sink.C) {
    const m = Math.min(sink.C.length, lo.a.length, 3 * sink.n);
    sink.C.set(lo.a.subarray(0, m));
  }
  return { format: name };
}
