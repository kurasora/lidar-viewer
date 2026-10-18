import { join } from 'node:path';
import { read, tryRead, show, ROOT, enc } from './lib.mjs';
const P = await import(join(ROOT, 'src/pcd.js'));

// ---- LZF の参照実装（liblzf と同じ書式の圧縮）。正しい圧縮データを作って往復を確かめる
function lzfCompress(inp) {
  const out = []; let lit = [];
  const flush = () => { while (lit.length) { const n = Math.min(32, lit.length); out.push(n - 1, ...lit.splice(0, n)); } };
  let i = 0;
  while (i < inp.length) {
    let best = 0, bo = 0;
    for (let o = 1; o <= Math.min(8192, i); o++) { let l = 0; while (l < 264 && i + l < inp.length && inp[i + l] === inp[i - o + l]) l++; if (l > best) { best = l; bo = o; } }
    if (best >= 3) {
      flush();
      const len = best - 2, off = bo - 1;
      if (len < 7) out.push((len << 5) | (off >> 8), off & 255);
      else out.push((7 << 5) | (off >> 8), len - 7, off & 255);
      i += best;
    } else lit.push(inp[i++]);
  }
  flush();
  return new Uint8Array(out);
}
{
  const g = (() => { let s = 7; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; })();
  let bad = 0;
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(g() * 3000);
    const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = g() < 0.6 ? (i > 0 ? a[i - 1 - Math.floor(g() * Math.min(i, 40))] : 0) : Math.floor(g() * 256);
    const c = lzfCompress(a);
    const d = P.lzfDecompress(c, n);
    if (d.length !== n || d.some((v, i) => v !== a[i])) bad++;
  }
  show('LZF 往復（300 件、重なりのある複写を含む）不一致', bad);
}
// 重なりのある複写: 'a' のあと offset 1・長さ 10
show('重なり 1 バイト前を 10 回', Array.from(P.lzfDecompress(new Uint8Array([0, 97, (7 << 5) | 0, 1, 0]), 11)).map(c => String.fromCharCode(c)).join(''));
const err = f => { try { const r = f(); return 'エラーなし: ' + JSON.stringify(Array.from(r)); } catch (e) { return 'エラー: ' + e.message; } };
show('先頭より前を指す参照', err(() => P.lzfDecompress(new Uint8Array([0, 97, (1 << 5) | 0, 5]), 4)));
show('出力の長さが足りない', err(() => P.lzfDecompress(new Uint8Array([2, 97, 98, 99]), 2)));
show('出力の長さが余る', err(() => P.lzfDecompress(new Uint8Array([2, 97, 98, 99]), 5)));
show('リテラルが入力の外へ', err(() => P.lzfDecompress(new Uint8Array([5, 97, 98]), 6)));
// 参照の 2 バイト目（オフセットの下位）が欠けている → 途中で切れたデータ
show('参照の 2 バイト目が欠けた入力（出力 5）', err(() => P.lzfDecompress(new Uint8Array([2, 97, 98, 99, (1 << 5) | 0]), 6)));
show('長い参照の長さバイトが欠けた入力', err(() => P.lzfDecompress(new Uint8Array([2, 97, 98, 99, (7 << 5) | 0]), 12)));
show('空の入力・出力 0', err(() => P.lzfDecompress(new Uint8Array([]), 0)));

// ---- parseHeader
const H = s => { try { const h = P.parseHeader(enc.encode(s)); return JSON.stringify(h); } catch (e) { return 'エラー: ' + e.message; } };
show('CRLF の頭書き', H('VERSION 0.7\r\nFIELDS x y z\r\nSIZE 4 4 4\r\nTYPE F F F\r\nPOINTS 1\r\nDATA ascii\r\n1 2 3\r\n'));
show('CR だけの頭書き', H('VERSION 0.7\rFIELDS x y z\rPOINTS 1\rDATA ascii\r1 2 3\r'));
show('小文字のキー・前後の空白', H('  fields x y z \n points 1\n data ascii\n'));
show('DATA が最後で改行なし', H('FIELDS x y z\nPOINTS 1\nDATA binary'));
show('64KB を超える注釈', H('#'.repeat(70000) + '\nFIELDS x y z\nDATA ascii\n').slice(0, 80));

