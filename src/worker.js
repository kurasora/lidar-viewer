// 重い処理をまとめて引き受ける別スレッド
//   load     … PCD を読み、点の順番を混ぜ（先頭 N 点がそのまま無作為な間引きになる）、統計を返す
//   field    … 指定した項目の値を返す（色分け用）
//   pick     … 光線に最も近い点を探す（クリックで点を選ぶ）
//   analyze  … 床・天井・壁の向きから、水平補正と廊下の向きを求める
//   info     … 1 点の全項目の値
//   traj     … 軌跡ファイルを読む
import { loadFile } from './io/index.js';
import { Sink, addMesh } from './io/sink.js';
import { addPixels } from './io/formats/image.js';
import { parseTrajectory } from './trajectory.js';

const sets = new Map();

// wasm などの部品: アプリ version は中に埋め込み、試作ページ version は横に置いたファイルを読む
const assetCache = new Map();
async function gunzip(b) { return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); }
async function getAsset(name, base) {
  if (assetCache.has(name)) return assetCache.get(name);
  let bytes;
  const emb = typeof __EMBED_ASSETS__ !== 'undefined' ? __EMBED_ASSETS__ : null;
  if (emb && emb[name]) {
    const v = emb[name];
    if (v.startsWith('gz:')) bytes = await gunzip(Uint8Array.from(atob(v.slice(3)), c => c.charCodeAt(0)));
    else bytes = Uint8Array.from(atob(v), c => c.charCodeAt(0));
  } else {
    const res = await fetch(new URL('wasm/' + name, base));
    if (!res.ok) throw new Error(`部品 ${name} を読み込めませんでした（${res.status}）`);
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  assetCache.set(name, bytes);
  return bytes;
}
// 部品の場所（URL）を渡す必要がある読み込み部品用
async function getAssetURL(name, base) {
  const emb = typeof __EMBED_ASSETS__ !== 'undefined' ? __EMBED_ASSETS__ : null;
  if (emb && emb[name]) {
    // 埋め込みの部品は fetch を使わずに渡す（試作ページの枠は connect-src が blob: を許さないことがある。R14-001）
    const url = URL.createObjectURL(new Blob([], { type: 'application/wasm' }));
    embeddedURLs.set(url, await getAsset(name, base));
    if (!fetchShimmed) {
      fetchShimmed = true;
      const realFetch = self.fetch.bind(self);
      self.fetch = (u, o) => {
        const k = typeof u === 'string' ? u : u && u.url;
        if (embeddedURLs.has(k)) return Promise.resolve(new Response(embeddedURLs.get(k), { headers: { 'Content-Type': 'application/wasm' } }));
        return realFetch(u, o);
      };
    }
    return url;
  }
  return new URL('wasm/' + name, base).href;
}
const embeddedURLs = new Map();
let fetchShimmed = false;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// 点の順番を混ぜる（先頭 N 点がそのまま無作為な間引きになる）。メモリを増やさないようその場で入れ替える
function shuffle(ds) {
  const n = ds.n, P = ds.positions, C = ds.rgb, F = Object.values(ds.fields);
  const r = rng(12345);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    if (i === j) continue;
    let a = 3 * i, b = 3 * j, t;
    t = P[a]; P[a] = P[b]; P[b] = t; t = P[a + 1]; P[a + 1] = P[b + 1]; P[b + 1] = t; t = P[a + 2]; P[a + 2] = P[b + 2]; P[b + 2] = t;
    if (C) { t = C[a]; C[a] = C[b]; C[b] = t; t = C[a + 1]; C[a + 1] = C[b + 1]; C[b + 1] = t; t = C[a + 2]; C[a + 2] = C[b + 2]; C[b + 2] = t; }
    for (const f of F) { t = f[i]; f[i] = f[j]; f[j] = t; }
  }
}

function fieldStats(a) {
  const n = a.length, m = Math.min(n, 200000); // 混ぜてあるので先頭が無作為標本
  // 最小・最大は有限の値だけで求める（Inf が 1 点あると色の範囲が壊れる）
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) { const v = a[i]; if (v - v !== 0) continue; if (v < min) min = v; if (v > max) max = v; }
  if (min > max) { min = 0; max = 0; }
  const s = Array.from(a.subarray(0, m)).filter(Number.isFinite).sort((x, y) => x - y);
  const q = p => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
  // 種類（整数の値）かどうかは全点で見る（標本にない値があると凡例と色が合わなくなる）
  let integer = true;
  const uniq = new Set();
  for (let i = 0; i < n && integer && uniq.size <= 32; i++) {
    const v = a[i];
    if (v - v !== 0) continue;
    if (v !== Math.round(v)) integer = false;
    else uniq.add(v);
  }
  const categorical = integer && uniq.size >= 1 && uniq.size <= 32 && max - min < 1000;
  return { min, max, p1: q(0.01), p99: q(0.99), categorical, values: categorical ? [...uniq].sort((x, y) => x - y) : null };
}

function bbox(P) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  }
  return { min: lo, max: hi };
}

