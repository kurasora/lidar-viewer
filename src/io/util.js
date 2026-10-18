// 読み込みの共通部品
//   Src        … File / Blob / バイト列を、必要な所だけ切り出して読む（巨大なファイルを丸ごとメモリに載せない）
//   eachLine   … テキストを少しずつ読み、1 行ずつ渡す
//   numbersIn  … 1 行の中の数値を区切り文字（空白・タブ・カンマ・セミコロン）で分けて読む
//   parseXML   … 小さな XML 読み取り（E57・PhotoScan の目録用。別スレッドには DOMParser がないため）

export class Src {
  constructor(blob, name = '') {
    if (blob instanceof Uint8Array) blob = new Blob([blob]);
    else if (blob instanceof ArrayBuffer) blob = new Blob([blob]);
    this.blob = blob;
    this.size = blob.size;
    this.name = name || blob.name || '';
  }
  async read(off, len) {
    const end = Math.min(this.size, off + len);
    if (end <= off) return new Uint8Array(0);
    return new Uint8Array(await this.blob.slice(off, end).arrayBuffer());
  }
  // 全体を 1 つのバイト列で読む（小さなファイル向け）
  async all(limit = 1.9e9) {
    if (this.size > limit) throw new Error(`この形式は ${(limit / 1e9).toFixed(1)} GB までのファイルにしか対応していません（${(this.size / 1e9).toFixed(1)} GB）`);
    return new Uint8Array(await this.blob.arrayBuffer());
  }
  async text(limit = 1e9) { return decode(await this.all(limit)); }
}

const td = new TextDecoder('utf-8');
const tdLatin = new TextDecoder('latin1');
export const decode = (b, s = 0, e = b.length) => td.decode(b.subarray(s, e));
export const decodeLatin = (b, s = 0, e = b.length) => tdLatin.decode(b.subarray(s, e));

// 1 行ずつ渡す。onLine(bytes, start, end) が false を返したらやめる。戻り値は読み終えた位置（バイト）
//   改行は LF・CRLF と、CR だけ（古い Mac 形式。最初のかたまりに LF がなく CR があるとき）。先頭の BOM は飛ばす
//   かたまりより長い行は、改行が見つかったときに 1 回だけつなぐ（つなぎ直しで 2 乗の時間にならないように）
export async function eachLine(src, start, onLine, progress = () => {}, chunk = 1 << 24) {
  // 改行の形式は先頭 64 KB で決める（LF がなく CR があれば CR だけの改行）
  const probe = await src.read(start, 1 << 16);
  let off = start, sep = probe.indexOf(10) < 0 && probe.indexOf(13) >= 0 ? 13 : 10, parts = [], partLen = 0;
  let first = true;
  const join = last => {
    const m = new Uint8Array(partLen + last.length);
    let p = 0; for (const a of parts) { m.set(a, p); p += a.length; }
    m.set(last, p); parts = []; partLen = 0;
    return m;
  };
  while (off < src.size) {
    const at = off;
    const buf = await src.read(off, chunk);
    off += buf.length;
    if (!buf.length) break;
    let s = 0, i;
    if (first) {
      first = false;
      if (at === 0 && probe[0] === 0xef && probe[1] === 0xbb && probe[2] === 0xbf) { s = Math.min(3, buf.length); if (s < 3) { off = 3; continue; } } // 先頭の BOM
    }
    while ((i = buf.indexOf(sep, s)) >= 0) {
      let line = buf, ls = s, le = i;
      if (parts.length) { line = join(buf.subarray(s, i)); ls = 0; le = line.length; }
      if (sep === 10 && le > ls && line[le - 1] === 13) le--;
      if (onLine(line, ls, le) === false) return off - (buf.length - i - 1);
      s = i + 1;
    }
    if (s < buf.length) { parts.push(buf.subarray(s)); partLen += buf.length - s; }
    progress(off / src.size);
  }
  if (parts.length) {
    const line = join(new Uint8Array(0));
    let e = line.length; if (e && line[e - 1] === 13) e--;
    onLine(line, 0, e);
  }
  return src.size;
}

// CSV の 1 行を区切り文字（sep のバイト）ごとに分ける。空のセルも 1 列（NaN）に数える。前後の空白・引用符は除く
export function cellsIn(b, s, e, out, sep) {
  let n = 0, t = s;
  for (let i = s; i <= e; i++) {
    if (i < e && b[i] !== sep) continue;
    let a = t, z = i;
    while (a < z && (b[a] === 32 || b[a] === 9 || b[a] === 13 || b[a] === 34)) a++;
    while (z > a && (b[z - 1] === 32 || b[z - 1] === 9 || b[z - 1] === 13 || b[z - 1] === 34)) z--;
    if (n < out.length) out[n] = a < z ? parseToken(b, a, z) : NaN;
    n++; t = i + 1;
  }
  return n;
}

