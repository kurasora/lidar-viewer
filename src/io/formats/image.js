// 画像（1 画素 = 1 点、色付きの平面）とラスター（GeoTIFF などの高さの格子）
//   ブラウザが読める画像（PNG JPEG GIF BMP WebP ICO CUR）はそのまま展開し、
//   PNM（PBM PGM PPM）・TGA・XBM・XPM・WBMP・ICNS はここで読む。SVG は画面側で画素にしてから渡す
import { decode, decodeLatin } from '../util.js';

// 読み取り中の内部の英語の例外（RangeError・TypeError・JSON の SyntaxError・部品の英語の誤り）を日本語にする
//   日本語の知らせ・WebAssembly の知らせ（worker.js で言い換える）はそのまま通す。メッシュ・図面の読み方でも使う
const JA = /[぀-ヿ一-鿿]/;
export function guard(fmt, fn) {
  return async (...a) => {
    try { return await fn(...a); } catch (e) {
      const m = String((e && e.message) || e || '');
      if (JA.test(m) || /WebAssembly|wasm|unsafe-eval|Content Security Policy/i.test(m)) throw e;
      if (/allocation failed|Invalid (typed )?array length|out of memory|Array buffer allocation/i.test(m)) throw new Error(`${fmt} を開くためのメモリが足りません（ファイルが壊れているか、大きすぎます）`);
      throw new Error(`${fmt} のファイルが壊れているか、途中で切れているため開けません`);
    }
  };
}

// 画素の入れ物。壊れた頭書きの大きさで巨大なメモリを確保しないように、大きさを確かめる
//   possible: ファイルの大きさから見てありうる最大の画素数
const MAX_PIXELS = 1.5e8;
function pixels(w, h, possible) {
  if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0)) throw new Error(`画像の大きさ（${w} × ${h}）が正しくありません。ファイルが壊れている可能性があります`);
  if (w * h > MAX_PIXELS) throw new Error(`画像が大きすぎます（${w.toLocaleString()} × ${h.toLocaleString()} 画素）。1 億 5,000 万画素までです`);
  if (w * h > possible) throw new Error(`画像の大きさ（${w.toLocaleString()} × ${h.toLocaleString()} 画素）がファイルの大きさに合いません。ファイルが壊れているか、途中で切れています`);
  return new Uint8ClampedArray(w * h * 4);
}
import { fromArrayBuffer } from 'geotiff';

export const IMAGE_EXTS = ['bmp', 'cur', 'gif', 'icns', 'ico', 'jpeg', 'jpg', 'pbm', 'pgm', 'png', 'ppm', 'svg', 'svgz', 'tga', 'wbmp', 'webp', 'xbm', 'xpm'];

// 画素を点にする（x = 列、y = −行、z = 0）。明るさを値の欄に入れる
export function addPixels(sink, w, h, rgba, scale = 1) {
  sink.rgb(); sink.hint(w * h);
  const fl = sink.field('luminance');
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = 4 * (r * w + c);
    if (rgba[i + 3] === 0) continue; // 透明な画素は点にしない
    const k = sink.slot(c * scale, -r * scale, 0);
    if (k < 0) continue;
    sink.C[3 * k] = rgba[i]; sink.C[3 * k + 1] = rgba[i + 1]; sink.C[3 * k + 2] = rgba[i + 2];
    sink.F[fl][k] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
}

async function browserDecode(bytes, type) {
  const bmp = await createImageBitmap(new Blob([bytes], { type }));
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const g = cv.getContext('2d');
  g.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, data: g.getImageData(0, 0, bmp.width, bmp.height).data };
}