// ---- PCD の読み込み（細部）
const pcd = (fields, data, extra = '') => `VERSION 0.7\nFIELDS ${fields.map(f => f[0]).join(' ')}\nSIZE ${fields.map(f => f[2]).join(' ')}\nTYPE ${fields.map(f => f[1]).join(' ')}\nCOUNT ${fields.map(f => f[3] || 1).join(' ')}\n${extra}DATA ${data}\n`;
// ascii で値が足りない行（3 つ以上あるが欄より少ない）
{
  const r = await read('short.pcd', pcd([['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4], ['intensity', 'F', 4]], 'ascii', 'POINTS 3\n') + '1 1 1 10\n2 2 2\n3 3 3 30\n');
  show('ascii: 2 行目に intensity がない', [r.n, Array.from(r.fields.intensity)]);
}
// COUNT > 1 の欄（記述子）を挟む ascii / binary
{
  const fl = [['x', 'F', 4], ['desc', 'F', 4, 3], ['y', 'F', 4], ['z', 'F', 4], ['intensity', 'U', 2]];
  const ra = await read('cnt.pcd', pcd(fl, 'ascii', 'POINTS 2\n') + '1 9 9 9 2 3 7\n4 8 8 8 5 6 8\n');
  show('ascii COUNT 3 の欄を挟む', [ra.pt(0), ra.pt(1), Array.from(ra.fields.intensity), Array.from(ra.fields.desc)]);
  const h = pcd(fl, 'binary', 'POINTS 2\n');
  const rec = new ArrayBuffer(2 * 26), dv = new DataView(rec);
  [[1, 9, 9, 9, 2, 3, 7], [4, 8, 8, 8, 5, 6, 8]].forEach((v, i) => { const o = 26 * i; for (let j = 0; j < 6; j++) dv.setFloat32(o + 4 * j, v[j], true); dv.setUint16(o + 24, v[6], true); });
  const b = new Uint8Array(h.length + rec.byteLength); b.set(enc.encode(h)); b.set(new Uint8Array(rec), h.length);
  const rb = await read('cnt.pcd', b);
  show('binary COUNT 3 の欄を挟む', [rb.pt(0), rb.pt(1), Array.from(rb.fields.intensity), Array.from(rb.fields.desc)]);
}
// binary_compressed: 対応していない型（F2）
{
  const fl = [['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4], ['h', 'F', 2]];
  const h = pcd(fl, 'binary_compressed', 'POINTS 1\n');
  const raw = new Uint8Array(14); const dv = new DataView(raw.buffer); dv.setFloat32(0, 1, true); dv.setFloat32(4, 2, true); dv.setFloat32(8, 3, true);
  const c = lzfCompress(raw);
  const b = new Uint8Array(h.length + 8 + c.length); b.set(enc.encode(h)); const hv = new DataView(b.buffer, h.length); hv.setUint32(0, c.length, true); hv.setUint32(4, raw.length, true); b.set(c, h.length + 8);
  const t = await tryRead('f2c.pcd', b);
  show('binary_compressed に F2 の欄', t.ok ? 'エラーなし' : t.error);
  // 同じものを binary で
  const hb = pcd(fl, 'binary', 'POINTS 1\n'); const bb = new Uint8Array(hb.length + 14); bb.set(enc.encode(hb)); bb.set(raw, hb.length);
  const t2 = await tryRead('f2.pcd', bb);
  show('binary に F2 の欄', t2.ok ? 'エラーなし' : t2.error);
}
// binary_compressed: 宣言された展開後の大きさ（usize）がとても大きい（中身は 1 点）
{
  const fl = [['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4]];
  const h = pcd(fl, 'binary_compressed', 'POINTS 1\n');
  const raw = new Uint8Array(12);
  const c = lzfCompress(raw);
  const b = new Uint8Array(h.length + 8 + c.length); b.set(enc.encode(h)); const hv = new DataView(b.buffer, h.length); hv.setUint32(0, c.length, true); hv.setUint32(4, 0xffffffff, true); b.set(c, h.length + 8);
  const t0 = Date.now();
  const t = await tryRead('bomb.pcd', b);
  show('usize = 4 GB と宣言（実際 12 バイト）', (t.ok ? 'エラーなし' : t.error) + `（${Date.now() - t0} ms、RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB）`);
}
// binary_compressed: 本当に大きく展開される小さなファイル（解凍爆弾）。POINTS は 1 なのに 300 MB に展開
{
  const fl = [['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4]];
  const h = pcd(fl, 'binary_compressed', 'POINTS 1\n');
  const N = 300e6; // 展開後のバイト数
  const parts = [0, 0]; // リテラル 1 バイト（0）
  let left = N - 1;
  while (left > 0) { const l = Math.min(264, left); if (l < 3) { parts.push(l - 1, ...new Array(l).fill(0)); left -= l; break; } parts.push((7 << 5) | 0, l - 9, 0); left -= l; }
  const c = new Uint8Array(parts);
  const b = new Uint8Array(h.length + 8 + c.length); b.set(enc.encode(h)); const hv = new DataView(b.buffer, h.length); hv.setUint32(0, c.length, true); hv.setUint32(4, N, true); b.set(c, h.length + 8);
  const t0 = Date.now();
  const t = await tryRead('bomb2.pcd', b);
  show(`ファイル ${(b.length / 1e6).toFixed(1)} MB・POINTS 1・展開 300 MB`, (t.ok ? `エラーなし n=${t.r.n}` : t.error) + `（${Date.now() - t0} ms、RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB）`);
}
// NaN の点（組織化された点群）
{
  const r = await read('nan.pcd', pcd([['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4]], 'ascii', 'WIDTH 2\nHEIGHT 2\n') + 'nan nan nan\n1 2 3\nnan 1 1\n4 5 6\n');
  show('WIDTH×HEIGHT・NaN を含む', [r.n, r.skipped, r.total]);
}
// rgb を float で ascii に書いたもの（PCL は 4.2108e+06 のように書くことがある）
{
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  u32[0] = (12 << 16) | (200 << 8) | 77; // (12,200,77)
  const r = await read('rgbf.pcd', pcd([['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4], ['rgb', 'F', 4]], 'ascii', 'POINTS 1\n') + `1 2 3 ${f32[0].toPrecision(9)}\n`);
  show('ascii の rgb float（9 桁）', [r.col(0), f32[0].toPrecision(9)]);
  const r8 = await read('rgbf8.pcd', pcd([['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4], ['rgb', 'F', 4]], 'ascii', 'POINTS 1\n') + `1 2 3 ${f32[0].toPrecision(8)}\n`);
  show('ascii の rgb float（8 桁）', [r8.col(0), f32[0].toPrecision(8)]);
}
