// A03: 変異（種を固定して再現できる）
//   mutate(bytes, spec) → 新しい Uint8Array。spec.op で種類を選ぶ。'havoc' は複数を重ねる
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const I8 = [0x00, 0xff, 0x7f, 0x80, 0x01, 0x20, 0x0a, 0x0d, 0x39, 0x2d, 0x2e, 0x23, 0x3c, 0x3e];
const I32 = [0, 1, 0xffffffff, 0x7fffffff, 0x80000000, 0xffff, 0x10000, 0x3b9aca00, 255, 256, 0x40000000, 0xfffffffe, 0xfffffff0];
export const ISTR = ['nan', '-nan', 'inf', '-inf', '1e400', '-1e400', '1e-400', '99999999999999999999999', '-0', '0', '-1', '', 'abc', '1e9', '4294967295', '2147483648',
  '1.#INF', 'NaN', 'Infinity', '0x7fffffff', '1,5', '１２３', '−1', '1e12', '-2147483649', '3.4e39', '1e308', '1e-45', '.', '-', '+', 'e5', '1e', '1..2'];
const te = new TextEncoder();
const pick = (r, a) => a[Math.floor(r() * a.length)];
const rint = (r, a, b) => a + Math.floor(r() * Math.max(0, b - a)); // [a, b)

function region(b, spec) {
  let [a, e] = spec.region || [0, b.length];
  a = Math.max(0, Math.min(b.length, a)); e = Math.max(a, Math.min(b.length, e < 0 ? b.length + e : e));
  return [a, e];
}
const cat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };

