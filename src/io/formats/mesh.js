// メッシュ形式: OBJ・STL・OFF・VTK（旧形式）・glTF / GLB
//   面は addMesh で面の上に点を散らす。線（OBJ の l、VTK の LINES）は線の上に点を並べる
import { eachLine, numbersIn, decode, decodeLatin, parseToken, extOf, checkCount, rng } from '../util.js';
import { addMesh, addLines } from '../sink.js';
import { decodeImage, guard } from './image.js';

// 注記: 実際に面・線があったときだけ、その内容に合わせる
export function meshNote(nTri, nLines) {
  if (nTri && nLines) return '面と線の上に点を並べて表示しています';
  if (nTri) return '面の上に点を散らして表示しています';
  if (nLines) return '線の上に点を並べて表示しています';
  return '';
}
const findPart = (companions, name) => {
  const nm = String(name).replace(/^.*[\\/]/, '').toLowerCase();
  const f = Object.entries(companions || {}).find(([n]) => n.replace(/^.*[\\/]/, '').toLowerCase() === nm);
  return f ? f[1] : null;
};

// ---- テクスチャ（画像を読んで、UV の位置の色を取る）
async function loadTexture(bytes, name) {
  try { return await decodeImage(bytes, extOf(name || '') || 'png'); } catch (e) { return null; }
}
function texel(tx, u, v, flipV, out, o) {
  u -= Math.floor(u); v -= Math.floor(v);
  const x = Math.min(tx.w - 1, Math.floor(u * tx.w)), y = Math.min(tx.h - 1, Math.floor((flipV ? 1 - v : v) * tx.h));
  const i = 4 * (y * tx.w + x), m = tx.mul;
  if (m) { out[o] = tx.data[i] * m[0]; out[o + 1] = tx.data[i + 1] * m[1]; out[o + 2] = tx.data[i + 2] * m[2]; }
  else { out[o] = tx.data[i]; out[o + 1] = tx.data[i + 1]; out[o + 2] = tx.data[i + 2]; }
}
// 面の上に点を散らす（addMesh と同じ散らし方）。面ごとの色（FC）・テクスチャ（TX + 角ごとの UV）にも対応
//   C: 頂点の色、FC: 三角形ごとの色、UV: 三角形の角ごとの (u,v)（6 個ずつ）、TX: 三角形ごとのテクスチャ（なければ null）
function scatter(sink, V, T, { C = null, FC = null, UV = null, TX = null, flipV = true } = {}, target = 1e6) {
  if (!FC && !TX) return addMesh(sink, V, T, C);
  const nv = V.length / 3, nt = T.length / 3;
  const colOf = (t, w, u, v, out, o) => {
    const tx = TX && TX[t];
    if (tx) { const q = 6 * t; texel(tx, UV[q] * w + UV[q + 2] * u + UV[q + 4] * v, UV[q + 1] * w + UV[q + 3] * u + UV[q + 5] * v, flipV, out, o); return; }
    if (FC) { out[o] = FC[3 * t]; out[o + 1] = FC[3 * t + 1]; out[o + 2] = FC[3 * t + 2]; return; }
    if (C) { const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2]; for (let j = 0; j < 3; j++) out[o + j] = C[a + j] * w + C[b + j] * u + C[c + j] * v; return; }
    out[o] = out[o + 1] = out[o + 2] = 200;
  };
  // 頂点の色: 頂点の色があればそれ、なければその頂点を使う最初の面の色
  let VC = C;
  if (!VC) {
    VC = new Uint8Array(nv * 3).fill(200);
    const seen = new Uint8Array(nv), tmp = [0, 0, 0];
    for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) {
      const k = T[3 * t + j]; if (seen[k]) continue; seen[k] = 1;
      colOf(t, j === 0 ? 1 : 0, j === 1 ? 1 : 0, j === 2 ? 1 : 0, tmp, 0);
      VC[3 * k] = tmp[0]; VC[3 * k + 1] = tmp[1]; VC[3 * k + 2] = tmp[2];
    }
  }
  addMesh(sink, V, new Uint32Array(0), VC);
  let total = 0;
  const area = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
    const vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const s = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    area[t] = s === s ? s : 0; total += area[t];
  }
  const K = Math.max(0, Math.floor(target - nv));
  if (!K || !(total > 0)) return;
  const r = rng(7), tmp = [0, 0, 0];
  let acc = 0;
  for (let t = 0; t < nt; t++) {
    acc += area[t] / total * K;
    let m = Math.floor(acc); acc -= m;
    if (!m) continue;
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    while (m--) {
      let u = r(), v = r();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const w = 1 - u - v;
      const k = sink.slot(V[a] * w + V[b] * u + V[c] * v, V[a + 1] * w + V[b + 1] * u + V[c + 1] * v, V[a + 2] * w + V[b + 2] * u + V[c + 2] * v);
      if (k < 0) continue;
      colOf(t, w, u, v, tmp, 0);
      sink.C[3 * k] = Math.round(tmp[0]); sink.C[3 * k + 1] = Math.round(tmp[1]); sink.C[3 * k + 2] = Math.round(tmp[2]);
    }
  }
}
// 0〜1 か 0〜255 かをファイル全体で決めて、0〜255 の 8 bit にする（raw: 色の値、NaN は「色なし」→ 200）
function colors8(raw) {
  let mx = 0; for (let i = 0; i < raw.length; i++) if (raw[i] > mx) mx = raw[i];
  const sc = mx <= 1.001 ? 255 : 1, out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) { const x = raw[i]; out[i] = x === x ? Math.min(255, Math.max(0, Math.round(x * sc))) : 200; }
  return out;
}

