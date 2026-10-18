// 読み込んだ点をためる入れ物
//   ・最大点数（cap）を超えたら、ファイル全体から均等に選び直す（Vitter の Algorithm L による無作為抽出）
//     → 10 億点のファイルでも、最後まで読みながら cap 点だけを手元に残せる
//   ・座標が大きい（地図座標など）ときは、近くの切りのよい値（offset）を引いて float で持つ
//     （CloudCompare の「グローバルシフト」と同じ考え方。表示するときに足し戻す）
import { rng } from './util.js';

const BIG = 1e4;
const LIMIT = 1e12;
const PEND = 1000;   // グローバルシフトは最初の 1,000 点（座標の正しい点）の中央値で決める
const FAR = 1e4;     // 渡されたシフトと、このファイルの中心が 10 km 以上離れていたら注記を出す
const WIDE_OK = 1e4; // 幅の広い（double の）欄で、絶対値がこれ未満なら基準値を引かない（float32 で約 1 ms まで保てる）
const FARPT = 1e5;   // シフトからこれ以上離れた点は float32 で約 8 mm 以上に丸められる（R2-001: 1 つのファイルに離れた部分が混ざるとき）

// 遠い点の見本のうち、まわり（±FARPT/2）に最も多くの見本がある点のまわりの中央値（迷い線などに引っぱられないように）
function median3(R, m) {
  const h = FARPT / 2;
  let bi = 0, bc = -1;
  for (let i = 0; i < m; i++) {
    let c = 0;
    for (let j = 0; j < m; j++) if (Math.abs(R[3 * j] - R[3 * i]) < h && Math.abs(R[3 * j + 1] - R[3 * i + 1]) < h && Math.abs(R[3 * j + 2] - R[3 * i + 2]) < h) c++;
    if (c > bc) { bc = c; bi = i; }
  }
  const near = [];
  for (let j = 0; j < m; j++) if (Math.abs(R[3 * j] - R[3 * bi]) < h && Math.abs(R[3 * j + 1] - R[3 * bi + 1]) < h && Math.abs(R[3 * j + 2] - R[3 * bi + 2]) < h) near.push(j);
  const v = new Float64Array(near.length);
  return [0, 1, 2].map(a => { near.forEach((j, k) => { v[k] = R[3 * j + a]; }); v.sort(); return v[near.length >> 1]; });
}