// ---- クリックで点を選ぶための格子の索引 ----
//   セルの番号は Map ではなく「並べた番号の配列＋二分探索」で引く（Map は 2^24 件で止まる。1,678 万点を超える平らな点群・広く疎な点群）
//   セルの大きさは、外れ値を除いた広がり（1〜99%）で、1 セルに平均 8 点ほど入るよう 3 次元・面・線の見積もりの大きい方にする
//   空のセルを飛ばすため、16 倍の粗い格子も持つ（遠い外れ値 1 点で箱が巨大でも、光線を短時間で進められる）
const COARSE = 16;
function sortedUnique(a) {
  a.sort();
  let m = 0;
  for (let i = 0; i < a.length; i++) if (i === 0 || a[i] !== a[m - 1]) a[m++] = a[i];
  return a.slice(0, m);
}
function bsearch(keys, k) {
  let lo = 0, hi = keys.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1, v = keys[mid]; if (v < k) lo = mid + 1; else if (v > k) hi = mid - 1; else return mid; }
  return -1;
}
function buildIndex(ds) {
  const P = ds.positions, n = ds.n;
  const { min, max } = ds.bbox;
  // 外れ値を除いた広がり（点は混ぜてあるので先頭が無作為な標本）
  const m = Math.min(n, 100000), rob = [];
  for (let k = 0; k < 3; k++) {
    const a = new Float64Array(m);
    for (let i = 0; i < m; i++) a[i] = P[3 * i + k];
    a.sort();
    rob.push(Math.max(a[Math.floor(0.99 * (m - 1))] - a[Math.floor(0.01 * (m - 1))], 1e-6));
  }
  const [e1, e2, e3] = rob.sort((a, b) => b - a), N = Math.max(n, 1);
  let cell = Math.max(Math.cbrt(e1 * e2 * e3 * 8 / N), Math.sqrt(e1 * e2 * 8 / N), e1 * 8 / N, 1e-6);
  const ext = [0, 1, 2].map(k => Math.max(max[k] - min[k], 0));
  let dims;
  for (;;) {
    dims = ext.map(e => Math.max(1, Math.floor(e / (cell * COARSE)) * COARSE + 2 * COARSE));
    if (dims[0] * dims[1] * dims[2] < 2 ** 52) break;
    cell *= 2;
  }
  const keyAt = (x, y, z, c, d) => Math.floor((x - min[0]) / c) + d[0] * (Math.floor((y - min[1]) / c) + d[1] * Math.floor((z - min[2]) / c));
  const cdims = dims.map(d => d / COARSE), C = cell * COARSE;
  const tmp = new Float64Array(n);
  for (let i = 0; i < n; i++) tmp[i] = keyAt(P[3 * i], P[3 * i + 1], P[3 * i + 2], C, cdims);
  const coarse = sortedUnique(tmp);
  for (let i = 0; i < n; i++) tmp[i] = keyAt(P[3 * i], P[3 * i + 1], P[3 * i + 2], cell, dims);
  const keys = sortedUnique(tmp);
  const nc = keys.length;
  const cellId = new Uint32Array(n);
  for (let i = 0; i < n; i++) cellId[i] = bsearch(keys, keyAt(P[3 * i], P[3 * i + 1], P[3 * i + 2], cell, dims));
  const start = new Uint32Array(nc + 1);
  for (let i = 0; i < n; i++) start[cellId[i] + 1]++;
  for (let c = 0; c < nc; c++) start[c + 1] += start[c];
  const fill = start.slice(0, nc);
  const sorted = new Uint32Array(n);
  for (let i = 0; i < n; i++) sorted[fill[cellId[i]]++] = i;
  ds.index = { cell, dims, min, keys, start, sorted, C, cdims, coarse };
}
// セル (ix,iy,iz) の番号（空なら -1）
function cellOf(I, ix, iy, iz) {
  const { dims, keys } = I;
  if (ix < 0 || iy < 0 || iz < 0 || ix >= dims[0] || iy >= dims[1] || iz >= dims[2]) return -1;
  return bsearch(keys, ix + dims[0] * (iy + dims[1] * iz));
}

function pointSpacing(ds) {
  if (!ds.index) buildIndex(ds);
  const I = ds.index, { cell, min, start, sorted } = I;
  const P = ds.positions, q = Math.min(ds.n, 3000), out = [];
  for (let i = 0; i < q; i++) { // 点は混ぜてあるので、先頭が無作為な標本になる
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    const ix = Math.floor((x - min[0]) / cell), iy = Math.floor((y - min[1]) / cell), iz = Math.floor((z - min[2]) / cell);
    let best = Infinity;
    // 隣のセルに点がなければ、探す範囲を広げる（まばらな点群・一直線の点群）
    for (let r = 1; r <= 4 && best === Infinity; r++) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
        if (r > 1 && Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) < r) continue; // 内側はもう調べた
        const id = cellOf(I, ix + a, iy + b, iz + c);
        if (id < 0) continue;
        for (let k = start[id]; k < start[id + 1]; k++) {
          const j = sorted[k];
          if (j === i) continue;
          const d2 = (P[3 * j] - x) ** 2 + (P[3 * j + 1] - y) ** 2 + (P[3 * j + 2] - z) ** 2;
          if (d2 > 1e-12 && d2 < best) best = d2;
        }
      }
    }
    if (best < Infinity) out.push(Math.sqrt(best));
  }
  if (!out.length) return null;
  out.sort((a, b) => a - b);
  return out[out.length >> 1];
}