// ---- PNM（P1〜P6）
function pnm(b) {
  let p = 0;
  const tok = () => { for (;;) { while (p < b.length && b[p] <= 32) p++; if (b[p] === 35) { while (p < b.length && b[p] !== 10) p++; } else break; } const s = p; while (p < b.length && b[p] > 32) p++; return decodeLatin(b, s, p); };
  const magic = tok();
  if (!/^P[1-6]$/.test(magic)) throw new Error('PBM・PGM・PPM の画像ではありません（先頭が P1〜P6 ではありません）');
  const kind = +magic[1];
  const w = +tok(), h = +tok(), max = (kind === 1 || kind === 4) ? 1 : +tok();
  const left = b.length - p, two0 = max > 255 ? 2 : 1;
  const possible = kind === 1 ? left : kind === 2 ? left / 2 + 1 : kind === 3 ? left / 6 + 1 : kind === 4 ? (left / Math.max(1, Math.ceil(w / 8))) * w : kind === 5 ? left / two0 : left / (3 * two0);
  const out = pixels(w, h, possible);
  if (kind >= 4) p++;
  const sc = 255 / max, two = max > 255;
  for (let i = 0; i < w * h; i++) {
    let r, g, bl;
    if (kind === 1) { // P1 は 1 文字ずつ（数字の間に空白がなくてもよい）
      for (;;) { while (p < b.length && b[p] <= 32) p++; if (b[p] === 35) { while (p < b.length && b[p] !== 10) p++; } else break; }
      r = g = bl = (b[p++] === 49 ? 0 : 255);
    }
    else if (kind === 2) { r = g = bl = +tok() * sc; }
    else if (kind === 3) { r = +tok() * sc; g = +tok() * sc; bl = +tok() * sc; }
    else if (kind === 4) { const row = Math.floor(i / w), col = i % w, rb = Math.ceil(w / 8); const byte = b[p + row * rb + (col >> 3)]; r = g = bl = (byte >> (7 - (col & 7))) & 1 ? 0 : 255; }
    else if (kind === 5) { r = g = bl = (two ? (b[p] << 8 | b[p + 1]) : b[p]) * sc; p += two ? 2 : 1; }
    else { const rd = () => { const v = two ? (b[p] << 8 | b[p + 1]) : b[p]; p += two ? 2 : 1; return v * sc; }; r = rd(); g = rd(); bl = rd(); }
    out.set([r, g, bl, 255], 4 * i);
  }
  return { w, h, data: out };
}
// ---- TGA（無圧縮・RLE、8/16/24/32 bit）
function tga(b) {
  if (b.length < 18) throw new Error('TGA の頭書きが途中で切れています');
  const idLen = b[0], cmapType = b[1], type = b[2], cmapFirst = b[3] | b[4] << 8, cmapLen = b[5] | b[6] << 8, cmapBits = b[7];
  const w = b[12] | b[13] << 8, h = b[14] | b[15] << 8, bpp = b[16], desc = b[17];
  if (![1, 2, 3, 9, 10, 11].includes(type)) throw new Error(`この種類の TGA（${type}）には対応していません`);
  const alphaBits = desc & 15; // 0 ならアルファの欄は使わない
  // 色を 1 つ読む（cb: バイト数）
  const color = (q, cb) => {
    if (cb === 1) return [b[q], b[q], b[q], 255];
    if (cb === 2) { const v = b[q] | b[q + 1] << 8; return [(v >> 10 & 31) << 3, (v >> 5 & 31) << 3, (v & 31) << 3, 255]; }
    return [b[q + 2], b[q + 1], b[q], cb === 4 && alphaBits ? b[q + 3] : 255];
  };
  // 色表（カラーマップ）
  const cmapAt = 18 + idLen, cb = Math.ceil(cmapBits / 8);
  const cmap = [];
  if (cmapType === 1) for (let i = 0; i < cmapLen; i++) cmap.push(color(cmapAt + i * cb, cb));
  const mapped = type === 1 || type === 9;
  if (mapped && !cmap.length) throw new Error('色表つきの TGA に色表がありません。ファイルが壊れている可能性があります');
  let p = cmapAt + (cmapType ? cmapLen * cb : 0);
  const B = bpp / 8, n = w * h, px = pixels(w, h, type >= 9 ? (b.length - p) * 128 : (b.length - p) / Math.max(1, B));
  const read = () => {
    let c;
    if (mapped) { const i = B === 2 ? (b[p] | b[p + 1] << 8) : b[p]; c = cmap[i - cmapFirst] || [0, 0, 0, 255]; }
    else c = color(p, B);
    p += B; return c;
  };
  const rle = type >= 9;
  for (let i = 0; i < n;) {
    if (rle) { const c = b[p++]; const cnt = (c & 127) + 1; if (c & 128) { const v = read(); for (let k = 0; k < cnt; k++) px.set(v, 4 * i++); } else for (let k = 0; k < cnt; k++) px.set(read(), 4 * i++); }
    else px.set(read(), 4 * i++);
  }
  // 既定は下から上。上から上（desc の bit5）でなければ上下を返す
  if (!(desc & 32)) { const row = 4 * w, t = new Uint8ClampedArray(row); for (let y = 0; y < h / 2; y++) { const a = y * row, c = (h - 1 - y) * row; t.set(px.subarray(a, a + row)); px.copyWithin(a, c, c + row); px.set(t, c); } }
  return { w, h, data: px };
}
// ---- XBM（C の配列の白黒画像）
function xbm(txt) {
  const mw = /_width\s+(\d+)/.exec(txt), mh = /_height\s+(\d+)/.exec(txt);
  if (!mw || !mh || txt.indexOf('{') < 0) throw new Error('XBM の画像の大きさ（_width・_height）が見つかりません。ファイルが壊れている可能性があります');
  const w = +mw[1], h = +mh[1];
  const bytes = [...txt.slice(txt.indexOf('{')).matchAll(/0x([0-9a-f]+)/gi)].map(m => parseInt(m[1], 16));
  const rb = Math.ceil(w / 8), px = pixels(w, h, (bytes.length / rb + 1) * w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const on = (bytes[y * rb + (x >> 3)] >> (x & 7)) & 1; px.set(on ? [0, 0, 0, 255] : [255, 255, 255, 255], 4 * (y * w + x)); }
  return { w, h, data: px };
}
// ---- XPM（文字で書いた色表と画素）
// 色: #RGB・#RRGGBB・#RRRRGGGGBBBB、X11 の色名（CSS と違うものはここで持つ。ほかは Canvas に解釈させる）
const X11 = { none: [0, 0, 0, 0], black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 255, 0], lime: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0], cyan: [0, 255, 255], magenta: [255, 0, 255], gray: [190, 190, 190], grey: [190, 190, 190], maroon: [176, 48, 96], purple: [160, 32, 240], orange: [255, 165, 0], brown: [165, 42, 42], pink: [255, 192, 203], navy: [0, 0, 128], darkgreen: [0, 100, 0], darkgray: [169, 169, 169], darkgrey: [169, 169, 169], lightgray: [211, 211, 211], lightgrey: [211, 211, 211], olive: [128, 128, 0], teal: [0, 128, 128], silver: [192, 192, 192], gold: [255, 215, 0], violet: [238, 130, 238] };
let nameCv = null;
function xpmColor(v) {
  if (v[0] === '#') {
    const hx = v.slice(1), k = Math.floor(hx.length / 3);
    if (!k) return [0, 0, 0, 255];
    const mx = Math.pow(16, k) - 1;
    return [0, 1, 2].map(j => Math.round(parseInt(hx.slice(j * k, j * k + k), 16) * 255 / mx)).concat(255);
  }
  const n = v.toLowerCase().replace(/\s+/g, '');
  if (X11[n]) { const c = X11[n]; return c.length === 4 ? c : [...c, 255]; }
  const g = /^gr[ae]y(\d{1,3})$/.exec(n);
  if (g) { const x = Math.round(Math.min(100, +g[1]) * 2.55); return [x, x, x, 255]; }
  try { // そのほかの色名は Canvas に解釈させる
    if (!nameCv && typeof OffscreenCanvas === 'function') nameCv = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
    if (nameCv) { nameCv.clearRect(0, 0, 1, 1); nameCv.fillStyle = '#000'; nameCv.fillStyle = n; nameCv.fillRect(0, 0, 1, 1); const d = nameCv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], 255]; }
  } catch (e) { /* 分からない色名は黒 */ }
  return [0, 0, 0, 255];
}
function xpm(txt) {
  const strs = [...txt.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
  if (!strs.length) throw new Error('XPM の中身（文字の行）が見つかりません。ファイルが壊れている可能性があります');
  const [w, h, nc, cpp] = strs[0].trim().split(/\s+/).map(Number);
  if (!(nc >= 0 && cpp >= 1 && strs.length > nc)) throw new Error('XPM の色の数が正しくありません。ファイルが壊れている可能性があります');
  const cmap = {};
  for (let i = 1; i <= nc; i++) {
    const s = strs[i], key = s.slice(0, cpp), m = /(?:^|\s)c\s+(#[0-9a-fA-F]+|[A-Za-z][\w ]*?)\s*(?:\s(?:m|s|g|g4)\s|$)/.exec(s.slice(cpp));
    cmap[key] = m ? xpmColor(m[1]) : [0, 0, 0, 255];
  }
  const px = pixels(w, h, txt.length / Math.max(1, cpp));
  for (let y = 0; y < h; y++) { const row = strs[1 + nc + y] || ''; for (let x = 0; x < w; x++) px.set(cmap[row.slice(x * cpp, x * cpp + cpp)] || [0, 0, 0, 0], 4 * (y * w + x)); }
  return { w, h, data: px };
}
// ---- WBMP（白黒）
function wbmp(b) {
  let p = 2;
  const mb = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 127); } while (c & 128); return v; };
  const w = mb(), h = mb(), rb = Math.ceil(w / 8), px = pixels(w, h, ((b.length - p) / Math.max(1, rb) + 1) * w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const on = (b[p + y * rb + (x >> 3)] >> (7 - (x & 7))) & 1; px.set(on ? [255, 255, 255, 255] : [0, 0, 0, 255], 4 * (y * w + x)); }
  return { w, h, data: px };
}
// ---- ICNS（中の PNG のうち一番大きいもの）
async function icns(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.length);
  let p = 8, best = null;
  while (p + 8 <= b.length) {
    const len = dv.getUint32(p + 4, false);
    const body = b.subarray(p + 8, p + len);
    if (body[0] === 0x89 && body[1] === 0x50 && (!best || body.length > best.length)) best = body;
    if (len < 8) break;
    p += len;
  }
  if (!best) throw new Error('ICNS の中に PNG 形式の画像が見つかりません（古い形式の ICNS には対応していません）');
  return browserDecode(best, 'image/png');
}