// 数値 1 語を読む（文字列を作らない）。数でなければ NaN
export function parseToken(b, s, e) {
  let i = s, neg = false;
  if (b[i] === 45) { neg = true; i++; } else if (b[i] === 43) i++;
  const c0 = b[i] | 32;
  if (c0 === 110 && e - i === 3) return NaN; // nan
  if (c0 === 105) return e - i === 3 || e - i === 8 ? (neg ? -Infinity : Infinity) : NaN; // inf / infinity（id・intensity などは数でない）
  let v = 0, digits = 0;
  while (i < e && b[i] >= 48 && b[i] <= 57) { v = v * 10 + (b[i] - 48); i++; digits++; }
  if (i < e && b[i] === 46) {
    i++;
    let f = 0, fd = 0;
    while (i < e && b[i] >= 48 && b[i] <= 57) { if (fd < 17) { f = f * 10 + (b[i] - 48); fd++; } i++; digits++; }
    if (fd) v += f / POW10[fd];
  }
  if (!digits) return NaN;
  if (i < e && (b[i] | 32) === 101) {
    i++;
    let eneg = false;
    if (b[i] === 45) { eneg = true; i++; } else if (b[i] === 43) i++;
    let ex = 0;
    while (i < e && b[i] >= 48 && b[i] <= 57) { ex = ex * 10 + (b[i] - 48); i++; }
    v *= Math.pow(10, eneg ? -ex : ex);
  }
  if (i !== e) return NaN; // 数のあとに余計な文字がある（"12abc" など）
  return neg ? -v : v;
}
const POW10 = Array.from({ length: 18 }, (_, k) => Math.pow(10, k));

const isSep = c => c === 32 || c === 9 || c === 44 || c === 59 || c === 13;
// 行の中の数値を out に入れ、語の数を返す（数でない語は NaN）
export function numbersIn(b, s, e, out) {
  let n = 0, i = s;
  while (i < e) {
    while (i < e && isSep(b[i])) i++;
    if (i >= e) break;
    const t = i;
    while (i < e && !isSep(b[i])) i++;
    if (n < out.length) out[n] = parseToken(b, t, i);
    n++;
  }
  return n;
}
export function wordsIn(text) { return text.trim().split(/[\s,;]+/).filter(Boolean); }

// 小さな XML 読み取り: { name, attrs, children, text } の木を返す
export function parseXML(str) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(str))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const node = { name: m[3], attrs: {}, children: [], text: '', parent: top };
      const ar = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = ar.exec(m[4]))) node.attrs[a[1]] = unescapeXML(a[3] ?? a[4]);
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6]) top.text += unescapeXML(m[6]);
  }
  return root;
}
function unescapeXML(s) {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) => {
    const k = e.toLowerCase();
    if (k === 'lt') return '<'; if (k === 'gt') return '>'; if (k === 'amp') return '&'; if (k === 'quot') return '"'; if (k === 'apos') return "'";
    const cp = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '\ufffd'; // 範囲外の文字参照は置き換え文字に
  });
}
export const xmlChild = (n, name) => n && n.children.find(c => localName(c.name) === name);
export const xmlChildren = (n, name) => (n ? n.children.filter(c => localName(c.name) === name) : []);
export const localName = s => s.slice(s.indexOf(':') + 1);
export function xmlFind(n, name, out = []) {
  if (!n) return out;
  // 深い入れ子でもスタックがあふれないよう、再帰でなく配列で回す（順番は前と同じ: 深さ優先・前から）
  const stack = [[n, 0]];
  while (stack.length) {
    const top = stack[stack.length - 1], [node, i] = top;
    if (i >= node.children.length) { stack.pop(); continue; }
    top[1]++;
    const c = node.children[i];
    if (localName(c.name) === name) out.push(c);
    if (c.children.length) stack.push([c, 0]);
  }
  return out;
}

// 乱数（毎回同じ結果になるよう種を固定）
//   sfc32（128 bit の状態）。前の xorshift32 は続けて出る値に相関があり、間引きで前の方の点が少なくなった
export function rng(seed = 1) {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed >>> 0 || 1; // 種 0 は 1 と同じ
  const u32 = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) u32();
  return () => (u32() * 2097152 + (u32() >>> 11)) / 9007199254740992; // 53 bit の [0, 1)
}

// 頭書きに書かれた数が、ファイルの大きさから見てありえないときは止める
// （数十バイトの壊れたファイルで、何 GB ものメモリを確保して固まらないように）
export function checkCount(n, possible, what) {
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) throw new Error(`${what}の数（${n}）が正しくありません。ファイルが壊れている可能性があります`);
  if (n > possible) throw new Error(`${what}の数（${n.toLocaleString()}）がファイルの大きさに合いません。ファイルが壊れているか、途中で切れています`);
  return n;
}
export const extOf = name => { const n = name.toLowerCase(); const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i + 1); };
export const baseName = name => name.replace(/^.*[\\/]/, '');