// win: [lo, hi] を渡すと、奥行きがその範囲の点のうち「光線に一番近い点」を選ぶ（渡さなければ一番手前の点）
// 点 i の、光線（q.o から q.d の向き）からの距離（索引と同じ座標で）
function perpOf(ds, q, i) {
  const P = ds.positions, vx = P[3 * i] - q.o[0], vy = P[3 * i + 1] - q.o[1], vz = P[3 * i + 2] - q.o[2];
  const t = vx * q.d[0] + vy * q.d[1] + vz * q.d[2];
  return Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - t * t));
}
function pickIn(ds, o, d, tolA, tolB, M, clipMin, clipMax, ceil, win = null) {
  if (!ds.index) buildIndex(ds);
  const I = ds.index, { cell, min, start, sorted, C, cdims, coarse } = I;
  const P = ds.positions, max = ds.bbox.max;
  // 光線と範囲（少し広げた bbox）の交わり
  let t0 = 0, t1 = 1e9;
  for (let k = 0; k < 3; k++) {
    const lo = min[k] - cell, hi = max[k] + cell;
    if (Math.abs(d[k]) < 1e-12) { if (o[k] < lo || o[k] > hi) return null; continue; }
    let a = (lo - o[k]) / d[k], b = (hi - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (t0 > t1) return null;
  const visible = (x, y, z) => {
    const wx = M[0] * x + M[4] * y + M[8] * z + M[12];
    const wy = M[1] * x + M[5] * y + M[9] * z + M[13];
    const wz = M[2] * x + M[6] * y + M[10] * z + M[14];
    if (ceil && ceil.n[0] * wx + ceil.n[1] * wy + ceil.n[2] * wz > ceil.d) return false; // 天井を隠しているときは、隠れた点を選ばない
    return wx >= clipMin[0] && wx <= clipMax[0] && wy >= clipMin[1] && wy <= clipMax[1] && wz >= clipMin[2] && wz <= clipMax[2];
  };
  // 調べたセル（同じセルを何度も見ないため。数が増えたら忘れる。見直しても結果は同じ）
  let seen = new Set();
  let best = null, bestT = Infinity, bestS = Infinity;
  const step = cell * 0.5;
  // 粗い格子で、まわり（3×3×3）に点がなければ空の所を一気に進む
  const coarseEmpty = (x, y, z) => {
    const X = Math.floor((x - min[0]) / C), Y = Math.floor((y - min[1]) / C), Z = Math.floor((z - min[2]) / C);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const ix = X + a, iy = Y + b, iz = Z + c;
      if (ix < 0 || iy < 0 || iz < 0 || ix >= cdims[0] || iy >= cdims[1] || iz >= cdims[2]) continue;
      if (bsearch(coarse, ix + cdims[0] * (iy + cdims[1] * iz)) >= 0) return false;
    }
    return true;
  };
  for (let t = t0; t <= t1; t += step) {
    if (win ? t > win[1] + 2 * cell : t > bestT + 2 * cell) break;
    if (win && t < win[0] - 2 * cell - tolA * win[0] - tolB) { t = Math.max(t, win[0] - 2 * cell - tolA * win[0] - tolB - step); continue; }
    const px = o[0] + d[0] * t, py = o[1] + d[1] * t, pz = o[2] + d[2] * t;
    if (coarseEmpty(px, py, pz)) { t += C * 0.5 - step; continue; }
    const tol = tolA * t + tolB;
    const r = Math.min(3, Math.ceil(tol / cell));
    const cx = Math.floor((px - min[0]) / cell), cy = Math.floor((py - min[1]) / cell), cz = Math.floor((pz - min[2]) / cell);
    if (seen.size > 200000) seen = new Set();
    for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const ix = cx + dx, iy = cy + dy, iz = cz + dz;
      if (ix < 0 || iy < 0 || iz < 0 || ix >= I.dims[0] || iy >= I.dims[1] || iz >= I.dims[2]) continue;
      const key = ix + I.dims[0] * (iy + I.dims[1] * iz);
      if (seen.has(key)) continue;
      seen.add(key);
      const id = cellOf(I, ix, iy, iz);
      if (id < 0) continue;
      for (let s = start[id]; s < start[id + 1]; s++) {
        const i = sorted[s];
        const vx = P[3 * i] - o[0], vy = P[3 * i + 1] - o[1], vz = P[3 * i + 2] - o[2];
        const tt = vx * d[0] + vy * d[1] + vz * d[2];
        if (tt <= 0 || (win ? tt < win[0] || tt > win[1] : tt >= bestT)) continue;
        const perp2 = vx * vx + vy * vy + vz * vz - tt * tt;
        const tl = tolA * tt + tolB;
        if (perp2 > tl * tl) continue;
        if (win && perp2 >= bestS) continue;
        if (!visible(P[3 * i], P[3 * i + 1], P[3 * i + 2])) continue;
        bestT = tt; best = i; bestS = perp2;
      }
    }
  }
  return best === null ? null : { index: best, t: bestT, p: [P[3 * best], P[3 * best + 1], P[3 * best + 2]] };
}