export class Sink {
  constructor({ cap = 3e7, offset = null, bytes = Infinity, selfShift = false } = {}) {
    this.cap = Math.max(1, Math.floor(cap));
    this.bytes = bytes;          // 元のファイルの大きさ（頭書きの点数を信じすぎないため）
    this.offset = offset;        // [ox, oy, oz]（null なら最初の 1,000 点の中央値で決める）
    this.given = selfShift ? null : offset;         // 前のファイルから渡されたシフト（ずれが大きいときの注記用）
    this.pend = null;            // シフトを決めるまでの点の座標（double）。番号 k ごと
    this.settled = false;
    this.note = '';
    this.index = new Map();      // 欄の名前 → 番号
    this.wide = [];              // 欄ごと: 読み込み中は Float64 で持つか（時刻など double の値）
    this.base = {};              // 読み方の側で引いた基準値（LAS の gps_time など）
    this.n = 0;                  // 手元にある点
    this.seen = 0;               // 座標が正しかった点の総数
    this.skipped = 0;            // 座標が NaN などで除いた点
    this.names = [];             // 点ごとの値（強度など）の名前
    this.F = [];
    this.P = null; this.C = null;
    this.alloc = 0; this.hintN = 0; this.wantRgb = false;
    this.r = rng(20240611);
    this.W = 0; this.next = 0;
    this.meta = {};
    this.far = 0; this.farMax = 0; this.farR = null; // シフトから遠い点の数・最大の距離・見本 1,000 点の座標（double。読み直すシフトを決める）
  }
  _far(x, y, z) {
    const o = this.offset || [0, 0, 0], d = Math.max(Math.abs(x - o[0]), Math.abs(y - o[1]), Math.abs(z - o[2]));
    if (d >= FARPT) {
      const j = this.far++; if (d > this.farMax) this.farMax = d;
      // 遠い点から 1,000 点を均等に選んで覚える（ファイルの並びに引っぱられないように）
      const q = j < PEND ? j : Math.floor((this.farRng || (this.farRng = rng(97)))() * (j + 1));
      if (q < PEND) { const R = this.farR || (this.farR = new Float64Array(3 * PEND)); R[3 * q] = x; R[3 * q + 1] = y; R[3 * q + 2] = z; }
    }
  }
  // 頭書きの点数。先に入れ物を確保するのに使うが、ファイルの大きさ（1 点 1 バイト以上）を超える数は信じない
  hint(n) { if (n > 0) this.hintN = Math.min(n, this.bytes); }
  // 値の欄を足す（あとから足しても、それまでの点は 0 になる）。番号を返す
  //   wide: double の値（時刻など）。読み込み中は Float64 で持ち、finish で基準値を引いて float32 にする
  field(name, wide = false) {
    let k = this.index.get(name);
    if (k === undefined) {
      k = this.names.length;
      this.index.set(name, k);
      this.names.push(name);
      this.wide.push(!!wide);
      this.F.push(this.alloc ? new (wide ? Float64Array : Float32Array)(this.alloc) : null);
    } else if (wide && !this.wide[k]) {
      this.wide[k] = true;
      if (this.F[k]) this.F[k] = Float64Array.from(this.F[k]);
    }
    return k;
  }
  // 色を持つことにする。それまでの点は灰色（色を持たない部分の点）
  rgb() {
    if (!this.wantRgb) { this.wantRgb = true; if (this.alloc) this.C = new Uint8Array(this.alloc * 3).fill(200); }
  }
  _grow(min) {
    let a = Math.max(min, this.alloc * 2, 1 << 16);
    if (this.hintN) a = Math.max(a, Math.min(this.hintN, this.cap));
    a = Math.min(a, this.cap);
    try {
      const P = new Float32Array(a * 3); if (this.P) P.set(this.P);
      this.P = P;
      this.F = this.F.map((f, j) => { const g = new (this.wide[j] ? Float64Array : Float32Array)(a); if (f) g.set(f); return g; });
      if (this.wantRgb) { const C = new Uint8Array(a * 3); if (this.C) C.set(this.C); this.C = C; }
    } catch (e) {
      throw new Error(`メモリが足りません（${a.toLocaleString()} 点を確保できませんでした）。「表示」の「読み込む最大点数」を減らしてください`);
    }
    this.alloc = a;
  }
  // 1 点を受け取り、しまう場所の番号を返す（-1 なら捨てる点）。値と色は呼び出し側が F[k][i] / C[3i] に書く
  slot(x, y, z) {
    // NaN・無限大と、ありえないほど大きな座標（1e12 以上。壊れた値）は除く。float に入れたときに無限大にならないように
    if (!(Math.abs(x) < LIMIT && Math.abs(y) < LIMIT && Math.abs(z) < LIMIT)) { this.skipped++; return -1; }
    const i = this.seen++;
    if (this.settled) this._far(x, y, z);
    let k;
    if (i < this.cap) {
      k = i;
      if (k >= this.alloc) this._grow(k + 1);
      this.n = k + 1;
    } else {
      const r = this.r, cap = this.cap;
      if (!this.W) { this.W = Math.exp(Math.log(r() || 1e-12) / cap); this.next = cap + Math.floor(Math.log(r() || 1e-12) / Math.log(1 - this.W)); }
      if (i < this.next) { if (!this.settled && this.seen >= PEND) this.settle(); return -1; }
      k = Math.floor(r() * cap);
      this.W *= Math.exp(Math.log(r() || 1e-12) / cap);
      this.next += Math.floor(Math.log(r() || 1e-12) / Math.log(1 - this.W)) + 1;
      // 置き換える点: 前の点の値が残らないように（部分ごとに欄が違うファイル）
      for (const f of this.F) if (f) f[k] = 0;
    }
    // 色は灰色にしておく（色を持つ点は呼び出し側が上書きする）
    const C = this.C;
    if (C) { C[3 * k] = 200; C[3 * k + 1] = 200; C[3 * k + 2] = 200; }
    if (!this.settled) {
      const R = this.pend || (this.pend = new Float64Array(3 * Math.min(this.cap, PEND)));
      R[3 * k] = x; R[3 * k + 1] = y; R[3 * k + 2] = z;
      if (this.seen >= PEND) this.settle();
      return k;
    }
    const P = this.P, o = this.offset;
    P[3 * k] = x - o[0]; P[3 * k + 1] = y - o[1]; P[3 * k + 2] = z - o[2];
    return k;
  }
  // グローバルシフトを決め、ためておいた点の座標を書く。前のファイルのシフトと大きく違えば注記を返す
  settle() {
    if (this.settled) return this.note;
    this.settled = true;
    const R = this.pend, m = R ? Math.min(this.n, R.length / 3) : 0;
    let center = null;
    if (m) {
      const v = new Float64Array(m);
      center = [0, 1, 2].map(a => { for (let k = 0; k < m; k++) v[k] = R[3 * k + a]; v.sort(); return v[m >> 1]; });
    }
    if (this.offset === null) this.offset = center ? center.map(c => Math.abs(c) >= BIG ? Math.round(c / 100) * 100 : 0) : null;
    else if (this.given && center && center.some((c, a) => Math.abs(c - this.offset[a]) >= FAR)) {
      const km = Math.hypot(...center.map((c, a) => c - this.offset[a])) / 1000;
      this.note = `このファイルは先に開いたファイルと原点が約 ${km.toLocaleString(undefined, { maximumFractionDigits: 0 })} km 離れています。先のファイルの座標のシフトを使うため、座標が粗くなる（数 cm〜数十 cm に丸められる）ことがあります。精度が要るときは単独で開いてください`;
    }
    for (let k = 0; k < m; k++) this._far(R[3 * k], R[3 * k + 1], R[3 * k + 2]);
    const o = this.offset || [0, 0, 0], P = this.P;
    for (let k = 0; k < m; k++) { P[3 * k] = R[3 * k] - o[0]; P[3 * k + 1] = R[3 * k + 1] - o[1]; P[3 * k + 2] = R[3 * k + 2] - o[2]; }
    this.pend = null;
    return this.note;
  }
  // 色がない点に入れる色（灰色）。色を持つ点と持たない点が混ざるファイル用
  gray(k, v = 200) { if (this.C) { this.C[3 * k] = v; this.C[3 * k + 1] = v; this.C[3 * k + 2] = v; } }
  finish() {
    this.settle();
    const n = this.n;
    // 確保した入れ物が実際の点数よりずっと大きいとき（頭書きの点数が多すぎた等）は、ちょうどの大きさに写して余りを返す
    if (this.P && this.alloc > n * 1.25 + 65536) {
      this.P = this.P.slice(0, 3 * n);
      this.F = this.F.map(f => (f ? f.slice(0, n) : f));
      if (this.C) this.C = this.C.slice(0, 3 * n);
      this.alloc = n;
    }
    // 値の欄。double の欄は「欄ごとの基準値（最小値）」を引いて float32 にする（fieldBase に基準値。表示では足し戻す）
    const fields = {}, fieldBase = {};
    this.names.forEach((nm, j) => {
      const f = this.F[j] ? this.F[j].subarray(0, n) : new Float32Array(n);
      if (this.wide[j]) {
        // 基準値は中央値（0 などの外れ値 1 つに引っぱられないように）。絶対値が 1e4 以上なら引く（GPS 週秒なども桁を落とさない。R2-003）
        const smp = [], stp = Math.max(1, Math.floor(n / 10001));
        for (let k = 0; k < n; k += stp) { const v = f[k]; if (Number.isFinite(v)) smp.push(v); }
        smp.sort((a, b) => a - b);
        const med = smp.length ? smp[smp.length >> 1] : 0;
        const base = Math.abs(med) >= WIDE_OK ? med : 0;
        const g = new Float32Array(n);
        for (let k = 0; k < n; k++) g[k] = f[k] - base;
        fields[nm] = g; this.F[j] = null;
        if (base) fieldBase[nm] = base;
      } else {
        fields[nm] = f;
        if (this.base[nm]) fieldBase[nm] = this.base[nm];
      }
    });
    return {
      n, positions: this.P ? this.P.subarray(0, 3 * n) : new Float32Array(0), fields, fieldBase,
      rgb: this.C ? this.C.subarray(0, 3 * n) : null,
      total: this.seen, skipped: this.skipped, offset: this.offset || [0, 0, 0], sampled: this.seen > n, note: this.note,
      far: this.far, farMax: this.farMax, farCenter: this.far ? median3(this.farR, Math.min(this.far, PEND)) : null,
    };
  }
}

