// PCD ファイルの読み込み（ascii / binary / binary_compressed）
// 戻り値: { n, positions: Float32Array(3n), fields: {name: Float32Array(n)}, rgb: Uint8Array(3n)|null, header }

const TYPE_READERS = {
  F4: (dv, o) => dv.getFloat32(o, true),
  F8: (dv, o) => dv.getFloat64(o, true),
  U1: (dv, o) => dv.getUint8(o),
  U2: (dv, o) => dv.getUint16(o, true),
  U4: (dv, o) => dv.getUint32(o, true),
  I1: (dv, o) => dv.getInt8(o),
  I2: (dv, o) => dv.getInt16(o, true),
  I4: (dv, o) => dv.getInt32(o, true),
  U8: (dv, o) => Number(dv.getBigUint64(o, true)),
  I8: (dv, o) => Number(dv.getBigInt64(o, true)),
};

export function parseHeader(bytes) {
  const header = {};
  // 先頭の BOM は飛ばす。改行は LF・CRLF・CR だけ（古い Mac 形式）のどれでもよい
  let pos = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const limit = Math.min(bytes.length, 1 << 16);
  while (pos < limit) {
    let end = pos;
    while (end < limit && bytes[end] !== 10 && bytes[end] !== 13) end++;
    const line = new TextDecoder().decode(bytes.subarray(pos, end)).trim();
    pos = end + 1;
    if (bytes[end] === 13 && bytes[end + 1] === 10) pos++;
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(/\s+/);
    const k = key.toUpperCase();
    header[k] = rest;
    if (k === 'DATA') {
      header.dataOffset = pos;
      return header;
    }
  }
  throw new Error('PCD のヘッダーが読めません（DATA 行が見つからない）');
}

export function lzfDecompress(inp, outLen) {
  const out = new Uint8Array(outLen);
  let ip = 0, op = 0;
  while (ip < inp.length) {
    let ctrl = inp[ip++];
    if (ctrl < 32) {
      ctrl++;
      if (op + ctrl > outLen || ip + ctrl > inp.length) throw new Error('圧縮データが壊れています');
      out.set(inp.subarray(ip, ip + ctrl), op);
      ip += ctrl; op += ctrl;
    } else {
      let len = ctrl >> 5;
      let ref = op - ((ctrl & 0x1f) << 8) - 1;
      // 参照の残りのバイト（長さ 7 なら 2 バイト）が切れていたら壊れている（0 で埋めて成功にしない）
      if (ip + (len === 7 ? 2 : 1) > inp.length) throw new Error('圧縮データが壊れています（途中で切れています）');
      if (len === 7) len += inp[ip++];
      ref -= inp[ip++];
      len += 2;
      if (ref < 0 || op + len > outLen) throw new Error('圧縮データが壊れています');
      for (let k = 0; k < len; k++) out[op++] = out[ref++];
    }
  }
  if (op !== outLen) throw new Error('圧縮データの大きさが合いません');
  return out;
}

// バイト列から数値を直接読む（巨大な ascii でも文字列を作らない）
function asciiNumbers(bytes, start, onValue) {
  let i = start;
  const n = bytes.length;
  while (i < n) {
    let c = bytes[i];
    if (c === 32 || c === 9 || c === 13 || c === 10) {
      if (c === 10) onValue(null);
      i++;
      continue;
    }
    // 1 語を読む
    const s = i;
    while (i < n && (c = bytes[i]) !== 32 && c !== 9 && c !== 13 && c !== 10) i++;
    onValue(parseToken(bytes, s, i));
  }
  onValue(null);
}

function parseToken(b, s, e) {
  let i = s, neg = false;
  if (b[i] === 45) { neg = true; i++; } else if (b[i] === 43) i++;
  const c0 = b[i] | 32;
  if (c0 === 110) return NaN; // nan
  if (c0 === 105) return neg ? -Infinity : Infinity; // inf
  let v = 0, digits = 0;
  while (i < e && b[i] >= 48 && b[i] <= 57) { v = v * 10 + (b[i] - 48); i++; digits++; }
  if (i < e && b[i] === 46) {
    i++;
    let f = 0.1;
    while (i < e && b[i] >= 48 && b[i] <= 57) { v += (b[i] - 48) * f; f *= 0.1; i++; digits++; }
  }
  if (i < e && (b[i] | 32) === 101) {
    i++;
    let eneg = false;
    if (b[i] === 45) { eneg = true; i++; } else if (b[i] === 43) i++;
    let ex = 0;
    while (i < e && b[i] >= 48 && b[i] <= 57) { ex = ex * 10 + (b[i] - 48); i++; }
    v *= Math.pow(10, eneg ? -ex : ex);
  }
  if (!digits) return NaN;
  return neg ? -v : v;
}