// ---- 水平補正と廊下の向き ----
function jacobiEigen(A) {
  // 3x3 対称行列。戻り値 { values, vectors(列が固有ベクトル) }
  const a = A.map(r => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 50; it++) {
    let p = 0, q = 1;
    if (Math.abs(a[0][2]) > Math.abs(a[p][q])) { p = 0; q = 2; }
    if (Math.abs(a[1][2]) > Math.abs(a[p][q])) { p = 1; q = 2; }
    if (Math.abs(a[p][q]) < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p], akq = a[k][q];
      a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k], aqk = a[q][k];
      a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p], vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

function voxelNormals(P, m, voxel) {
  // P の先頭 m 点について、ボクセルごとの平面の法線（平面らしくなければ null）
  const cells = new Map();
  for (let i = 0; i < m; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    const key = `${Math.floor(x / voxel)},${Math.floor(y / voxel)},${Math.floor(z / voxel)}`;
    let c = cells.get(key);
    if (!c) { c = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, []]; cells.set(key, c); }
    c[0]++; c[1] += x; c[2] += y; c[3] += z;
    c[4] += x * x; c[5] += x * y; c[6] += x * z; c[7] += y * y; c[8] += y * z; c[9] += z * z;
    c[10].push(i);
  }
  const out = [];
  for (const [key, c] of cells) {
    const n = c[0];
    if (n < 6) continue;
    const mx = c[1] / n, my = c[2] / n, mz = c[3] / n;
    const C = [[c[4] / n - mx * mx, c[5] / n - mx * my, c[6] / n - mx * mz],
               [c[5] / n - mx * my, c[7] / n - my * my, c[8] / n - my * mz],
               [c[6] / n - mx * mz, c[8] / n - my * mz, c[9] / n - mz * mz]];
    const { values, vectors } = jacobiEigen(C);
    const order = [0, 1, 2].sort((i, j) => values[i] - values[j]);
    if (!(values[order[0]] < 0.1 * values[order[1]]) || values[order[1]] < 1e-6) continue;
    const k = order[0];
    const nrm = [vectors[0][k], vectors[1][k], vectors[2][k]];
    // ボクセルの境界で面が切られると、雑音の片側だけが残って法線が境界の向き（水平・垂直）に引っぱられる。
    // 周りのボクセルも含め、重心からの球の中で「最初の面に近い点」だけで面を当て直して、その偏りを消す
    let r = nrm;
    for (let it = 0; it < 2; it++) r = refitPlane(P, cells, key, [mx, my, mz], r, voxel) || r;
    out.push({ n: r, count: n, pts: c[10] });
  }
  return out;
}

function refitPlane(P, cells, key, ctr, nrm, voxel) {
  const [ix, iy, iz] = key.split(',').map(Number);
  const R2 = (0.8 * voxel) ** 2, gate = 0.15 * voxel;
  let n = 0, sx = 0, sy = 0, sz = 0, xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
    const c = cells.get(`${ix + a},${iy + b},${iz + d}`);
    if (!c) continue;
    for (const i of c[10]) {
      const x = P[3 * i] - ctr[0], y = P[3 * i + 1] - ctr[1], z = P[3 * i + 2] - ctr[2];
      if (x * x + y * y + z * z > R2) continue;
      if (Math.abs(x * nrm[0] + y * nrm[1] + z * nrm[2]) > gate) continue;
      n++; sx += x; sy += y; sz += z; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
    }
  }
  if (n < 10) return null;
  const mx = sx / n, my = sy / n, mz = sz / n;
  const C = [[xx / n - mx * mx, xy / n - mx * my, xz / n - mx * mz],
             [xy / n - mx * my, yy / n - my * my, yz / n - my * mz],
             [xz / n - mx * mz, yz / n - my * mz, zz / n - mz * mz]];
  const { values, vectors } = jacobiEigen(C);
  const k = [0, 1, 2].sort((i, j) => values[i] - values[j])[0];
  return [vectors[0][k], vectors[1][k], vectors[2][k]];
}

function dominantAxis(normals, around, maxDeg) {
  const cosMax = Math.cos(maxDeg * Math.PI / 180);
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let used = 0;
  for (const { n, count } of normals) {
    const c = Math.abs(n[0] * around[0] + n[1] * around[1] + n[2] * around[2]);
    if (c < cosMax) continue;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[a][b] += count * n[a] * n[b];
    used += count;
  }
  if (!used) return null;
  const { values, vectors } = jacobiEigen(S);
  const k = [0, 1, 2].sort((i, j) => values[j] - values[i])[0];
  let v = [vectors[0][k], vectors[1][k], vectors[2][k]];
  if (v[0] * around[0] + v[1] * around[1] + v[2] * around[2] < 0) v = v.map(x => -x);
  return v;
}

function rotationTo(u) {
  // u を +z に重ねる回転行列（行優先 3x3）
  const [x, y, z] = u;
  const v = [y, -x, 0];
  const c = z;
  const s2 = v[0] * v[0] + v[1] * v[1];
  if (s2 < 1e-12) return c > 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
  const k = (1 - c) / s2;
  const K = [[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]];
  const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let kk = 0;
    for (let m = 0; m < 3; m++) kk += K[i][m] * K[m][j];
    R[i][j] += K[i][j] + k * kk;
  }
  return R;
}

const mul = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const apply = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];