// ---- 面（三角形）: 頂点に加えて、面の上に面積に比例して点を散らす（CloudCompare の「メッシュから点をサンプリング」と同じ）
//   V: 頂点座標 [x,y,z,...]、T: 三角形の頂点番号 [a,b,c,...]、C: 頂点の色 [r,g,b,...]（なくてもよい）
export function addMesh(sink, V, T, C = null, target = 1e6) {
  const nv = V.length / 3;
  if (C) sink.rgb();
  for (let i = 0; i < nv; i++) {
    const k = sink.slot(V[3 * i], V[3 * i + 1], V[3 * i + 2]);
    if (k >= 0 && C) { sink.C[3 * k] = C[3 * i]; sink.C[3 * k + 1] = C[3 * i + 1]; sink.C[3 * k + 2] = C[3 * i + 2]; }
    else if (k >= 0 && sink.C) sink.gray(k);
  }
  if (!T || !T.length) return;
  const nt = T.length / 3;
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
  const r = rng(7);
  let acc = 0;
  for (let t = 0; t < nt; t++) {
    acc += area[t] / total * K;
    let m = Math.floor(acc); acc -= m;
    if (!m) continue;
    const ia = T[3 * t], ib = T[3 * t + 1], ic = T[3 * t + 2];
    const a = 3 * ia, b = 3 * ib, c = 3 * ic;
    while (m--) {
      let u = r(), v = r();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const w = 1 - u - v;
      const k = sink.slot(V[a] * w + V[b] * u + V[c] * v, V[a + 1] * w + V[b + 1] * u + V[c + 1] * v, V[a + 2] * w + V[b + 2] * u + V[c + 2] * v);
      if (k < 0) continue;
      if (C) for (let j = 0; j < 3; j++) sink.C[3 * k + j] = Math.round(C[3 * ia + j] * w + C[3 * ib + j] * u + C[3 * ic + j] * v);
      else if (sink.C) sink.gray(k);
    }
  }
}

