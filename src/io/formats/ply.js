// PLY（ascii / binary_little_endian / binary_big_endian）
//   面（face）があれば面の上に点を散らす。面がなければ頂点を少しずつ読む（巨大な点群でも可）
import { decodeLatin, eachLine, numbersIn, checkCount } from '../util.js';
import { addMesh } from '../sink.js';

const TYPES = {
  char: ['getInt8', 1], int8: ['getInt8', 1], uchar: ['getUint8', 1], uint8: ['getUint8', 1],
  short: ['getInt16', 2], int16: ['getInt16', 2], ushort: ['getUint16', 2], uint16: ['getUint16', 2],
  int: ['getInt32', 4], int32: ['getInt32', 4], uint: ['getUint32', 4], uint32: ['getUint32', 4],
  float: ['getFloat32', 4], float32: ['getFloat32', 4], double: ['getFloat64', 8], float64: ['getFloat64', 8],
};

export function parsePlyHeader(b) {
  const bom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0; // メモ帳などの UTF-8 の BOM
  const txt = decodeLatin(b, bom, Math.min(b.length, 1 << 16));
  const em = /end_header(\r\n|\r|\n)/.exec(txt);
  if (!txt.startsWith('ply') || !em) throw new Error('PLY のヘッダーが読めません');
  const end = em.index;
  const lines = txt.slice(0, end).split(/\r\n|\r|\n/);
  const h = { format: 'ascii', elements: [], dataOffset: bom + end + em[0].length, comments: [] };
  for (const l of lines) {
    const w = l.trim().split(/\s+/);
    if (w[0] === 'format') h.format = w[1];
    else if (w[0] === 'comment' || w[0] === 'obj_info') h.comments.push(l);
    else if (w[0] === 'element') h.elements.push({ name: w[1], count: Number(w[2]), props: [] });
    else if (w[0] === 'property') {
      const el = h.elements[h.elements.length - 1];
      if (w[1] === 'list') el.props.push({ name: w[4], list: true, ct: TYPES[w[2]], it: TYPES[w[3]] });
      else el.props.push({ name: w[2], t: TYPES[w[1]] });
    }
  }
  for (const el of h.elements) for (const p of el.props) if (!(p.t || (p.ct && p.it))) throw new Error(`PLY の型が読めません（${el.name}.${p.name}）`);
  return h;
}

// バイナリを順に読むための入れ物（足りなくなったら続きを読む）
class Cur {
  constructor(src, off) { this.src = src; this.off = off; this.buf = new Uint8Array(0); this.p = 0; this.dv = new DataView(this.buf.buffer); }
  async fill(min) {
    if (this.buf.length - this.p >= min || this.off >= this.src.size) return;
    const rest = this.buf.subarray(this.p);
    const nb = await this.src.read(this.off, Math.max(1 << 24, min));
    this.off += nb.length;
    const m = new Uint8Array(rest.length + nb.length); m.set(rest); m.set(nb, rest.length);
    this.buf = m; this.p = 0; this.dv = new DataView(m.buffer);
  }
  // n バイトあることを確かめる（足りなければ続きを読み、それでも足りなければ途中で切れている）
  async need(n) {
    if (this.buf.length - this.p >= n) return;
    await this.fill(n);
    if (this.buf.length - this.p < n) throw new Error('PLY のデータが途中で切れています（ファイルが壊れているか、コピーの途中で切れている可能性があります）');
  }
}