// 自動の補正に自信がないときの誤り（画面は、開いたときの自動の補正なら静かにやめ、手動のときだけ知らせる）
function unsure(message) { const e = new Error(message); e.unsure = true; return e; }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// 床の高さ: 高さの層（10 cm ごと）を「点の数」ではなく「覆う広さ（点のある 0.5 m 角のマスの数）」で比べる
//   （MID-360 は下向きの視野が狭く、床の点は天井の数 % しか写らないが、広さは天井と同じくらいある）
//   壁はどの高さでも同じくらいのマスを覆うので、前後 ±0.5 m の最小を引いた「増えた分」を層の広さとする
//   ファイルの原点（FAST-LIO などではセンサーの位置）が地図の中にあれば、その下で最も広い層を床にする
//   （床の下に別の階が写っていても選ばない）。原点が使えなければ、十分広い層（最も広い層の半分以上）で最も低いもの
//   原点の真上の層が床で、その下にだけ同じくらい広い層がある（上にはない）なら、上下が逆とみなす
function findFloor(ds, normals, R1) {
  const P = ds.positions, m = Math.min(ds.n, 400000);
  const X = new Float64Array(m), Y = new Float64Array(m), Z = new Float64Array(m);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < m; i++) {
    const q = apply(R1, [P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
    X[i] = q[0]; Y[i] = q[1]; Z[i] = q[2];
  }
  // 外れ値で格子が巨大にならないよう、0.1〜99.9% の範囲だけを使う
  const pr = a => { const s = Float64Array.from(a).sort(); return [s[Math.floor(0.001 * (m - 1))], s[Math.floor(0.999 * (m - 1))]]; };
  [x0, x1] = pr(X); [y0, y1] = pr(Y); [lo, hi] = pr(Z);
  const g = 0.5, bw = Math.max(0.1, (hi - lo) / 20000);
  const gx = Math.floor((x1 - x0) / g) + 1, gy = Math.floor((y1 - y0) / g) + 1, nb = Math.floor((hi - lo) / bw) + 1;
  if (!(gx * gy * nb < 2 ** 52)) return null;
  const cov = new Float64Array(nb), seen = new Set();
  for (let i = 0; i < m; i++) {
    if (X[i] < x0 || X[i] > x1 || Y[i] < y0 || Y[i] > y1 || Z[i] < lo || Z[i] > hi) continue;
    const b = Math.floor((Z[i] - lo) / bw), key = b * gx * gy + Math.floor((X[i] - x0) / g) * gy + Math.floor((Y[i] - y0) / g);
    if (!seen.has(key)) { seen.add(key); cov[b]++; }
  }
  const W = Math.max(1, Math.round(0.5 / bw)), sm = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    let mn = Infinity;
    for (let k = -W; k <= W; k++) if (b + k >= 0 && b + k < nb) mn = Math.min(mn, cov[b + k]);
    sm[b] = cov[b] - mn;
  }
  let mx = 0;
  for (let b = 0; b < nb; b++) if (sm[b] > mx) mx = sm[b];
  if (mx < 20) return null;
  const peaks = [];
  for (let b = 0; b < nb; b++) {
    const left = b > 0 ? sm[b - 1] : -1, right = b < nb - 1 ? sm[b + 1] : -1;
    if (sm[b] < 0.05 * mx || !(sm[b] >= left && sm[b] > right)) continue;
    peaks.push({ z: lo + (b + 0.5) * bw, a: sm[b] });
  }
  if (!peaks.length) return null;
  const big = p => p.a >= 0.5 * mx;
  const o = apply(R1, ds.offset.map(v => -v)); // ファイルの原点（ボクセルと同じ座標）
  let floor = null, byOrigin = false;
  if (o[0] >= x0 - 1 && o[0] <= x1 + 1 && o[1] >= y0 - 1 && o[1] <= y1 + 1) {
    const under = peaks.filter(p => p.z <= o[2] + 0.15 && p.z >= o[2] - 3 && p.a >= 0.05 * mx);
    if (under.length) {
      const amax = Math.max(...under.map(p => p.a));
      floor = under.filter(p => p.a >= 0.8 * amax).sort((a, b) => b.z - a.z)[0];
      byOrigin = true;
    }
  }
  if (!floor) floor = peaks.find(big);
  const flipped = byOrigin && !peaks.some(p => big(p) && p.z >= floor.z + 1.8) && peaks.some(p => big(p) && p.z <= floor.z - 1.8);
  // 床の高さを細かく: 層のまわりの点の高さの平均（幅を狭めながら）
  let zc = floor.z;
  for (const r of [0.08, 0.05, 0.03]) {
    let w = 0, wz = 0;
    for (let i = 0; i < m; i++) if (Math.abs(Z[i] - zc) <= r) { w++; wz += Z[i]; }
    if (w) zc = wz / w;
  }
  return { floorZ: zc, flipped };
}