// ---- 線（ポリライン）: 頂点に加えて、線の上に等間隔で点を並べる
//   lines: [{ V: [x,y,z,...], closed }]
export function addLines(sink, lines, target = 3e5) {
  let L = 0, nv = 0;
  const colored = lines.some(l => l.C);
  if (colored) sink.rgb();
  for (const l of lines) {
    const V = l.V, n = V.length / 3; nv += n;
    for (let i = 1; i < n + (l.closed ? 1 : 0); i++) { const a = 3 * (i - 1), b = 3 * (i % n); L += Math.hypot(V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]); }
  }
  const step = L > 0 ? L / Math.max(1, target - nv) : 0;
  for (const l of lines) {
    const V = l.V, n = V.length / 3, c = l.C || [200, 200, 200];
    const put = k => { if (k >= 0 && colored) { sink.C[3 * k] = c[0]; sink.C[3 * k + 1] = c[1]; sink.C[3 * k + 2] = c[2]; } };
    for (let i = 0; i < n; i++) put(sink.slot(V[3 * i], V[3 * i + 1], V[3 * i + 2]));
    if (!step) continue;
    for (let i = 1; i < n + (l.closed ? 1 : 0); i++) {
      const a = 3 * (i - 1), b = 3 * (i % n);
      const d = Math.hypot(V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]);
      const m = Math.floor(d / step);
      for (let j = 1; j < m; j++) { const t = j / m; put(sink.slot(V[a] + (V[b] - V[a]) * t, V[a + 1] + (V[b + 1] - V[a + 1]) * t, V[a + 2] + (V[b + 2] - V[a + 2]) * t)); }
    }
  }
}
