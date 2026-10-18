// E57（ASTM E2807）: XML の目録 + 圧縮ベクトル（bitPack）の点データ
//   ・複数スキャンはそれぞれの位置・向き（pose）を当てて重ねる
//   ・直交座標（cartesianX/Y/Z）と球座標（sphericalRange/Azimuth/Elevation）の両方に対応
//   ・ファイルは少しずつ読むので、巨大なファイルでも開ける
import { decode, parseXML, xmlChild, xmlChildren } from '../util.js';

class Phys {
  // 1024 バイトごとの末尾 4 バイト（CRC）を飛ばして読む
  constructor(src, page) { this.src = src; this.page = page; this.cacheOff = 0; this.cache = new Uint8Array(0); }
  async byte(p, need) {
    if (p < this.cacheOff || p + need > this.cacheOff + this.cache.length) {
      this.cacheOff = p - (p % this.page);
      this.cache = await this.src.read(this.cacheOff, Math.max(1 << 24, need + 2 * this.page));
    }
    return p - this.cacheOff;
  }
  async read(p, n) { // p は物理位置。n バイトの論理データと、次の物理位置を返す
    const out = new Uint8Array(n);
    let got = 0;
    while (got < n) {
      const pageEnd = p - (p % this.page) + this.page - 4;
      if (p >= pageEnd) { p = pageEnd + 4; continue; }
      const take = Math.min(n - got, pageEnd - p);
      const i = await this.byte(p, take);
      if (i + take > this.cache.length) throw new Error('E57 のデータが途中で切れています');
      out.set(this.cache.subarray(i, i + take), got);
      got += take; p += take;
      if (p === pageEnd) p += 4;
    }
    return { data: out, next: p };
  }
}

const num = (n, name, d = 0) => { const c = xmlChild(n, name); return c ? Number(c.text.trim()) : d; };
const big = (s, d) => {
  if (s === undefined || String(s).trim() === '') return d;
  try { return BigInt(String(s).trim()); } catch (e) { const v = Number(s); return Number.isFinite(v) ? BigInt(Math.round(v)) : d; }
};

function fieldsOf(proto) {
  return proto.children.map(c => {
    const t = c.attrs.type, f = { name: c.name, type: t };
    if (t === 'Float') { f.size = c.attrs.precision === 'single' ? 4 : 8; f.min = Number(c.attrs.minimum ?? -Infinity); f.max = Number(c.attrs.maximum ?? Infinity); }
    else if (t === 'ScaledInteger' || t === 'Integer') {
      // 範囲の属性を省いたときの既定は int64 の全範囲（libE57Format と同じ）。ビット数は整数（BigInt）で数える
      f.minB = big(c.attrs.minimum, -(2n ** 63n)); f.maxB = big(c.attrs.maximum, 2n ** 63n - 1n);
      f.min = Number(f.minB); f.max = Number(f.maxB);
      f.scale = t === 'ScaledInteger' ? Number(c.attrs.scale ?? 1) : 1; f.offset = t === 'ScaledInteger' ? Number(c.attrs.offset ?? 0) : 0;
      const range = f.maxB - f.minB;
      f.bits = range > 0n ? range.toString(2).length : 0;
      if (f.bits > 64) throw new Error(`E57 の項目 ${c.name} の範囲が正しくありません`);
    } else throw new Error(`E57 の項目 ${c.name} の型（${t}）には対応していません`);
    return f;
  });
}