// 画像のバイト列を画素（RGBA）にする（メッシュのテクスチャでも使う）
export async function decodeImage(b, ext) {
  if (ext === 'pbm' || ext === 'pgm' || ext === 'ppm' || ext === 'pnm') return pnm(b);
  if (ext === 'tga') return tga(b);
  if (ext === 'xbm') return xbm(decodeLatin(b));
  if (ext === 'xpm') return xpm(decodeLatin(b));
  if (ext === 'wbmp') return wbmp(b);
  if (ext === 'icns') return icns(b);
  if (ext === 'svg' || ext === 'svgz') throw new Error('SVG は画面側で読み込みます');
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') throw new Error('この環境では画像を展開できません');
  const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', ico: 'image/x-icon', cur: 'image/x-icon' }[ext] || '';
  try { return await browserDecode(b, type); } catch (e) { throw new Error('画像を展開できませんでした（壊れているか、対応していない種類の画像です）'); }
}
async function readImage_(src, sink, ctx) {
  const b = await src.all(4e8);
  const ext = ctx.ext;
  const img = await decodeImage(b, ext);
  ctx.progress(0.5);
  addPixels(sink, img.w, img.h, img.data);
  return { format: `画像（${ext.toUpperCase()}、${img.w} × ${img.h} 画素）`, note: '1 画素を 1 点（1 m 間隔）として平面に並べています' };
}