//   maxTilt: これより傾いていたら補正しない（開いたときの自動の補正は 20°。60° 傾いた地図の壁を床と取り違えないため）
function analyze(ds, maxTilt = 35) {
  const m = Math.min(ds.n, 400000);
  const normals = voxelNormals(ds.positions, m, 0.3);
  if (normals.length < 20) throw unsure('平面が少なすぎて、向きを決められません');
  let total = 0;
  for (const { count } of normals) total += count;
  const C3 = Math.cos(3 * Math.PI / 180), S3 = Math.sin(3 * Math.PI / 180);
  const score = d => {
    let par = 0, perp = 0;
    for (const { n, count } of normals) {
      const c = Math.abs(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]);
      if (c >= C3) par += count; else if (c <= S3) perp += count;
    }
    return { par, perp };
  };
  // 1. 互いに直交する面の組（床・天井と壁）: 面の法線を候補に、平行な面と直交する面が最も多い向きを探し、
  //    その組の 3 つの軸のうち z に最も近いものを上とする（35° より傾いていたら、床と壁の区別がつかないので補正しない）
  const cand = normals.slice().sort((a, b) => b.count - a.count);
  const pick = cand.slice(0, 150);
  const stride = Math.max(1, Math.floor(cand.length / 150));
  for (let i = 150; i < cand.length; i += stride) pick.push(cand[i]);
  let d0 = null, best = -1;
  for (const c of pick) { const s = score(c.n); if (s.par + s.perp > best) { best = s.par + s.perp; d0 = c.n; } }
  // 2 本目の軸: d0 に直交する法線を候補に、平行な面（±3°）が最も多い向きを選ぶ（R3-001）。
  // 固有ベクトルで決めると、床・天井と壁の点の数が近い部屋や廊下で 2 つの向きの中間（十数〜30° 傾いた向き）になる
  const ortho = cand.filter(c => Math.abs(c.n[0] * d0[0] + c.n[1] * d0[1] + c.n[2] * d0[2]) <= S3);
  if (!ortho.length) throw unsure('床・天井と壁のような直交する面が少なく、向きを決められません');
  const pick2 = ortho.slice(0, 150), st2 = Math.max(1, Math.floor(ortho.length / 150));
  for (let i = 150; i < ortho.length; i += st2) pick2.push(ortho[i]);
  let e2 = null, best2 = -1;
  for (const c of pick2) { const sp = score(c.n).par; if (sp > best2) { best2 = sp; e2 = c.n; } }
  const dd = e2[0] * d0[0] + e2[1] * d0[1] + e2[2] * d0[2];
  e2 = norm([e2[0] - dd * d0[0], e2[1] - dd * d0[1], e2[2] - dd * d0[2]]);
  const e3 = norm(cross(d0, e2));
  let up = [d0, e2, e3].sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]))[0];
  if (up[2] < 0) up = up.map(x => -x);
  // 床と壁の角などで混ざった法線を外すため、許す角度を狭めながら当て直す
  for (const deg of [4, 2]) up = dominantAxis(normals, up, deg) || up;
  let tilt = Math.acos(Math.min(1, up[2])) * 180 / Math.PI;
  if (tilt > Math.min(35, maxTilt)) throw unsure(`傾きが大きすぎて（約 ${Math.round(tilt)}°）、床と壁の区別がつきません`);
  const sc = score(up);
  if (sc.par < 0.05 * total) throw unsure('床や天井のような水平な面が見つかりません');
  if (sc.par + sc.perp < 0.5 * total) throw unsure('床・天井と壁のような直交する面が少なく、向きを決められません');
  // 選んだ上向きより水平に近い大きな面（例: 45° の屋根面だけの屋根裏の床）が別にあれば、上向きを取り違えている（R17-004）
  const C10 = Math.cos(10 * Math.PI / 180);
  for (const c of pick) {
    if (Math.abs(c.n[2]) <= up[2] + 0.02) continue;
    if (Math.abs(c.n[0] * up[0] + c.n[1] * up[1] + c.n[2] * up[2]) >= C10) continue;
    if (score(c.n).par >= 0.3 * sc.par) throw unsure('床と斜めの面（屋根など）の区別がつかず、向きを決められません');
  }
  let R1 = rotationTo(up);
  // 3. 床の高さ（廊下の向きの回転は z を変えないので、先に求める）
  const fl = findFloor(ds, normals, R1);
  if (!fl) throw unsure('床が見つかりません');
  let floorZ = fl.floorZ;
  if (fl.flipped) { R1 = mul([[1, 0, 0], [0, -1, 0], [0, 0, -1]], R1); floorZ = -floorZ; tilt = 180 - tilt; }
  // 2. 廊下の向き（垂直な面の法線の向きのヒストグラム。180 度の周期）
  const bins = new Float64Array(360);
  const vert = [];
  for (const { n, count } of normals) {
    const r = apply(R1, n);
    if (Math.abs(r[2]) > 0.15) continue;
    let a = Math.atan2(r[1], r[0]) * 180 / Math.PI;
    a = ((a % 180) + 180) % 180;
    bins[Math.floor(a * 2) % 360] += count;
    vert.push([a, count]);
  }
  let yaw = 0;
  if (vert.length) {
    let bestB = 0, bestV = -1;
    for (let b = 0; b < 360; b++) {
      let s = 0;
      for (let k = -4; k <= 4; k++) s += bins[(b + k + 360) % 360];
      if (s > bestV) { bestV = s; bestB = b; }
    }
    const peak = bestB / 2;
    // ピーク付近の平均（角度を 2 倍にして平均する）
    let sx = 0, sy = 0;
    for (const [a, c] of vert) {
      let da = a - peak; da = ((da + 90) % 180 + 180) % 180 - 90;
      if (Math.abs(da) > 3) continue;
      sx += c * Math.cos(2 * a * Math.PI / 180); sy += c * Math.sin(2 * a * Math.PI / 180);
    }
    const wallNormalDeg = Math.atan2(sy, sx) * 90 / Math.PI;
    // 壁の法線を y 軸に → 廊下は x 軸に沿う（回す角度は ±90 度以内にする）
    yaw = 90 - wallNormalDeg;
    yaw = ((yaw + 90) % 180 + 180) % 180 - 90;
  }
  const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
  const Rz = [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  const R = mul(Rz, R1);
  return { R1, R, tiltDeg: tilt, yawDeg: yaw, floorZ, flipped: fl.flipped };
}