// 1 つの項目の値の流れ（パケットをまたいでつながる）
class Stream {
  constructor(f) { this.f = f; this.buf = new Uint8Array(0); this.bit = 0; this.vals = []; }
  push(bytes) {
    const rest = this.buf.subarray(this.bit >> 3);
    const m = new Uint8Array(rest.length + bytes.length); m.set(rest); m.set(bytes, rest.length);
    this.buf = m; this.bit &= 7;
    const f = this.f, b = this.buf, out = this.vals;
    if (f.type === 'Float') {
      const dv = new DataView(b.buffer, b.byteOffset, b.length);
      let p = this.bit >> 3;
      while (p + f.size <= b.length) { out.push(f.size === 4 ? dv.getFloat32(p, true) : dv.getFloat64(p, true)); p += f.size; }
      this.bit = p * 8;
    } else if (f.bits === 0) {
      // 値が 1 つしかない項目はデータを持たない（記録の数だけ同じ値）
    } else if (f.bits > 52) {
      // 53 bit 以上は Number で正しく足せないので BigInt で読む
      const bits = f.bits, total = b.length * 8, minB = f.minB;
      let pos = this.bit;
      while (pos + bits <= total) {
        let v = 0n, got = 0, byte = pos >> 3, sh = pos & 7;
        while (got < bits) {
          const take = Math.min(8 - sh, bits - got);
          v |= BigInt((b[byte] >> sh) & ((1 << take) - 1)) << BigInt(got);
          got += take; byte++; sh = 0;
        }
        out.push(Number(v + minB) * f.scale + f.offset);
        pos += bits;
      }
      this.bit = pos;
    } else {
      const bits = f.bits, total = b.length * 8;
      let pos = this.bit;
      while (pos + bits <= total) {
        let v = 0, got = 0, byte = pos >> 3, sh = pos & 7;
        while (got < bits) {
          const take = Math.min(8 - sh, bits - got);
          v += ((b[byte] >> sh) & ((1 << take) - 1)) * Math.pow(2, got);
          got += take; byte++; sh = 0;
        }
        out.push((v + f.min) * f.scale + f.offset);
        pos += bits;
      }
      this.bit = pos;
    }
  }
}

function quatMat(w, x, y, z) {
  const n = Math.hypot(w, x, y, z) || 1; w /= n; x /= n; y /= n; z /= n;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}