// ---- ラスター（GeoTIFF）: 1 バンドなら値を高さに、3 バンド以上の 8 bit なら色付きの平面に
async function readRaster_(src, sink, ctx) {
  const b = await src.all();
  const tiff = await fromArrayBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const im = await tiff.getImage();
  const w = im.getWidth(), h = im.getHeight(), spp = im.getSamplesPerPixel();
  if (w * h * spp > MAX_PIXELS) throw new Error(`ラスターが大きすぎます（${w.toLocaleString()} × ${h.toLocaleString()} 画素 × ${spp}）。1 億 5,000 万までです`);
  const fd = im.fileDirectory;
  const tag = async n => { try { return fd.hasTag(n) ? await fd.loadValue(n) : undefined; } catch (e) { return undefined; } };
  // 画素 (c, r) → 位置。ModelTransformation（行列。回転・南北の向きもそのまま）、または結び点 + 画素の大きさ
  let geoKeys = null; try { geoKeys = im.getGeoKeys(); } catch (e) { /* 位置の鍵なし */ }
  const M = await tag('ModelTransformation'), tie = await tag('ModelTiepoint'), scale = await tag('ModelPixelScale');
  let geo = true, X, Y;
  const half = geoKeys && geoKeys.GTRasterTypeGeoKey === 2 ? 0 : 0.5; // PixelIsPoint は結び点が画素の中心
  if (M && M.length >= 8) { X = (c, r) => M[0] * (c + half) + M[1] * (r + half) + M[3]; Y = (c, r) => M[4] * (c + half) + M[5] * (r + half) + M[7]; }
  else if (tie && tie.length >= 6 && scale && scale.length >= 2) { const [I, J, , x0, y0] = tie; X = c => x0 + (c + half - I) * scale[0]; Y = (c, r) => y0 - (r + half - J) * scale[1]; }
  else { geo = false; X = c => c + 0.5; Y = (c, r) => -(r + 0.5); } // 座標の情報がなければ 1 画素 = 1 m
  const nodata = im.getGDALNoData();
  const bits = im.getBitsPerSample(), sf = im.getSampleFormat ? im.getSampleFormat() : 1;
  const pi = await tag('PhotometricInterpretation');
  const palette = pi === 3;
  const photo = !palette && (pi === 2 ? spp >= 3 : spp >= 3 && bits <= 8);
  const rs = await im.readRasters({ interleave: false });
  ctx.progress(0.5);
  sink.hint(w * h);
  if (palette) { // パレット: 色表で色を付ける（ColorMap は 16 bit の R…G…B…）
    const cm = await tag('ColorMap');
    if (!cm || !cm.length) throw new Error('パレットの TIFF に色表（ColorMap）がありません。ファイルが壊れている可能性があります');
    const n = cm.length / 3, band = rs[0];
    sink.rgb();
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const v = band[r * w + c];
      const k = sink.slot(X(c, r), Y(c, r), 0);
      if (k >= 0 && v < n) { sink.C[3 * k] = cm[v] >> 8; sink.C[3 * k + 1] = cm[n + v] >> 8; sink.C[3 * k + 2] = cm[2 * n + v] >> 8; }
    }
    return { format: `ラスター画像（パレット、${w} × ${h}${geo ? '、位置情報あり' : ''}）`, note: '1 画素を 1 点として平面に並べています' };
  }
  if (photo) {
    // 8 bit を超える色（16 bit のオルソ画像など）は 8 bit に縮める
    let mx = 255;
    if (bits > 8) { if (sf === 3) { mx = 0; for (let k = 0; k < 3; k++) for (const v of rs[k]) if (v > mx) mx = v; mx = mx <= 1 ? 1 : mx; } else mx = Math.pow(2, bits) - 1; }
    const sc = 255 / (mx || 255);
    sink.rgb();
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (spp >= 4 && rs[3][i] === 0) continue;
      const k = sink.slot(X(c, r), Y(c, r), 0);
      if (k >= 0) { sink.C[3 * k] = Math.round(rs[0][i] * sc); sink.C[3 * k + 1] = Math.round(rs[1][i] * sc); sink.C[3 * k + 2] = Math.round(rs[2][i] * sc); }
    }
    return { format: `ラスター画像（${w} × ${h}、${spp} バンド${bits > 8 ? `、${bits} bit` : ''}${geo ? '、位置情報あり' : ''}）`, note: '1 画素を 1 点として平面に並べています' };
  }
  // 値なし（nodata）: 画素の型に丸めてから比べる（"-3.40282e+38" のような短い書き方でも一致するように）
  let nd = nodata;
  if (nd !== null && Number.isFinite(nd)) nd = sf === 3 ? (bits === 32 ? Math.fround(nd) : nd) : Math.round(nd);
  const fv = sink.field('value');
  const band = rs[0];
  let skipped = 0;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const v = band[r * w + c];
    // 値なし・数でない値・float の最大級の値（-3.4e38 などの番兵）は除く
    if ((nd !== null && (v === nd || v === nodata)) || !Number.isFinite(v) || (sf === 3 && Math.abs(v) >= 3.4e38)) { skipped++; continue; }
    const k = sink.slot(X(c, r), Y(c, r), v);
    if (k >= 0) sink.F[fv][k] = v;
  }
  return { format: `ラスター（${w} × ${h}、${spp} バンド${geo ? '、位置情報あり' : ''}）`, note: `1 バンド目の値を高さにしています${skipped ? `（値のないマス ${skipped.toLocaleString()} 個を除外）` : ''}` };
}
export const readRaster = guard('TIFF', readRaster_);
export const readImage = guard('画像', readImage_);
void decode;