// ---- メッセージ処理 ----
self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      const progress = p => self.postMessage({ type: 'progress', id: msg.id, phase: '読み込み', p });
      const opts = { cap: msg.cap, offset: msg.offset, companions: msg.companions, asset: name => getAsset(name, msg.base), assetURL: name => getAssetURL(name, msg.base) };
      let sink, info;
      const read = async () => {
      if (msg.mesh) {
        // 画面側で読んだメッシュ（FBX・COLLADA）
        sink = new Sink(opts);
        addMesh(sink, msg.mesh.V, msg.mesh.T, msg.mesh.C);
        info = { format: msg.mesh.format, note: '面の上に点を散らして表示しています' };
      } else if (msg.pixels) {
        // 画面側で画素にした画像（SVG）
        sink = new Sink(opts);
        addPixels(sink, msg.pixels.w, msg.pixels.h, msg.pixels.data);
        info = { format: msg.pixels.format, note: '1 画素を 1 点（1 m 間隔）として平面に並べています' };
      } else ({ sink, info } = await loadFile(msg.file, msg.name, opts, progress));
      return sink.finish();
      };
      let r = await read();
      // 1 つのファイルに、原点付近の部分と地図座標の部分が混ざっているとき（R2-001）:
      // シフトはひとつなので、点の多い方に合わせて読み直し、もう一方が丸められることを知らせる
      if (r.far && !msg.offset && r.far * 2 > r.total && r.farCenter) {
        opts.offset = r.farCenter.map(c => Math.abs(c) >= 1e4 ? Math.round(c / 100) * 100 : 0);
        opts.selfShift = true; // 自分で決め直したシフト（「先に開いたファイルと離れている」の注記は出さない）
        r = await read();
      }
      if (r.far) {
        const cm = r.farMax * Math.pow(2, -24) * 100; // float32 の丸めの最大（半目盛り）
        const pc = r.far / Math.max(1, r.total) * 100;
        const mixed = `このファイルには、座標が大きく離れた部分が混ざっています（全体の ${pc < 1 ? '1 % 未満' : `約 ${Math.round(pc)} %`}）。座標のシフトはひとつしか使えないため、その部分の座標は最大で約 ${cm < 1 ? cm.toFixed(1) : Math.round(cm)} cm 丸められています。精度が要るときは、部分ごとに分けたファイルを開いてください`;
        info.note = info.note ? `${info.note}。${mixed}` : mixed;
      }
      if (!r.n) throw new Error(r.skipped ? `座標の正しい点がありません（${r.skipped.toLocaleString()} 点を除外）` : '点がありません');
      const ds = { n: r.n, positions: r.positions, fields: r.fields, rgb: r.rgb, offset: r.offset || [0, 0, 0] };
      self.postMessage({ type: 'progress', id: msg.id, phase: '並べ替え', p: 0 });
      shuffle(ds);
      ds.bbox = bbox(ds.positions);
      sets.set(msg.id, ds);
      const stats = {};
      for (const k of Object.keys(ds.fields)) stats[k] = fieldStats(ds.fields[k]);
      const pos = ds.positions.slice();
      const rgb = ds.rgb ? ds.rgb.slice() : null;
      const header = { data: info.format || '', fields: ['x', 'y', 'z', ...(rgb ? ['rgb'] : []), ...Object.keys(ds.fields)], note: info.note || '' };
      // 値の欄の基準値（double の欄を float で持つときに引いた値。表示するときに足し戻す）
      const fieldBase = r.fieldBase || null;
      self.postMessage({ type: 'loaded', id: msg.id, n: ds.n, total: r.total, sampled: r.sampled, skipped: r.skipped, offset: r.offset, header, bbox: ds.bbox, stats, fieldBase, positions: pos, rgb },
        rgb ? [pos.buffer, rgb.buffer] : [pos.buffer]);
      // ここから先の失敗は「読み込みの失敗」ではない（'error' を送ると画面が次のファイルへもう一度進んでしまう）
      // 点の間隔（隣の点までの距離の中央値）。索引はクリックで点を選ぶときにも使う。求められなければ null と理由
      let spacing = null, reason = '';
      try { spacing = pointSpacing(ds); if (spacing == null) reason = '点がまばらで求められません'; } catch (err) { ds.index = null; reason = '点の索引を作れませんでした（' + (err.message || err) + '）'; }
      self.postMessage({ type: 'spacing', id: msg.id, spacing, reason });
    } else if (msg.type === 'buffers') {
      // WebGL の文脈が戻ったとき、画面側が捨てた座標・色の写しをもう一度渡す（開き直さずに描き直す。R11-003・R14-004・R15-005）
      const ds = sets.get(msg.id);
      if (!ds) throw new Error('点群が見つかりません');
      const pos = ds.positions.slice(), rgb = ds.rgb ? ds.rgb.slice() : null;
      self.postMessage({ type: 'buffers', id: msg.id, positions: pos, rgb, req: msg.req }, rgb ? [pos.buffer, rgb.buffer] : [pos.buffer]);
    } else if (msg.type === 'field') {
      const ds = sets.get(msg.id);
      const a = ds.fields[msg.name].slice();
      self.postMessage({ type: 'field', id: msg.id, name: msg.name, values: a, req: msg.req }, [a.buffer]);
    } else if (msg.type === 'tbounds') {
      // 行列で回した全点の範囲（画面側は全点を持たないので、ここで求める）
      const ds = sets.get(msg.id), P = ds.positions, e = msg.M, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < ds.n; i++) {
        const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
        for (let k = 0; k < 3; k++) { const v = e[k] * x + e[4 + k] * y + e[8 + k] * z + e[12 + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
      }
      self.postMessage({ type: 'tbounds', req: msg.req, lo, hi });
    } else if (msg.type === 'pick') {
      let best = null;
      for (const q of msg.queries) {
        const ds = sets.get(q.id);
        if (!ds) continue;
        if (!ds.index) self.postMessage({ type: 'status', text: `${q.name} の索引を作成中…` });
        let r = pickIn(ds, q.o, q.d, q.tolA, q.tolB, q.M, msg.clipMin, msg.clipMax, msg.ceil || null);
        // 許す幅いっぱいの中で一番手前の点は、斜めに見た床などで幅の縁（カメラ寄り）になる（R7-004）
        // 一番手前の点から、許す幅の 2 倍（45° に斜めに見た面で、許す円の中に入る奥行きの幅）までの点のうち、光線に一番近い点を選び直す。
        // 幅を広げすぎると、上から見た箱の縁から横の床へ移ってしまう（以前は 3 倍＋索引のマス。A14 c1）
        if (r) {
          const tl = q.tolA * r.t + q.tolB, w = 2 * tl;
          const n = pickIn(ds, q.o, q.d, q.tolA, q.tolB, q.M, msg.clipMin, msg.clipMax, msg.ceil || null, [r.t, r.t + w]);
          // 選び直した点が、一番手前の点より光線にはっきり（許す幅の半分以上）近いときだけ使う。
          // 上から見た箱の縦の面のように近さがほとんど変わらないときは、手前（上の縁）のままにする（A14 c1）
          if (n && perpOf(ds, q, n.index) < perpOf(ds, q, r.index) - 0.5 * tl) r = n;
        }
        if (r && (!best || r.t * q.scale < best.tw)) best = { ...r, id: q.id, tw: r.t * q.scale };
      }
      if (best) {
        const ds = sets.get(best.id);
        best.fields = {};
        for (const k of Object.keys(ds.fields)) best.fields[k] = ds.fields[k][best.index];
        if (ds.rgb) best.rgb = [ds.rgb[3 * best.index], ds.rgb[3 * best.index + 1], ds.rgb[3 * best.index + 2]];
      }
      self.postMessage({ type: 'picked', req: msg.req, hit: best });
    } else if (msg.type === 'analyze') {
      const ds = sets.get(msg.id);
      if (!ds) throw new Error('ファイルが閉じられました');
      const r = analyze(ds, msg.maxTilt || 35);
      self.postMessage({ type: 'analyzed', req: msg.req, ...r });
    } else if (msg.type === 'traj') {
      const r = parseTrajectory(msg.buffer);
      self.postMessage({ type: 'traj', id: msg.id, ...r }, [r.poses.buffer]);
    } else if (msg.type === 'remove') {
      sets.delete(msg.id);
    }
  } catch (err) {
    let message = err.message || String(err);
    // ページの設定で WebAssembly が止められている場合（LAZ・Draco・IFC・STEP が使う）
    // 原因を分けて言う（R14-001・R14-006）: 文字列の eval の禁止／部品の取り寄せの失敗／WebAssembly の禁止
    if (/evaluate a string|EvalError/i.test(message) && !/WebAssembly\.(compile|instantiate)|Refused to compile/i.test(message)) message = `この画面の設定（文字列のプログラムの実行の禁止）のため、この形式の部品が動かず開けません。アプリ version では開けます（${message.slice(0, 80)}）`;
    else if (/fetching of the wasm failed|Failed to fetch|NetworkError|connect-src/i.test(message)) message = `この画面の設定で展開用の部品を読み込めないため開けません。アプリ version では開けます（${message.slice(0, 80)}）`;
    else if (/WebAssembly|wasm|unsafe-eval|Content Security Policy/i.test(message)) message = `この画面では展開用の部品（WebAssembly）が使えないため開けません。アプリ version では開けます（${message.slice(0, 80)}）`;
    self.postMessage({ type: 'error', id: msg.id, req: msg.req, message, unsure: !!err.unsure });
  }
};