export async function read(src, sink, ctx) {
  const h = parsePlyHeader(await src.read(0, 1 << 16));
  const le = h.format === 'binary_little_endian', ascii = h.format === 'ascii';
  if (!ascii && !le && h.format !== 'binary_big_endian') throw new Error(`未対応の PLY 形式です: ${h.format}`);
  const vEl = h.elements.find(e => e.name === 'vertex');
  if (!vEl) throw new Error('PLY に頂点（vertex）がありません');
  const fEl = h.elements.find(e => e.name === 'face' || e.name === 'tristrips');
  const P = vEl.props.map(p => p.name.toLowerCase());
  const at = re => P.findIndex(n => re.test(n));
  const ix = at(/^x$/), iy = at(/^y$/), iz = at(/^z$/);
  if (ix < 0 || iy < 0 || iz < 0) throw new Error('頂点に x, y, z がありません');
  const ir = at(/^(red|r|diffuse_red)$/), ig = at(/^(green|g|diffuse_green)$/), ib = at(/^(blue|b|diffuse_blue)$/);
  const hasRgb = ir >= 0 && ig >= 0 && ib >= 0;
  // 色の型: float / double は 0〜1（×255）、ushort などの 16 bit は 0〜65535（>> 8）。t[0] は DataView の関数名
  const rgbT = hasRgb ? String(vEl.props[ir].t?.[0]) : '';
  const rgbFloat = /Float/.test(rgbT), rgb16 = /16/.test(rgbT), rgb32 = /32/.test(rgbT) && !rgbFloat;
  const mesh = fEl && fEl.count > 0 && vEl.count <= 2e7;
  const strips = fEl && fEl.name === 'tristrips';
  // 値の欄（強度など）。座標・色・法線・透明度以外。double・32 bit の整数の欄は double で持つ（時刻などの桁落ちを防ぐ）
  const fslot = P.map((n, i) => (mesh || vEl.props[i].list || [ix, iy, iz, ir, ig, ib].includes(i) || /^(nx|ny|nz|normal_?[xyz]|alpha|a|diffuse_alpha)$/.test(n)) ? -1 : sink.field(n.replace(/^scalar_/, ''), /Float64|Int32|Uint32/.test(vEl.props[i].t[0])));
  if (hasRgb) sink.rgb();
  sink.hint(vEl.count);
  // 頂点の数が、残りのファイルの大きさに収まるか（1 頂点は文字で 6 バイト以上、バイナリなら頂点の大きさ分）
  checkCount(vEl.count, Math.ceil(src.size / (ascii ? 6 : Math.max(1, vEl.props.reduce((a, q) => a + (q.list ? q.ct[1] : q.t[1]), 0)))) + 1, '頂点');
  const V = mesh ? new Float64Array(vEl.count * 3) : null, VC = mesh && hasRgb ? new Uint8Array(vEl.count * 3) : null;
  const T = [];
  const col = v => (rgbFloat ? (v === v ? Math.max(0, Math.min(255, Math.round(v * 255))) : 0) : rgb16 ? v >> 8 : rgb32 ? v >>> 24 : v);
  const putVertex = (vi, val) => {
    if (mesh) {
      V[3 * vi] = val[ix]; V[3 * vi + 1] = val[iy]; V[3 * vi + 2] = val[iz];
      if (VC) { VC[3 * vi] = col(val[ir]); VC[3 * vi + 1] = col(val[ig]); VC[3 * vi + 2] = col(val[ib]); }
      return;
    }
    const k = sink.slot(val[ix], val[iy], val[iz]);
    if (k < 0) return;
    for (let i = 0; i < val.length; i++) if (fslot[i] >= 0) sink.F[fslot[i]][k] = val[i];
    if (hasRgb) { const C = sink.C; C[3 * k] = col(val[ir]); C[3 * k + 1] = col(val[ig]); C[3 * k + 2] = col(val[ib]); }
  };
  // face は扇、tristrips は帯（(i, i+1, i+2) の三角形。−1 で帯が切れる）
  const putFace = strips
    ? idx => { let a = -1, b = -1; for (const v of idx) { if (v < 0 || v >= 4294967295) { a = b = -1; continue; } if (a >= 0 && b >= 0) T.push(a, b, v); a = b; b = v; } }
    : idx => { for (let j = 1; j + 1 < idx.length; j++) T.push(idx[0], idx[j], idx[j + 1]); };
  const totalItems = h.elements.reduce((a, e) => a + e.count, 0) || 1;
  let done = 0;

  if (ascii) {
    // 要素の順に、1 行 = 1 個
    let ei = 0, left = h.elements[0]?.count ?? 0;
    const val = new Float64Array(64);
    let tmp = new Float64Array(1024);
    await eachLine(src, h.dataOffset, (b, s, e) => {
      while (ei < h.elements.length && left === 0) { ei++; left = h.elements[ei]?.count ?? 0; }
      if (ei >= h.elements.length) return false;
      const el = h.elements[ei];
      if (el === vEl) {
        const n = numbersIn(b, s, e, val);
        if (n < P.length) { left--; return; }
        putVertex(vEl.count - left, val.subarray(0, P.length));
      } else if (el === fEl && mesh) {
        const n = numbersIn(b, s, e, tmp);
        if (n > tmp.length) { tmp = new Float64Array(n * 2); numbersIn(b, s, e, tmp); }
        const c = tmp[0];
        putFace(Array.from(tmp.subarray(1, 1 + c)));
      }
      left--; done++;
      if ((done & 0xffff) === 0) ctx.progress(done / totalItems);
    }, () => {});
  } else {
    const cur = new Cur(src, h.dataOffset);
    for (const el of h.elements) {
      const fixed = el.props.every(p => !p.list);
      const recSize = fixed ? el.props.reduce((a, p) => a + p.t[1], 0) : 0;
      const val = new Float64Array(el.props.length);
      const isV = el === vEl, isF = el === fEl && mesh;
      if (!isV && !isF && fixed) { // 使わない要素は飛ばす
        let skip = el.count * recSize;
        while (skip > 0) { await cur.fill(1); const m = Math.min(skip, cur.buf.length - cur.p); if (!m) break; cur.p += m; skip -= m; }
        done += el.count;
        continue;
      }
      const maxRec = fixed ? recSize : el.props.reduce((a, p) => a + (p.list ? p.ct[1] + 255 * p.it[1] : p.t[1]), 0);
      for (let i = 0; i < el.count; i++) {
        if (cur.buf.length - cur.p < maxRec) { await cur.fill(maxRec); ctx.progress(done / totalItems); }
        let idx = null;
        for (let j = 0; j < el.props.length; j++) {
          const p = el.props[j];
          if (p.list) {
            if (cur.buf.length - cur.p < p.ct[1]) await cur.need(p.ct[1]);
            const c = cur.dv[p.ct[0]](cur.p, le); cur.p += p.ct[1];
            if (!(c >= 0)) throw new Error('PLY の面の頂点の数が正しくありません（ファイルが壊れている可能性があります）');
            if (cur.buf.length - cur.p < c * p.it[1]) await cur.need(c * p.it[1]);
            const a = new Array(c);
            for (let q = 0; q < c; q++) { a[q] = cur.dv[p.it[0]](cur.p, le); cur.p += p.it[1]; }
            if (/vertex_ind/.test(p.name)) idx = a;
          } else {
            if (cur.buf.length - cur.p < p.t[1]) await cur.need(p.t[1]);
            val[j] = cur.dv[p.t[0]](cur.p, le); cur.p += p.t[1];
          }
        }
        if (isV) putVertex(i, val);
        else if (isF && idx) putFace(idx);
        done++;
      }
    }
  }
  if (mesh) {
    addMesh(sink, V, new Uint32Array(T), VC);
    return { format: `PLY（${h.format}、面 ${fEl.count.toLocaleString()} 枚）`, note: '面の上に点を散らして表示しています' };
  }
  return { format: `PLY（${h.format}）` };
}