export async function read(src, sink, ctx) {
  const hb = await src.read(0, 48);
  if (decode(hb, 0, 8) !== 'ASTM-E57') throw new Error('E57 ファイルではありません');
  const hv = new DataView(hb.buffer);
  if (hb.length < 48) throw new Error('E57 のヘッダーが途中で切れています');
  const xmlOff = Number(hv.getBigUint64(24, true)), xmlLen = Number(hv.getBigUint64(32, true)), page = Number(hv.getBigUint64(40, true)) || 1024;
  // 規格のページの大きさは 1024。小さすぎる値（4 以下だと読み進まず止まる）や大きすぎる値は壊れたファイル
  if (page < 64 || page > (1 << 20)) throw new Error(`E57 のページの大きさ（${page}）が正しくありません。ファイルが壊れている可能性があります`);
  if (xmlLen > src.size || xmlOff > src.size) throw new Error('E57 の目録（XML）の位置がファイルの大きさに合いません。ファイルが壊れているか、途中で切れています');
  const phys = new Phys(src, page);
  const xml = decode((await phys.read(xmlOff, xmlLen)).data);
  const root = parseXML(xml);
  const e57 = xmlChild(root, 'e57Root');
  const scans = xmlChildren(xmlChild(e57, 'data3D'), 'vectorChild');
  if (!scans.length) throw new Error('E57 に点群（data3D）がありません');
  const total = scans.reduce((a, s) => a + Number(xmlChild(s, 'points')?.attrs.recordCount || 0), 0);
  sink.hint(total);
  // どれかのスキャンに色があれば最初から色を持つ（色のないスキャンの点は灰色。後から色を足して黒くならないように）
  const anyColor = scans.some(s => xmlChild(xmlChild(xmlChild(s, 'points'), 'prototype'), 'colorRed'));
  if (anyColor) sink.rgb();
  let done = 0;
  for (const s of scans) {
    const pts = xmlChild(s, 'points');
    if (!pts) continue;
    const count = Number(pts.attrs.recordCount), off = Number(pts.attrs.fileOffset);
    if (!count) continue; // 点が 0 個のスキャン（fileOffset が 0 で書かれる）は飛ばす
    const fields = fieldsOf(xmlChild(pts, 'prototype'));
    const idx = Object.fromEntries(fields.map((f, i) => [f.name, i]));
    const cart = idx.cartesianX !== undefined, sph = idx.sphericalRange !== undefined;
    if (!cart && !sph) throw new Error('E57 のスキャンに座標がありません');
    const pose = xmlChild(s, 'pose');
    const q = xmlChild(pose, 'rotation'), t = xmlChild(pose, 'translation');
    const R = q ? quatMat(num(q, 'w', 1), num(q, 'x'), num(q, 'y'), num(q, 'z')) : null;
    const T = t ? [num(t, 'x'), num(t, 'y'), num(t, 'z')] : [0, 0, 0];
    const hasC = idx.colorRed !== undefined;
    const cl = xmlChild(s, 'colorLimits');
    const cmax = cl ? Math.max(num(cl, 'colorRedMaximum', 255), 1) : Math.max(fields[idx.colorRed]?.max || 255, 1);
    const fi = idx.intensity !== undefined ? sink.field('intensity') : -1;
    const extra = fields.map((f, i) => (/^(cartesian|spherical|color)/.test(f.name) || f.name === 'intensity') ? -1 : (/^(rowIndex|columnIndex|returnIndex|returnCount|timeStamp|isTimeStampInvalid|isIntensityInvalid|isColorInvalid)$/.test(f.name) ? -1 : sink.field(f.name, f.type === 'Float' ? f.size === 8 : f.bits > 24)));
    // 圧縮ベクトルの見出し
    const sh = (await phys.read(off, 32)).data;
    const sdv = new DataView(sh.buffer);
    if (sh[0] !== 1) throw new Error('E57 の圧縮ベクトルが読めません');
    let p = Number(sdv.getBigUint64(16, true));
    const streams = fields.map(f => new Stream(f));
    let rec = 0;
    const iX = idx.cartesianX, iY = idx.cartesianY, iZ = idx.cartesianZ, iR = idx.sphericalRange, iA = idx.sphericalAzimuth, iE = idx.sphericalElevation;
    const iInv = idx.cartesianInvalidState ?? idx.sphericalInvalidState;
    const val = (j, r) => { const st = streams[j]; return st.f.bits === 0 && st.f.type !== 'Float' ? st.f.min * st.f.scale + st.f.offset : st.vals[r]; };
    while (rec < count) {
      const ph = await phys.read(p, 6);
      const type = ph.data[0], len = new DataView(ph.data.buffer).getUint16(2, true) + 1;
      const pk = await phys.read(p, len);
      p = pk.next;
      if (type !== 1) continue; // 索引・空のパケットは飛ばす
      const dv = new DataView(pk.data.buffer);
      const nb = dv.getUint16(4, true);
      let o = 6 + 2 * nb;
      for (let j = 0; j < nb; j++) {
        const bl = dv.getUint16(6 + 2 * j, true);
        if (j < streams.length) streams[j].push(pk.data.subarray(o, o + bl));
        o += bl;
      }
      // 全部の項目がそろった記録だけ点にする
      let ready = Infinity;
      for (const st of streams) if (!(st.f.bits === 0 && st.f.type !== 'Float')) ready = Math.min(ready, st.vals.length);
      if (ready === Infinity) ready = count - rec;
      ready = Math.min(ready, count - rec);
      for (let r = 0; r < ready; r++) {
        if (iInv !== undefined && val(iInv, r) !== 0) continue;
        let x, y, z;
        if (cart) { x = val(iX, r); y = val(iY, r); z = val(iZ, r); }
        else { const rr = val(iR, r), az = val(iA, r), el = val(iE, r); x = rr * Math.cos(el) * Math.cos(az); y = rr * Math.cos(el) * Math.sin(az); z = rr * Math.sin(el); }
        if (R) { const a = R[0] * x + R[1] * y + R[2] * z, b = R[3] * x + R[4] * y + R[5] * z, c = R[6] * x + R[7] * y + R[8] * z; x = a; y = b; z = c; }
        const k = sink.slot(x + T[0], y + T[1], z + T[2]);
        if (k < 0) continue;
        if (fi >= 0) sink.F[fi][k] = val(idx.intensity, r);
        for (let j = 0; j < extra.length; j++) if (extra[j] >= 0) sink.F[extra[j]][k] = val(j, r);
        if (hasC) { const C = sink.C, sc = 255 / cmax; C[3 * k] = val(idx.colorRed, r) * sc; C[3 * k + 1] = val(idx.colorGreen, r) * sc; C[3 * k + 2] = val(idx.colorBlue, r) * sc; }
        else if (anyColor) sink.gray(k);
      }
      for (const st of streams) if (st.vals.length) st.vals.splice(0, ready);
      rec += ready; done += ready;
      ctx.progress(done / total);
    }
  }
  return { format: `E57（スキャン ${scans.length} 個）` };
}