export function parsePCD(buffer, onProgress = () => {}) {
  const bytes = new Uint8Array(buffer);
  const h = parseHeader(bytes);
  const names = (h.FIELDS || h.COLUMNS || []).map(s => s.toLowerCase());
  const nf = names.length;
  const sizes = (h.SIZE || []).map(Number);
  const types = (h.TYPE || []).map(s => s.toUpperCase());
  const counts = h.COUNT ? h.COUNT.map(Number) : names.map(() => 1);
  const n = Number((h.POINTS || [])[0]) || (Number((h.WIDTH || [])[0]) * Number((h.HEIGHT || [1])[0]));
  const dataType = (h.DATA || [''])[0].toLowerCase();
  if (!nf || !n) throw new Error('PCD のヘッダーに FIELDS または POINTS がありません');
  const ix = names.indexOf('x'), iy = names.indexOf('y'), iz = names.indexOf('z');
  if (ix < 0 || iy < 0 || iz < 0) throw new Error('x, y, z の項目がありません');

  // 読み込む値（各項目の先頭要素）を raw[field] に入れる
  const raw = names.map(() => new Float32Array(n));
  const rgbIdx = names.findIndex(nm => nm === 'rgb' || nm === 'rgba');
  const rgbRaw = rgbIdx >= 0 ? new Uint32Array(n) : null;

  if (dataType === 'ascii') {
    const tokensPerPoint = counts.reduce((a, b) => a + b, 0);
    const firstToken = [];
    let acc = 0;
    for (let f = 0; f < nf; f++) { firstToken.push(acc); acc += counts[f]; }
    const tokenField = new Int32Array(tokensPerPoint).fill(-1);
    firstToken.forEach((t, f) => { tokenField[t] = f; });
    let p = 0, t = 0;
    const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
    asciiNumbers(bytes, h.dataOffset, v => {
      if (v === null) { if (t > 0) { p++; t = 0; if ((p & 0xfffff) === 0) onProgress(p / n); } return; }
      if (p >= n) return;
      const f = t < tokensPerPoint ? tokenField[t] : -1;
      if (f >= 0) {
        raw[f][p] = v;
        if (f === rgbIdx) { f32[0] = v; rgbRaw[p] = types[f] === 'F' ? u32[0] : v >>> 0; }
      }
      t++;
    });
  } else if (dataType === 'binary' || dataType === 'binary_compressed') {
    let data, soa = false;
    if (dataType === 'binary') {
      data = new DataView(buffer, h.dataOffset);
    } else {
      const dv = new DataView(buffer, h.dataOffset);
      const csize = dv.getUint32(0, true), usize = dv.getUint32(4, true);
      const comp = bytes.subarray(h.dataOffset + 8, h.dataOffset + 8 + csize);
      const out = lzfDecompress(comp, usize);
      data = new DataView(out.buffer);
      soa = true;
    }
    const stride = sizes.reduce((a, s, f) => a + s * counts[f], 0);
    const offs = [];
    let acc = 0;
    for (let f = 0; f < nf; f++) { offs.push(acc); acc += sizes[f] * counts[f]; }
    const need = soa ? n * stride : n * stride;
    if (data.byteLength < need) throw new Error(`データが途中で切れています（${data.byteLength} / ${need} バイト）`);
    for (let f = 0; f < nf; f++) {
      const key = types[f] + sizes[f];
      const rd = TYPE_READERS[key];
      if (!rd) throw new Error(`未対応の型です: ${key}`);
      const out = raw[f];
      const isRgb = f === rgbIdx;
      if (soa) {
        // 項目ごとに n 個（COUNT 個ずつ）並んでいる
        const base = n * offs[f];
        const step = sizes[f] * counts[f];
        if (key === 'F4' && counts[f] === 1 && ((data.byteOffset + base) % 4 === 0) && !isRgb) {
          out.set(new Float32Array(data.buffer, data.byteOffset + base, n));
        } else {
          for (let p = 0; p < n; p++) {
            const o = base + p * step;
            out[p] = rd(data, o);
            if (isRgb) rgbRaw[p] = data.getUint32(o, true);
          }
        }
      } else {
        for (let p = 0; p < n; p++) {
          const o = p * stride + offs[f];
          out[p] = rd(data, o);
          if (isRgb) rgbRaw[p] = data.getUint32(o, true);
        }
      }
      onProgress((f + 1) / nf);
    }
  } else {
    throw new Error(`未対応の DATA 形式です: ${dataType}`);
  }

  // 座標が NaN / 無限大の点を除く
  const X = raw[ix], Y = raw[iy], Z = raw[iz];
  let m = 0;
  const keep = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (Number.isFinite(X[p]) && Number.isFinite(Y[p]) && Number.isFinite(Z[p])) { keep[p] = 1; m++; }
  }
  const positions = new Float32Array(m * 3);
  const fields = {};
  const fieldIdx = [];
  names.forEach((nm, f) => { if (f !== ix && f !== iy && f !== iz && f !== rgbIdx && !(nm in fields)) { fields[nm] = null; fieldIdx.push([nm, f]); } });
  const rgb = rgbRaw ? new Uint8Array(m * 3) : null;
  if (m === n) {
    for (let p = 0; p < n; p++) { positions[3 * p] = X[p]; positions[3 * p + 1] = Y[p]; positions[3 * p + 2] = Z[p]; }
    for (const [nm, f] of fieldIdx) fields[nm] = raw[f];
  } else {
    const idx = new Uint32Array(m);
    let q = 0;
    for (let p = 0; p < n; p++) if (keep[p]) idx[q++] = p;
    for (let k = 0; k < m; k++) { const p = idx[k]; positions[3 * k] = X[p]; positions[3 * k + 1] = Y[p]; positions[3 * k + 2] = Z[p]; }
    for (const [nm, f] of fieldIdx) { const src = raw[f], dst = new Float32Array(m); for (let k = 0; k < m; k++) dst[k] = src[idx[k]]; fields[nm] = dst; }
    if (rgbRaw) { const tmp = new Uint32Array(m); for (let k = 0; k < m; k++) tmp[k] = rgbRaw[idx[k]]; rgbRaw.set(tmp.subarray(0, m)); }
  }
  if (rgb) for (let k = 0; k < m; k++) { const c = rgbRaw[k]; rgb[3 * k] = (c >> 16) & 255; rgb[3 * k + 1] = (c >> 8) & 255; rgb[3 * k + 2] = c & 255; }
  return { n: m, skipped: n - m, positions, fields, rgb, header: { fields: names, data: dataType, points: n } };
}