// 伸びる配列
class Grow {
  constructor(T = Float64Array, n = 1 << 16) { this.T = T; this.a = new T(n); this.n = 0; }
  push(...v) { for (const x of v) { if (this.n >= this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; } }
  push1(x) { if (this.n >= this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; }
  get() { return this.a.subarray(0, this.n); }
}

// ------------------------------------------------------------------ OBJ
async function readOBJ_(src, sink, ctx) {
  const V = new Grow(), VC = new Grow(), VT = new Grow(), T = new Grow(Uint32Array), TM = new Grow(Uint32Array), TV = new Grow(Int32Array);
  const lines = [];
  let hasVC = false;
  const v = new Float64Array(16);
  const mtlNames = [], matIds = new Map(); // usemtl の名前 → 番号（0 は材質なし）
  let curMtl = 0;
  // "12/3/4" の 1 つ目（頂点）と 2 つ目（テクスチャ座標）
  const faceIdx = [], faceVt = [];
  const handle = (b, s, e) => {
    while (s < e && (b[s] === 32 || b[s] === 9)) s++;
    const c0 = b[s], c1 = b[s + 1];
    if (c0 === 118 && (c1 === 32 || c1 === 9)) { // v
      const n = numbersIn(b, s + 2, e, v);
      V.push1(v[0]); V.push1(v[1]); V.push1(v[2]);
      if (n >= 6) { hasVC = true; VC.push1(v[3]); VC.push1(v[4]); VC.push1(v[5]); } else { VC.push1(NaN); VC.push1(NaN); VC.push1(NaN); }
    } else if (c0 === 118 && c1 === 116 && (b[s + 2] === 32 || b[s + 2] === 9)) { // vt
      const n = numbersIn(b, s + 3, e, v);
      VT.push1(n >= 1 ? v[0] : NaN); VT.push1(n >= 2 ? v[1] : 0);
    } else if ((c0 === 102 || c0 === 108) && (c1 === 32 || c1 === 9)) { // f / l
      faceIdx.length = 0; faceVt.length = 0;
      let i = s + 2;
      const nv = V.n / 3, nvt = VT.n / 2;
      let bad = false;
      while (i < e) {
        while (i < e && (b[i] === 32 || b[i] === 9)) i++;
        if (i >= e) break;
        const t = i; while (i < e && b[i] !== 32 && b[i] !== 9) i++;
        let j = t; while (j < i && b[j] !== 47) j++;
        let k = parseToken(b, t, j);
        if (!Number.isFinite(k)) continue;
        k = k < 0 ? nv + k : k - 1;
        if (k < 0 || k >= nv) bad = true; // 範囲外の番号の面は捨てる
        let q = -1;
        if (j < i) { const j2 = j + 1; let j3 = j2; while (j3 < i && b[j3] !== 47) j3++; const kt = parseToken(b, j2, j3); if (Number.isFinite(kt)) q = kt < 0 ? nvt + kt : kt - 1; }
        faceIdx.push(k); faceVt.push(q >= 0 && q < nvt ? q : -1);
      }
      if (bad) return;
      if (c0 === 102) {
        for (let j = 1; j + 1 < faceIdx.length; j++) {
          T.push1(faceIdx[0]); T.push1(faceIdx[j]); T.push1(faceIdx[j + 1]);
          TV.push1(faceVt[0]); TV.push1(faceVt[j]); TV.push1(faceVt[j + 1]);
          TM.push1(curMtl);
        }
      } else lines.push([...faceIdx]);
    } else if (c0 === 117 && b[s + 1] === 115 && b[s + 2] === 101 && b[s + 3] === 109) { // usemtl
      const nm = decode(b, s + 6, e).trim();
      if (!matIds.has(nm)) matIds.set(nm, matIds.size + 1);
      curMtl = matIds.get(nm);
    } else if (c0 === 109 && b[s + 1] === 116 && b[s + 2] === 108 && b[s + 3] === 108) { // mtllib
      mtlNames.push(decode(b, s + 6, e).trim());
    }
  };
  // 行末の「\」は次の行に続く（OBJ の決まり）
  let pend = null;
  await eachLine(src, 0, (b, s, e) => {
    let t = e; while (t > s && (b[t - 1] === 32 || b[t - 1] === 9)) t--;
    const cont = t > s && b[t - 1] === 92;
    if (!cont && !pend) return handle(b, s, e);
    const part = b.subarray(s, cont ? t - 1 : e);
    const m = new Uint8Array((pend ? pend.length + 1 : 0) + part.length);
    if (pend) { m.set(pend); m[pend.length] = 32; m.set(part, pend.length + 1); } else m.set(part);
    if (cont) pend = m; else { pend = null; handle(m, 0, m.length); }
  }, ctx.progress);
  if (pend) handle(pend, 0, pend.length);
  const Va = V.get();
  if (!Va.length) throw new Error('頂点（v）がありません');
  // 材質（.mtl）: mtllib に書かれた名前のものだけを読む（ほかの OBJ の同じ名前の材質と混ざらないように）。なければ同じ名前の .mtl
  const mtlFiles = [];
  for (const l of mtlNames) {
    const f = findPart(ctx.companions, l);
    if (f) { if (!mtlFiles.includes(f)) mtlFiles.push(f); }
    else for (const w of l.split(/\s+/)) { const g = findPart(ctx.companions, w); if (g && !mtlFiles.includes(g)) mtlFiles.push(g); }
  }
  if (!mtlFiles.length) { const g = findPart(ctx.companions, ctx.name.replace(/\.[^.]+$/, '') + '.mtl'); if (g) mtlFiles.push(g); }
  if (!mtlFiles.length && !mtlNames.length && matIds.size) {
    const all = Object.entries(ctx.companions || {}).filter(([n]) => extOf(n) === 'mtl');
    if (all.length === 1) mtlFiles.push(all[0][1]);
  }
  const mtl = {};
  for (const f of mtlFiles) {
    let cur = null;
    for (const l of (await f.text()).split(/\r?\n/)) {
      const w = l.trim().split(/\s+/);
      if (w[0] === 'newmtl') { cur = w.slice(1).join(' '); mtl[cur] = mtl[cur] || {}; }
      else if (w[0] === 'Kd' && cur) mtl[cur].kd = [Number(w[1]), Number(w[2]), Number(w[3])].map(x => Math.round(255 * Math.min(1, Math.max(0, x || 0))));
      else if (w[0] === 'map_Kd' && cur) { const opts = w.slice(1); while (opts.length > 1 && opts[0].startsWith('-')) { let k = 1; while (k < opts.length - 1 && !opts[k].startsWith('-') && /^[-+\d.]|^(on|off|[rgbmlz])$/i.test(opts[k]) && k < (opts[0] === '-mm' ? 3 : /^-(o|s|t)$/.test(opts[0]) ? 4 : 2)) k++; opts.splice(0, k); } mtl[cur].map = opts.join(' '); }
    }
  }
  const nt = T.n / 3;
  const notes = [];
  let C = null, FC = null, TX = null, UV = null;
  if (hasVC) C = colors8(VC.get());
  const usedMtl = [...matIds.entries()].filter(([nm]) => mtl[nm]);
  if (usedMtl.length && nt) {
    // 材質の番号 → 色・テクスチャ
    const col = [[200, 200, 200]], tex = [null];
    const missing = [], unread = [];
    let anyTex = false;
    for (const [nm, id] of matIds) {
      const m = mtl[nm];
      col[id] = m && m.kd ? m.kd : [200, 200, 200]; // Kd のない材質は灰色
      tex[id] = null;
      if (m && m.map) {
        const f = findPart(ctx.companions, m.map);
        if (!f) { if (!missing.includes(m.map)) missing.push(m.map); continue; }
        const tx = m._tx !== undefined ? m._tx : (m._tx = await loadTexture(new Uint8Array(await f.arrayBuffer()), m.map));
        if (tx) { tex[id] = tx; anyTex = true; } else if (!unread.includes(m.map)) unread.push(m.map);
      }
    }
    const TMa = TM.get(), TVa = TV.get(), VTa = VT.get();
    if (!hasVC) { FC = new Uint8Array(nt * 3); for (let t = 0; t < nt; t++) FC.set(col[TMa[t]] || col[0], 3 * t); }
    if (anyTex) {
      TX = new Array(nt).fill(null); UV = new Float32Array(nt * 6);
      for (let t = 0; t < nt; t++) {
        const tx = tex[TMa[t]];
        if (!tx || TVa[3 * t] < 0 || TVa[3 * t + 1] < 0 || TVa[3 * t + 2] < 0) continue;
        TX[t] = tx;
        for (let j = 0; j < 3; j++) { UV[6 * t + 2 * j] = VTa[2 * TVa[3 * t + j]]; UV[6 * t + 2 * j + 1] = VTa[2 * TVa[3 * t + j] + 1]; }
      }
      notes.push('テクスチャの色を点に写しています');
    }
    if (missing.length) notes.push(`テクスチャの画像（${missing.join('、')}）が一緒に選ばれていないため、材質の色で表示しています`);
    if (unread.length) notes.push(`テクスチャの画像（${unread.join('、')}）を読めなかったため、材質の色で表示しています`);
  }
  scatter(sink, Va, T.get(), { C, FC, UV, TX, flipV: true });
  if (lines.length) addLines(sink, lines.map(l => ({ V: l.flatMap(k => [Va[3 * k], Va[3 * k + 1], Va[3 * k + 2]]), closed: false })));
  const note = [meshNote(nt, lines.length), ...notes].filter(Boolean).join('。');
  return { format: `OBJ（頂点 ${(Va.length / 3).toLocaleString()}、三角形 ${nt.toLocaleString()}${lines.length ? `、線 ${lines.length.toLocaleString()}` : ''}）`, note };
}
export const readOBJ = guard('OBJ', readOBJ_);

// ------------------------------------------------------------------ STL
async function readSTL_(src, sink, ctx) {
  const head = await src.read(0, Math.min(src.size, 1024));
  const nTri = head.length >= 84 ? new DataView(head.buffer).getUint32(80, true) : 0;
  // 文字の STL か: 先頭が solid で、最初の部分に facet / endsolid がある（大文字小文字は問わない）
  const headTxt = decodeLatin(head).toLowerCase();
  const looksText = /^\s*solid/.test(headTxt) && /facet|endsolid/.test(headTxt);
  // バイナリ: 大きさがちょうど合う、または文字に見えず「84 + 50 × 三角形の数」以上（最後の余分なバイトは無視）
  const binary = head.length >= 84 && nTri > 0 && (src.size === 84 + 50 * nTri || (!looksText && src.size >= 84 + 50 * nTri));
  if (binary) {
    const extra = src.size - (84 + 50 * nTri);
    // 色: 頭書きに COLOR= があれば Materialise Magics 方式（bit15 = 0 が面の色、下位 5 bit が赤）、なければ VisCAM/SolidView 方式（bit15 = 1 が色、下位 5 bit が青）
    const hdr = decodeLatin(head, 0, 80), ci = hdr.indexOf('COLOR=');
    const magics = ci >= 0;
    const def = magics && ci + 9 < 80 ? [head[ci + 6], head[ci + 7], head[ci + 8]] : [200, 200, 200];
    const V = new Float32Array(nTri * 9), C = new Uint8Array(nTri * 9);
    let hasColor = magics;
    const per = 1 << 18;
    for (let t0 = 0; t0 < nTri; t0 += per) {
      const m = Math.min(per, nTri - t0);
      const b = await src.read(84 + t0 * 50, m * 50);
      const dv = new DataView(b.buffer, b.byteOffset, b.length);
      for (let i = 0; i < m; i++) {
        const o = i * 50 + 12, t = t0 + i;
        for (let j = 0; j < 9; j++) V[9 * t + j] = dv.getFloat32(o + 4 * j, true);
        const a = dv.getUint16(i * 50 + 48, true);
        let r = def[0], g = def[1], bl = def[2];
        if (magics) { if (!(a & 0x8000)) { r = (a & 31) << 3; g = ((a >> 5) & 31) << 3; bl = ((a >> 10) & 31) << 3; } }
        else if (a & 0x8000) { hasColor = true; bl = (a & 31) << 3; g = ((a >> 5) & 31) << 3; r = ((a >> 10) & 31) << 3; }
        for (let j = 0; j < 3; j++) { C[9 * t + 3 * j] = r; C[9 * t + 3 * j + 1] = g; C[9 * t + 3 * j + 2] = bl; }
      }
      ctx.progress((t0 + m) / nTri);
    }
    const T = new Uint32Array(nTri * 3); for (let i = 0; i < T.length; i++) T[i] = i;
    addMesh(sink, V, T, hasColor ? C : null);
    return { format: `STL（バイナリ、三角形 ${nTri.toLocaleString()}）`, note: '面の上に点を散らして表示しています' + (extra > 0 ? `（ファイルの最後の余分な ${extra.toLocaleString()} バイトは読み飛ばしました）` : '') };
  }
  const V = new Grow();
  const v = new Float64Array(8);
  await eachLine(src, 0, (b, s, e) => {
    while (s < e && (b[s] === 32 || b[s] === 9)) s++;
    // vertex（大文字小文字は問わない）
    if ((b[s] | 32) === 118 && (b[s + 1] | 32) === 101 && (b[s + 2] | 32) === 114 && (b[s + 3] | 32) === 116 && (b[s + 4] | 32) === 101 && (b[s + 5] | 32) === 120) { numbersIn(b, s + 6, e, v); V.push1(v[0]); V.push1(v[1]); V.push1(v[2]); }
  }, ctx.progress);
  const Va = V.get();
  const n3 = Va.length - Va.length % 9;
  if (!n3) throw new Error('STL に三角形がありません（ファイルが壊れているか、途中で切れています）');
  const T = new Uint32Array(n3 / 3); for (let i = 0; i < T.length; i++) T[i] = i;
  addMesh(sink, Va.subarray(0, n3), T, null);
  return { format: `STL（文字、三角形 ${(T.length / 3).toLocaleString()}）`, note: '面の上に点を散らして表示しています' };
}
export const readSTL = guard('STL', readSTL_);

// ------------------------------------------------------------------ OFF
async function readOFF_(src, sink, ctx) {
  const txt = await src.text();
  const lines = txt.split(/\r?\n/).map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
  if (!lines.length) throw new Error('OFF ファイルが空です');
  let li = 0;
  let first = lines[li].split(/\s+/);
  // 見出しの接頭辞 [ST][C][N][4][n]OFF で列の並びが決まる（x y z [w] [nx ny nz] [r g b [a]] [s t]）
  const m = /^(ST)?(C)?(N)?(4)?(n)?OFF$/.exec(first[0]) || (/^off$/i.test(first[0]) ? [] : null);
  if (!m) throw new Error('OFF ファイルではありません');
  const hasST = !!m[1], hasCk = !!m[2], hasN = !!m[3], four = !!m[4], ndim = !!m[5];
  first = first.slice(1);
  const need = ndim ? 3 : 2;
  while (first.length < need && li + 1 < lines.length) first = first.concat(lines[++li].split(/\s+/));
  li++;
  const dim = ndim ? Number(first.shift()) + (four ? 1 : 0) : (four ? 4 : 3);
  const [nv, nf] = first.map(Number);
  if (!(dim >= 3 && dim <= 16)) throw new Error('OFF の次元の数が正しくありません。ファイルが壊れている可能性があります');
  checkCount(nv, lines.length - li, '頂点');
  checkCount(nf, Infinity, '面');
  const V = new Float64Array(nv * 3), raw = new Float64Array(nv * 3).fill(NaN);
  const cAt = dim + (hasN ? 3 : 0); // 色の列の位置
  let hasC = false;
  for (let i = 0; i < nv; i++) {
    const w = lines[li++].split(/\s+/).map(Number);
    const h = four && !ndim && Number.isFinite(w[3]) && w[3] !== 0 ? w[3] : 1; // 4OFF は w で割る
    V[3 * i] = w[0] / h; V[3 * i + 1] = w[1] / h; V[3 * i + 2] = w[2] / h;
    // 色: C があるとき、または接頭辞なしの OFF に 3 列以上の余り（よくある書き方）があるとき
    const plainColor = !hasCk && !hasN && !hasST && !four && !ndim && w.length >= 6;
    if ((hasCk && w.length >= cAt + 3) || plainColor) { hasC = true; raw[3 * i] = w[cAt]; raw[3 * i + 1] = w[cAt + 1]; raw[3 * i + 2] = w[cAt + 2]; }
  }
  void hasST;
  const T = new Grow(Uint32Array);
  for (let i = 0; i < nf && li < lines.length; i++) {
    const w = lines[li++].split(/\s+/).map(Number);
    const c = Math.min(w[0], w.length - 1); // 面の頂点数は、その行に実際に書かれた数まで（壊れた数で固まらないように）
    let ok = true; for (let j = 1; j <= c; j++) if (!(w[j] >= 0 && w[j] < nv)) ok = false;
    if (!ok) continue; // 範囲外の頂点番号の面は捨てる
    for (let j = 2; j < c; j++) { T.push1(w[1]); T.push1(w[j]); T.push1(w[j + 1]); }
  }
  ctx.progress(1);
  const tri = T.get();
  addMesh(sink, V, tri, hasC ? colors8(raw) : null);
  return { format: `OFF（頂点 ${nv.toLocaleString()}、面 ${nf.toLocaleString()}）`, note: meshNote(tri.length, 0) };
}
export const readOFF = guard('OFF', readOFF_);

// ------------------------------------------------------------------ VTK（旧形式: ASCII / BINARY）
const VTK_T = { float: ['getFloat32', 4], double: ['getFloat64', 8], int: ['getInt32', 4], unsigned_int: ['getUint32', 4], long: ['getInt32', 4], vtkidtype: ['getInt32', 4], short: ['getInt16', 2], unsigned_short: ['getUint16', 2], char: ['getInt8', 1], unsigned_char: ['getUint8', 1], bit: ['getUint8', 1], vtktypeint64: ['getBigInt64', 8], vtktypeuint64: ['getBigUint64', 8] };
async function readVTK_(src, sink, ctx) {
  const b = await src.all();
  const dv = new DataView(b.buffer);
  let p = 0;
  const line = () => { const s = p; while (p < b.length && b[p] !== 10) p++; const t = decodeLatin(b, s, p).replace(/\r$/, ''); p++; return t; };
  const word = () => { while (p < b.length && (b[p] <= 32)) p++; const s = p; while (p < b.length && b[p] > 32) p++; return decodeLatin(b, s, p); };
  line(); line();
  const binary = /BINARY/i.test(line());
  const arr = (n, type) => {
    const [fn, sz] = VTK_T[String(type).toLowerCase()] || VTK_T.float;
    // 文字なら 1 つの値に 2 バイト以上、バイナリなら型の大きさ分が残っているはず
    checkCount(n, binary ? Math.floor((b.length - p) / sz) : Math.ceil((b.length - p) / 2) + 1, '値');
    const out = new Float64Array(n);
    if (binary) {
      while (p < b.length && b[p] !== 10) p++; p++; // 型名の行の終わりまで
      for (let i = 0; i < n; i++) { const x = dv[fn](p, false); out[i] = typeof x === 'bigint' ? Number(x) : x; p += sz; }
    } else for (let i = 0; i < n; i++) out[i] = Number(word());
    return out;
  };
  let V = null, C = null, nPts = 0;
  const T = new Grow(Uint32Array), lines = [];
  let dataset = '', fieldK = [];
  // セル: 4.x は「数 i0 i1 …」の並び。5.1（VTK 9 以降）は OFFSETS と CONNECTIVITY の 2 つの配列
  const cells = (n, size) => {
    const save = p, w = word();
    if (w.toUpperCase() === 'OFFSETS') {
      const off = arr(n, word());
      if (word().toUpperCase() !== 'CONNECTIVITY') throw new Error('VTK 5.1 の CONNECTIVITY が見つかりません。ファイルが壊れている可能性があります');
      const con = arr(size, word());
      const out = [];
      for (let i = 0; i + 1 < off.length; i++) { const s = off[i], e = off[i + 1]; if (s >= 0 && e <= con.length && s <= e) out.push(Array.from(con.subarray(s, e))); }
      return out;
    }
    p = save;
    const a = arr(size, 'int'); const out = []; let i = 0; while (i < a.length) { const c = a[i]; out.push(Array.from(a.subarray(i + 1, i + 1 + c))); i += c + 1; } return out;
  };
  let pendingCells = null;
  let nCells = 0, attr = 'POINT', nAttr = 0; // 今の属性の区切り（POINT_DATA / CELL_DATA）とその数
  const okIdx = c => c.every(k => k >= 0 && k < nPts);
  while (p < b.length) {
    const kw = word().toUpperCase();
    if (!kw) break;
    if (kw === 'DATASET') dataset = word().toUpperCase();
    else if (kw === 'POINTS') { nPts = Number(word()); const ty = word(); V = arr(nPts * 3, ty); nAttr = nPts; }
    else if (kw === 'POLYGONS' || kw === 'TRIANGLE_STRIPS') {
      const n = Number(word()), size = Number(word());
      for (const c of cells(n, size)) {
        if (!okIdx(c)) continue;
        nCells++;
        if (kw === 'POLYGONS') for (let j = 1; j + 1 < c.length; j++) T.push(c[0], c[j], c[j + 1]);
        else for (let j = 0; j + 2 < c.length; j++) T.push(c[j], c[j + 1], c[j + 2]);
      }
    } else if (kw === 'LINES') { const n = Number(word()), size = Number(word()); for (const c of cells(n, size)) if (okIdx(c)) { lines.push(c); nCells++; } }
    else if (kw === 'VERTICES') { const n = Number(word()), size = Number(word()); nCells += cells(n, size).length; }
    else if (kw === 'CELLS') { const n = Number(word()), size = Number(word()); pendingCells = cells(n, size); nCells += pendingCells.length; }
    else if (kw === 'CELL_TYPES') {
      const n = Number(word()); const ty = arr(n, 'int');
      if (pendingCells) pendingCells.forEach((c, i) => {
        const t = ty[i];
        if (!okIdx(c)) return;
        if (t === 5 || t === 7 || t === 9) for (let j = 1; j + 1 < c.length; j++) T.push(c[0], c[j], c[j + 1]); // 三角形・多角形・四角形
        else if (t === 6) for (let j = 0; j + 2 < c.length; j++) T.push(c[j], c[j + 1], c[j + 2]);
        else if (t === 3 || t === 4) lines.push(c);
      });
    } else if (kw === 'POINT_DATA' || kw === 'CELL_DATA') { attr = kw === 'POINT_DATA' ? 'POINT' : 'CELL'; nAttr = Number(word()); if (!Number.isFinite(nAttr)) nAttr = attr === 'POINT' ? nPts : nCells; }
    else if (kw === 'SCALARS') {
      const name = word(), ty = word();
      let save = p; const nx = word(); let ncomp = 1;
      if (/^\d+$/.test(nx)) ncomp = Number(nx); else p = save;
      save = p; const l2 = word(); if (l2.toUpperCase() === 'LOOKUP_TABLE') word(); else p = save;
      const a = arr(nAttr * ncomp, ty);
      if (ncomp === 1 && attr === 'POINT') fieldK.push([name, a]); // 面（CELL_DATA）の値は点の欄にしない
    } else if (kw === 'COLOR_SCALARS') {
      word(); const nc = Number(word());
      const a = binary ? (() => { while (p < b.length && b[p] !== 10) p++; p++; checkCount(nAttr * nc, b.length - p, '色'); const o = new Float64Array(nAttr * nc); for (let i = 0; i < o.length; i++) o[i] = b[p++] / 255; return o; })() : arr(nAttr * nc, 'float');
      if (attr === 'POINT' && nc >= 3) {
        C = new Uint8Array(nPts * 3);
        for (let i = 0; i < Math.min(nPts, nAttr); i++) for (let k = 0; k < 3; k++) C[3 * i + k] = Math.round(255 * Math.min(1, Math.max(0, a[nc * i + k])));
      }
    } else if (kw === 'NORMALS' || kw === 'VECTORS') { word(); const ty = word(); arr(nAttr * 3, ty); }
    else if (kw === 'TENSORS' || kw === 'TENSORS6') { word(); const ty = word(); arr(nAttr * (kw === 'TENSORS' ? 9 : 6), ty); }
    else if (kw === 'TEXTURE_COORDINATES') { word(); const d = Number(word()); const ty = word(); arr(nAttr * d, ty); }
    else if (kw === 'LOOKUP_TABLE') { word(); const n = Number(word()); if (binary) { while (p < b.length && b[p] !== 10) p++; p++; checkCount(n * 4, b.length - p, '色表'); p += n * 4; } else arr(n * 4, 'float'); }
    else if (kw === 'FIELD') { word(); const na = Number(word()); for (let i = 0; i < na; i++) { const nm = word(); const nc = Number(word()), nt = Number(word()), ty = word(); const a = arr(nc * nt, ty); if (nc === 1 && nt === nPts && attr === 'POINT') fieldK.push([nm, a]); const save = p; if (word().toUpperCase() === 'METADATA') { while (p < b.length) { const l = line(); if (!l.trim()) break; } } else p = save; } }
    else if (kw === 'METADATA') { while (p < b.length) { const l = line(); if (!l.trim()) break; } }
  }
  if (!V) throw new Error('VTK に点（POINTS）がありません');
  ctx.progress(1);
  const tri = T.get();
  if (tri.length || lines.length) {
    addMesh(sink, V, tri, C);
    if (lines.length) addLines(sink, lines.map(l => ({ V: l.flatMap(k => [V[3 * k], V[3 * k + 1], V[3 * k + 2]]), closed: false })));
    return { format: `VTK（${dataset}、${binary ? 'バイナリ' : '文字'}、三角形 ${(tri.length / 3).toLocaleString()}${lines.length ? `、線 ${lines.length.toLocaleString()}` : ''}）`, note: meshNote(tri.length, lines.length) };
  }
  // 点だけ: 値の欄も持たせる
  const ks = fieldK.map(([nm]) => sink.field(nm.toLowerCase()));
  if (C) sink.rgb();
  sink.hint(nPts);
  for (let i = 0; i < nPts; i++) {
    const k = sink.slot(V[3 * i], V[3 * i + 1], V[3 * i + 2]);
    if (k < 0) continue;
    fieldK.forEach(([, a], j) => { sink.F[ks[j]][k] = a[i]; });
    if (C) { sink.C[3 * k] = C[3 * i]; sink.C[3 * k + 1] = C[3 * i + 1]; sink.C[3 * k + 2] = C[3 * i + 2]; }
  }
  return { format: `VTK（${dataset}、${binary ? 'バイナリ' : '文字'}）` };
}
export const readVTK = guard('VTK', readVTK_);

// ------------------------------------------------------------------ glTF / GLB
const CT = { 5120: [Int8Array, 1, 127], 5121: [Uint8Array, 1, 255], 5122: [Int16Array, 2, 32767], 5123: [Uint16Array, 2, 65535], 5125: [Uint32Array, 4, 4294967295], 5126: [Float32Array, 4, 1] };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function mat4mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
async function readGLTF_(src, sink, ctx) {
  const all = await src.all();
  let json, bin = null;
  if (decodeLatin(all, 0, 4) === 'glTF') {
    const dv = new DataView(all.buffer);
    let o = 12;
    while (o < all.length) {
      const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
      if (type === 0x4e4f534a) json = JSON.parse(decode(all, o + 8, o + 8 + len));
      else if (type === 0x004e4942) bin = all.subarray(o + 8, o + 8 + len);
      o += 8 + len;
    }
  } else json = JSON.parse(decode(all));
  if (!json) throw new Error('glTF の中身が読めません');
  const req = json.extensionsRequired || [];
  if (req.some(e => /draco|meshopt/i.test(e))) throw new Error(`圧縮された glTF（${req.join(', ')}）には対応していません`);
  // 読める拡張（色・形に関わらないもの、または対応したもの）以外が必須なら断る（黙って違う形にしない）
  const OK_EXT = /^(KHR_materials_\w+|KHR_texture_transform|KHR_mesh_quantization|EXT_mesh_gpu_instancing|KHR_lights_punctual|KHR_texture_basisu|EXT_texture_webp|KHR_animation_pointer|KHR_xmp_json_ld)$/;
  const bad = req.filter(e => !OK_EXT.test(e));
  if (bad.length) throw new Error(`この glTF が必要とする拡張（${bad.join(', ')}）には対応していません`);
  const dataURI = u => Uint8Array.from(atob(u.slice(u.indexOf(',') + 1)), c => c.charCodeAt(0));
  const buffers = [];
  for (const bf of json.buffers || []) {
    if (!bf.uri) buffers.push(bin);
    else if (bf.uri.startsWith('data:')) buffers.push(dataURI(bf.uri));
    else {
      const nm = decodeURIComponent(bf.uri).replace(/^.*[\\/]/, '');
      const f = findPart(ctx.companions, nm); // 名前の大文字小文字は問わない
      if (!f) throw new Error(`glTF が使う ${nm} も一緒に選んでください`);
      buffers.push(new Uint8Array(await f.arrayBuffer()));
    }
  }
  const view = (bvi, extra = 0) => {
    const bv = json.bufferViews?.[bvi];
    const buf = bv && buffers[bv.buffer];
    if (!buf) throw new Error('glTF のデータ（bufferView）が見つかりません。ファイルが壊れている可能性があります');
    return { dv: new DataView(buf.buffer, buf.byteOffset + (bv.byteOffset || 0) + extra), stride: bv.byteStride || 0, len: (bv.byteLength || 0) - extra };
  };
  const reader = (dv, TA, sz) => ({ 1: (o) => TA === Int8Array ? dv.getInt8(o) : dv.getUint8(o), 2: (o) => TA === Int16Array ? dv.getInt16(o, true) : dv.getUint16(o, true), 4: (o) => TA === Float32Array ? dv.getFloat32(o, true) : dv.getUint32(o, true) }[sz]);
  const accCache = new Map();
  const acc = i => {
    if (accCache.has(i)) return accCache.get(i);
    const a = json.accessors?.[i];
    if (!a || !CT[a.componentType] || !NC[a.type]) throw new Error('glTF の accessor が正しくありません。ファイルが壊れている可能性があります');
    const [TA, sz, mx] = CT[a.componentType], nc = NC[a.type];
    const vw = a.bufferView !== undefined ? view(a.bufferView, a.byteOffset || 0) : null;
    const st = vw ? vw.stride || sz * nc : 0;
    // 数がデータの大きさに合わないときは止める（巨大な確保を防ぐ）。データのない（sparse だけの）ものは 5,000 万まで
    checkCount(a.count, vw ? Math.floor(Math.max(0, vw.dv.byteLength) / st) + 1 : 5e7, 'glTF の要素');
    const out = new Float64Array(a.count * nc);
    if (vw) {
      const get = reader(vw.dv, TA, sz);
      for (let i2 = 0; i2 < a.count; i2++) for (let k = 0; k < nc; k++) out[i2 * nc + k] = get(i2 * st + k * sz);
    } // bufferView がなければ 0 から（sparse で差し替える）
    // sparse: 一部の要素だけを差し替える
    if (a.sparse && a.sparse.count > 0) {
      const sp = a.sparse, n = sp.count;
      const [TI, si] = CT[sp.indices.componentType] || CT[5125];
      const di = view(sp.indices.bufferView, sp.indices.byteOffset || 0).dv, gi = reader(di, TI, si);
      const dvv = view(sp.values.bufferView, sp.values.byteOffset || 0).dv, gv = reader(dvv, TA, sz);
      for (let j = 0; j < n; j++) { const at = gi(j * si); if (at >= a.count) continue; for (let k = 0; k < nc; k++) out[at * nc + k] = gv((j * nc + k) * sz); }
    }
    if (a.normalized) for (let j = 0; j < out.length; j++) out[j] = Math.max(-1, out[j] / mx);
    const r = { v: out, nc };
    accCache.set(i, r);
    return r;
  };
  // テクスチャの画像（埋め込み・data URI・一緒に選んだファイル）
  const texCache = new Map(), texMissing = new Set(), texUnread = new Set();
  let texUsed = false;
  const texture = async ti => {
    const t = json.textures?.[ti];
    const si = t ? (t.source ?? t.extensions?.EXT_texture_webp?.source ?? t.extensions?.KHR_texture_basisu?.source) : undefined;
    const im = si !== undefined ? json.images?.[si] : null;
    if (!im) return null;
    if (texCache.has(si)) return texCache.get(si);
    let bytes = null, nm = im.name || (im.uri && !im.uri.startsWith('data:') ? im.uri : `埋め込みの画像 ${si + 1}`);
    if (im.bufferView !== undefined) { const { dv, len } = view(im.bufferView); bytes = new Uint8Array(dv.buffer, dv.byteOffset, Math.max(0, len)); }
    else if (im.uri && im.uri.startsWith('data:')) bytes = dataURI(im.uri);
    else if (im.uri) { nm = decodeURIComponent(im.uri).replace(/^.*[\\/]/, ''); const f = findPart(ctx.companions, nm); if (f) bytes = new Uint8Array(await f.arrayBuffer()); else texMissing.add(nm); }
    const type = (im.mimeType || '').replace(/^image\//, '').replace('jpeg', 'jpg');
    const tx = bytes ? await loadTexture(bytes, type ? 'x.' + type : nm) : null;
    if (bytes && !tx) texUnread.add(nm);
    texCache.set(si, tx);
    return tx;
  };
  const Vs = [], Cs = [], Ts = [], TXs = [], UVs = []; let nv = 0, hasC = false; const lines = [];
  let anyTex = false;
  const emit = async (meshIdx, M) => {
    for (const pr of json.meshes?.[meshIdx]?.primitives || []) {
      if (pr.attributes?.POSITION === undefined) continue;
      const P = acc(pr.attributes.POSITION).v, cnt = P.length / 3;
      if (nv + cnt > 3e7) throw new Error('glTF の頂点が多すぎます（複製を含めて 3,000 万個まで）');
      const V = new Float64Array(P.length);
      for (let i = 0; i < cnt; i++) { const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2]; V[3 * i] = M[0] * x + M[4] * y + M[8] * z + M[12]; V[3 * i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; V[3 * i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; }
      const C = new Uint8Array(cnt * 3);
      const m = pr.material !== undefined ? json.materials?.[pr.material] : null;
      const f = m?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1]; // 決まりの既定値は 1
      if (pr.attributes.COLOR_0 !== undefined) {
        hasC = true; const c = acc(pr.attributes.COLOR_0);
        for (let i = 0; i < cnt; i++) for (let k = 0; k < 3; k++) C[3 * i + k] = Math.round(255 * Math.min(1, Math.max(0, c.v[c.nc * i + k])));
      } else if (m) {
        hasC = true;
        for (let i = 0; i < cnt; i++) for (let k = 0; k < 3; k++) C[3 * i + k] = Math.round(255 * Math.min(1, Math.max(0, f[k])));
      } else C.fill(200);
      // テクスチャ（baseColorTexture）
      let tx = null, uv = null;
      const bt = m?.pbrMetallicRoughness?.baseColorTexture;
      if (bt && bt.index !== undefined) {
        const uvAcc = pr.attributes[`TEXCOORD_${bt.texCoord || 0}`];
        const t0 = await texture(bt.index);
        if (t0 && uvAcc !== undefined) { tx = { ...t0, mul: [f[0], f[1], f[2]] }; uv = acc(uvAcc).v; anyTex = texUsed = true; }
      }
      const idx = pr.indices !== undefined ? acc(pr.indices).v : Float64Array.from({ length: cnt }, (_, i) => i);
      const mode = pr.mode ?? 4;
      const T = [];
      const ok = k => k >= 0 && k < cnt;
      const tri = (a, b, c) => { if (ok(a) && ok(b) && ok(c)) T.push(a, b, c); };
      if (mode === 4) for (let i = 0; i + 2 < idx.length; i += 3) tri(idx[i], idx[i + 1], idx[i + 2]);
      else if (mode === 5) for (let i = 0; i + 2 < idx.length; i++) (i & 1) ? tri(idx[i + 1], idx[i], idx[i + 2]) : tri(idx[i], idx[i + 1], idx[i + 2]);
      else if (mode === 6) for (let i = 1; i + 1 < idx.length; i++) tri(idx[0], idx[i], idx[i + 1]);
      const pt = k => ok(k) ? [V[3 * k], V[3 * k + 1], V[3 * k + 2]] : [];
      if (mode === 1) for (let i = 0; i + 1 < idx.length; i += 2) lines.push({ V: [...pt(idx[i]), ...pt(idx[i + 1])], closed: false }); // 2 点ずつ別々の線分
      else if (mode === 3 || mode === 2) lines.push({ V: Array.from(idx).flatMap(pt), closed: mode === 2 });
      const nt = T.length / 3;
      const UV = new Float32Array(nt * 6), TX = new Array(nt).fill(tx);
      if (tx) for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) { const k = T[3 * t + j]; UV[6 * t + 2 * j] = uv[2 * k]; UV[6 * t + 2 * j + 1] = uv[2 * k + 1]; }
      for (let j = 0; j < T.length; j++) T[j] += nv;
      Vs.push(V); Cs.push(C); Ts.push(T); TXs.push(TX); UVs.push(UV); nv += cnt;
    }
  };
  // EXT_mesh_gpu_instancing: TRANSLATION / ROTATION / SCALE の数だけ複製する
  const instances = n => {
    const ex = n.extensions?.EXT_mesh_gpu_instancing?.attributes;
    if (!ex) return null;
    const tr = ex.TRANSLATION !== undefined ? acc(ex.TRANSLATION).v : null, ro = ex.ROTATION !== undefined ? acc(ex.ROTATION).v : null, sc = ex.SCALE !== undefined ? acc(ex.SCALE).v : null;
    const cnt = Math.max(tr ? tr.length / 3 : 0, ro ? ro.length / 4 : 0, sc ? sc.length / 3 : 0);
    const out = [];
    for (let i = 0; i < cnt; i++) out.push(trs({ translation: tr ? [tr[3 * i], tr[3 * i + 1], tr[3 * i + 2]] : undefined, rotation: ro ? [ro[4 * i], ro[4 * i + 1], ro[4 * i + 2], ro[4 * i + 3]] : undefined, scale: sc ? [sc[3 * i], sc[3 * i + 1], sc[3 * i + 2]] : undefined }));
    return out;
  };
  const visit = async (ni, parent, depth) => {
    const n = json.nodes?.[ni];
    if (!n) return;
    if (depth > 256) throw new Error('glTF のノードの入れ子が深すぎます（ファイルが壊れている可能性があります）');
    const M = mat4mul(parent, trs(n));
    if (n.mesh !== undefined) {
      const inst = instances(n);
      if (inst) for (const Mi of inst) await emit(n.mesh, mat4mul(M, Mi));
      else await emit(n.mesh, M);
    }
    for (const c of n.children || []) await visit(c, M, depth + 1);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const scene = json.scenes?.[json.scene ?? 0];
  let roots;
  if (scene) roots = scene.nodes || [];
  else { // scenes がなければ、どのノードの子にもなっていないノードだけを根にする
    const child = new Set(); for (const n of json.nodes || []) for (const c of n.children || []) child.add(c);
    roots = (json.nodes || []).map((_, i) => i).filter(i => !child.has(i));
  }
  for (const r of roots) await visit(r, I, 0);
  if (!nv) throw new Error('glTF に形（メッシュ）がありません');
  const V = new Float64Array(nv * 3), C = new Uint8Array(nv * 3);
  let o = 0; Vs.forEach((a, i) => { V.set(a, o); C.set(Cs[i], o); o += a.length; });
  const T = Uint32Array.from(Ts.flat());
  let TX = null, UV = null;
  if (anyTex) { TX = TXs.flat(); UV = new Float32Array(T.length * 2); let q = 0; for (const u of UVs) { UV.set(u, q); q += u.length; } }
  ctx.progress(1);
  scatter(sink, V, T, { C: hasC ? C : null, TX, UV, flipV: false });
  if (lines.length) addLines(sink, lines);
  const notes = [meshNote(T.length, lines.length)];
  if (texUsed) notes.push('テクスチャの色を点に写しています');
  if (texMissing.size) notes.push(`テクスチャの画像（${[...texMissing].join('、')}）が一緒に選ばれていないため、材質の色で表示しています`);
  if (texUnread.size) notes.push(`テクスチャの画像（${[...texUnread].join('、')}）を読めなかったため、材質の色で表示しています`);
  return { format: `glTF 2.0（三角形 ${(T.length / 3).toLocaleString()}${lines.length ? `、線 ${lines.length.toLocaleString()}` : ''}）`, note: notes.filter(Boolean).join('。') };
}
export const readGLTF = guard('glTF', readGLTF_);