// 数のような語（ASCII）の位置を探す
function numberTokens(b, a, e) {
  const out = [];
  let i = a;
  const isNum = c => (c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46 || c === 101 || c === 69;
  while (i < e) {
    while (i < e && !isNum(b[i])) i++;
    const s = i; let dig = false;
    while (i < e && isNum(b[i])) { if (b[i] >= 48 && b[i] <= 57) dig = true; i++; }
    if (dig && i > s) out.push([s, i]);
  }
  return out;
}
function lineSpans(b) {
  const out = []; let s = 0;
  for (let i = 0; i < b.length; i++) if (b[i] === 10) { out.push([s, i + 1]); s = i + 1; }
  if (s < b.length) out.push([s, b.length]);
  return out;
}

export function mutate(b0, spec) {
  if (Array.isArray(spec)) { let b = b0; for (const s of spec) b = mutate(b, s); return b; }
  const r = rng(spec.seed || 1);
  let b = b0;
  switch (spec.op) {
    case 'trunc': return b.slice(0, Math.max(0, Math.min(b.length, spec.at < 0 ? b.length + spec.at : spec.at)));
    case 'flip': { b = b.slice(); const [a, e] = region(b, spec); if (e > a) for (let k = 0; k < (spec.n || 1); k++) { const i = rint(r, a, e); b[i] ^= 1 << rint(r, 0, 8); } return b; }
    case 'set': { b = b.slice(); const [a, e] = region(b, spec); if (e > a) for (let k = 0; k < (spec.n || 1); k++) b[rint(r, a, e)] = spec.v ?? pick(r, I8); return b; }
    case 'i32': {
      b = b.slice(); const [a, e] = region(b, spec); const dv = new DataView(b.buffer);
      if (e - a >= 4) for (let k = 0; k < (spec.n || 1); k++) { let i = rint(r, a, e - 3); if (spec.align) i -= i % 4; dv.setUint32(i, spec.v ?? pick(r, I32), spec.le ?? r() < 0.5); }
      return b;
    }
    case 'patch': { b = b.slice(); const p = spec.hex ? Uint8Array.from(spec.hex.match(/../g).map(h => parseInt(h, 16))) : te.encode(spec.str); b.set(p.subarray(0, Math.max(0, b.length - spec.at)), spec.at); return b; }
    case 'repeat': { const a = spec.a ?? 0, e = spec.b ?? b.length; const s = b.subarray(a, e); const reps = []; for (let k = 0; k < (spec.times || 2); k++) reps.push(s); return cat(b.subarray(0, e), ...reps, b.subarray(e)); }
    case 'insert': { const p = spec.hex ? Uint8Array.from(spec.hex.match(/../g).map(h => parseInt(h, 16))) : te.encode(spec.str ?? ''); const at = spec.at ?? rint(r, 0, b.length + 1); return cat(b.subarray(0, at), p, b.subarray(at)); }
    case 'delete': { const a = spec.a, e = spec.b; return cat(b.subarray(0, a), b.subarray(e)); }
    case 'replace': {
      const s = new TextDecoder('latin1').decode(b);
      const re = new RegExp(spec.find, spec.flags ?? '');
      const o = s.replace(re, spec.with);
      return Uint8Array.from(o, c => c.charCodeAt(0) & 255);
    }
    case 'token': {
      const [a, e] = region(b, spec); const toks = numberTokens(b, a, e);
      if (!toks.length) return b;
      const chosen = new Set(); for (let k = 0; k < (spec.n || 1); k++) chosen.add(rint(r, 0, toks.length));
      const parts = []; let last = 0;
      for (const ti of [...chosen].sort((x, y) => x - y)) { const [s, t] = toks[ti]; parts.push(b.subarray(last, s), te.encode(spec.v ?? pick(r, ISTR))); last = t; }
      parts.push(b.subarray(last)); return cat(...parts);
    }
    case 'line': {
      const L = lineSpans(b); if (!L.length) return b;
      const [a0, e0] = spec.lines || [0, L.length];
      const ls = L.map(([s, t]) => b.subarray(s, t));
      for (let k = 0; k < (spec.n || 1); k++) {
        const i = rint(r, Math.min(a0, ls.length - 1), Math.min(e0, ls.length)); const kind = spec.kind || pick(r, ['dup', 'del', 'swap', 'garbage', 'empty', 'cut']);
        if (kind === 'dup') ls.splice(i, 0, ls[i]);
        else if (kind === 'del') ls.splice(i, 1);
        else if (kind === 'swap' && i + 1 < ls.length) [ls[i], ls[i + 1]] = [ls[i + 1], ls[i]];
        else if (kind === 'garbage') ls.splice(i, 0, te.encode(pick(r, ['#\n', '\n', 'x y z\n', '1 2\n', 'nan nan nan\n', '\u0000\u0001\u0002\n', 'DATA ascii\n', 'end_header\n', '0\n', '-1 -1 -1\n']) ));
        else if (kind === 'empty') ls[i] = te.encode('\n');
        else if (kind === 'cut') ls[i] = ls[i].subarray(0, rint(r, 0, ls[i].length));
        if (!ls.length) break;
      }
      return cat(...ls);
    }
    case 'nl': {
      // 改行の変換: crlf / cr / mixed
      const out = [];
      for (let i = 0; i < b.length; i++) {
        if (b[i] === 10) {
          const m = spec.mode === 'mixed' ? pick(r, ['lf', 'crlf', 'cr']) : spec.mode;
          if (m === 'crlf') out.push(13, 10); else if (m === 'cr') out.push(13); else out.push(10);
        } else out.push(b[i]);
      }
      return Uint8Array.from(out);
    }
    case 'bom': return cat(Uint8Array.from([0xef, 0xbb, 0xbf]), b);
    case 'utf16': { const s = new TextDecoder('latin1').decode(b); const o = new Uint8Array(2 + 2 * s.length); o[0] = spec.be ? 0xfe : 0xff; o[1] = spec.be ? 0xff : 0xfe; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (spec.be) { o[2 + 2 * i] = c >> 8; o[3 + 2 * i] = c & 255; } else { o[2 + 2 * i] = c & 255; o[3 + 2 * i] = c >> 8; } } return o; }
    case 'havoc': {
      const ops = spec.ops || ['flip', 'set', 'i32', 'trunc', 'repeat', 'insert', 'delete', 'token', 'line'];
      const k = spec.k || (1 + rint(r, 0, 4));
      for (let j = 0; j < k; j++) {
        const op = pick(r, ops), seed = Math.floor(r() * 2 ** 31);
        const hr = spec.head ? [0, Math.min(b.length, spec.head)] : undefined;
        if (op === 'trunc') b = mutate(b, { op, at: rint(r, 0, b.length) });
        else if (op === 'repeat') { const a = rint(r, 0, b.length), e = Math.min(b.length, a + rint(r, 1, 64)); b = mutate(b, { op, a, b: e, times: rint(r, 1, 50) }); }
        else if (op === 'insert') b = mutate(b, { op, seed, at: rint(r, 0, hr ? hr[1] : b.length), hex: Array.from({ length: rint(r, 1, 16) }, () => pick(r, I8).toString(16).padStart(2, '0')).join('') });
        else if (op === 'delete') { const a = rint(r, 0, hr ? hr[1] : b.length), e = Math.min(b.length, a + rint(r, 1, 64)); b = mutate(b, { op, a, b: e }); }
        else b = mutate(b, { op, seed, n: 1 + rint(r, 0, 4), region: hr });
      }
      return b;
    }
  }
  throw new Error('unknown op ' + spec.op);
}
