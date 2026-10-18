// src/pcd.js（parseHeader・lzfDecompress）と src/io/formats/pcd.js の単体試験
import { test, eq, ok, near, src, setFile } from './lib/harness.mjs';
import { read, tryRead, isJapanese, enc, cat } from './lib/read.mjs';
setFile('t_pcd');
const P = await import(src('src/pcd.js'));

// liblzf と同じ書式の圧縮（試験用）
export function lzfCompress(inp) {
  const out = []; const lit = [];
  const flush = () => { while (lit.length) { const n = Math.min(32, lit.length); out.push(n - 1, ...lit.splice(0, n)); } };
  let i = 0;
  while (i < inp.length) {
    let best = 0, bo = 0;
    for (let o = 1; o <= Math.min(8192, i); o++) { let l = 0; while (l < 264 && i + l < inp.length && inp[i + l] === inp[i - o + l]) l++; if (l > best) { best = l; bo = o; } }
    if (best >= 3) { flush(); const len = best - 2, off = bo - 1; if (len < 7) out.push((len << 5) | (off >> 8), off & 255); else out.push((7 << 5) | (off >> 8), len - 7, off & 255); i += best; }
    else lit.push(inp[i++]);
  }
  flush();
  return new Uint8Array(out);
}
const pcdHead = (fields, data, extra = '') => `VERSION 0.7\nFIELDS ${fields.map(f => f[0]).join(' ')}\nSIZE ${fields.map(f => f[2]).join(' ')}\nTYPE ${fields.map(f => f[1]).join(' ')}\nCOUNT ${fields.map(f => f[3] || 1).join(' ')}\n${extra}DATA ${data}\n`;
const compressed = (fields, n, raw, usize = raw.length) => { const c = lzfCompress(raw); const hv = new Uint8Array(8); const dv = new DataView(hv.buffer); dv.setUint32(0, c.length, true); dv.setUint32(4, usize, true); return cat(pcdHead(fields, 'binary_compressed', `POINTS ${n}\n`), hv, c); };

test('OK-P01', 'lzfDecompress: 試験用の圧縮との往復 300 件（重なりのある複写を含む）', () => {
  let s = 7; const g = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(g() * 3000), a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = g() < 0.6 ? (i > 0 ? a[i - 1 - Math.floor(g() * Math.min(i, 40))] : 0) : Math.floor(g() * 256);
    eq(Array.from(P.lzfDecompress(lzfCompress(a), n)).join(), Array.from(a).join(), `件 ${t}`);
  }
});
test('OK-P02', 'lzfDecompress: 1 バイト前を長さ 10 で複写（重なり）', () => { eq(new TextDecoder().decode(P.lzfDecompress(new Uint8Array([0, 97, (7 << 5) | 0, 1, 0]), 11)), 'aaaaaaaaaaa'); });
test('OK-P03', 'lzfDecompress: 先頭より前を指す参照・長さの食い違い・入力の外のリテラルは日本語のエラー', async () => {
  for (const [inp, n] of [[[0, 97, (1 << 5) | 0, 5], 4], [[2, 97, 98, 99], 2], [[2, 97, 98, 99], 5], [[5, 97, 98], 6]]) {
    let err = null; try { P.lzfDecompress(new Uint8Array(inp), n); } catch (e) { err = e; }
    ok(err && isJapanese(err.message), `${JSON.stringify(inp)}→${n}: ${err && err.message}`);
  }
});
test('A04-022', 'lzfDecompress: 参照の 2 バイト目が欠けた（途中で切れた）入力はエラーにする（0 で埋めて成功にしない）', () => {
  let err = null, r = null; try { r = P.lzfDecompress(new Uint8Array([2, 97, 98, 99, (1 << 5) | 0]), 6); } catch (e) { err = e; }
  ok(err, `エラーにならず ${JSON.stringify(Array.from(r || []))} を返した`);
});
test('OK-P04', 'parseHeader: CRLF・小文字のキー・前後の空白・最後の DATA に改行なし', () => {
  const h = P.parseHeader(enc.encode('VERSION 0.7\r\nFIELDS x y z\r\nPOINTS 1\r\nDATA ascii\r\n1 2 3\r\n'));
  eq([h.FIELDS, h.POINTS, h.DATA, h.dataOffset], [['x', 'y', 'z'], ['1'], ['ascii'], 49]);
  eq(P.parseHeader(enc.encode('  fields x y z \n points 1\n data ascii\n')).FIELDS, ['x', 'y', 'z']);
  eq(P.parseHeader(enc.encode('FIELDS x y z\nPOINTS 1\nDATA binary')).dataOffset, 34);
});
test('OK-P05', 'PCD ascii / binary: COUNT 3 の欄（記述子）を挟んでも座標と欄がずれない', async () => {
  const fl = [['x', 'F', 4], ['desc', 'F', 4, 3], ['y', 'F', 4], ['z', 'F', 4], ['intensity', 'U', 2]];
  const ra = await read('a.pcd', pcdHead(fl, 'ascii', 'POINTS 2\n') + '1 9 9 9 2 3 7\n4 8 8 8 5 6 8\n');
  eq([ra.pt(0), ra.pt(1), Array.from(ra.fields.intensity)], [[1, 2, 3], [4, 5, 6], [7, 8]]);
  const rec = new ArrayBuffer(52), dv = new DataView(rec);
  [[1, 9, 9, 9, 2, 3, 7], [4, 8, 8, 8, 5, 6, 8]].forEach((v, i) => { for (let j = 0; j < 6; j++) dv.setFloat32(26 * i + 4 * j, v[j], true); dv.setUint16(26 * i + 24, v[6], true); });
  const rb = await read('b.pcd', cat(pcdHead(fl, 'binary', 'POINTS 2\n'), rec));
  eq([rb.pt(0), rb.pt(1), Array.from(rb.fields.intensity)], [[1, 2, 3], [4, 5, 6], [7, 8]]);
});
test('OK-P06', 'PCD binary_compressed: 項目ごとの並び（SoA）を正しく戻す・rgb', async () => {
  const fl = [['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4], ['rgb', 'U', 4], ['intensity', 'F', 4]];
  const n = 3, raw = new ArrayBuffer(n * 20), dv = new DataView(raw);
  for (let i = 0; i < n; i++) { dv.setFloat32(4 * i, i, true); dv.setFloat32(12 + 4 * i, 10 + i, true); dv.setFloat32(24 + 4 * i, 20 + i, true); dv.setUint32(36 + 4 * i, (i * 50) << 16 | (100 << 8) | 7, true); dv.setFloat32(48 + 4 * i, 0.5 * i, true); }
  const r = await read('c.pcd', compressed(fl, n, new Uint8Array(raw)));
  eq([r.pt(2), r.col(2), r.fields.intensity[2]], [[2, 12, 22], [100, 100, 7], 1]);
});
test('A04-011', 'PCD binary_compressed: 宣言された展開後の大きさ（usize）が POINTS×1 点の大きさと合わなければ、展開する前に断る', async () => {
  const fl = [['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4]];
  // POINTS 1（12 バイト）なのに 30 MB に展開されるファイル（0.4 MB）
  const N = 30e6, parts = [0, 0]; let left = N - 1;
  while (left > 0) { const l = Math.min(264, left); if (l < 3) { parts.push(l - 1, ...new Array(l).fill(0)); left -= l; break; } if (l < 9) parts.push(((l - 2) << 5) | 0, 0); else parts.push((7 << 5) | 0, l - 9, 0); left -= l; }
  const c = new Uint8Array(parts), hv = new Uint8Array(8), dv = new DataView(hv.buffer); dv.setUint32(0, c.length, true); dv.setUint32(4, N, true);
  const t0 = Date.now();
  const t = await tryRead('bomb.pcd', cat(pcdHead(fl, 'binary_compressed', 'POINTS 1\n'), hv, c));
  ok(!t.ok && Date.now() - t0 < 300, t.ok ? `断らずに 30 MB を展開した（${Date.now() - t0} ms）` : `断ったが ${Date.now() - t0} ms かかった（展開してから比べている）`);
}, { timeout: 120000 });
test('A04-023', 'PCD binary_compressed: 未対応の型（F2）は binary と同じ「未対応の型です」', async () => {
  const fl = [['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4], ['h', 'F', 2]];
  const t = await tryRead('f2c.pcd', compressed(fl, 1, new Uint8Array(14)));
  ok(!t.ok && /未対応の型/.test(t.error), t.ok ? 'エラーにならない' : t.error);
});
test('A04-024', 'PCD ascii: 値が欄より少ない行で、前の行の値を使わない（NaN か 0）', async () => {
  const r = await read('s.pcd', pcdHead([['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4], ['intensity', 'F', 4]], 'ascii', 'POINTS 3\n') + '1 1 1 10\n2 2 2\n3 3 3 30\n');
  ok(r.fields.intensity[1] !== 10, `2 行目の強度 = ${r.fields.intensity[1]}（前の行の値）`);
});
test('OK-P07', 'PCD: WIDTH×HEIGHT の組織化された点群・NaN の点は除いて数える', async () => {
  const r = await read('n.pcd', pcdHead([['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4]], 'ascii', 'WIDTH 2\nHEIGHT 2\n') + 'nan nan nan\n1 2 3\nnan 1 1\n4 5 6\n');
  eq([r.n, r.skipped, r.total], [2, 2, 2]);
});
test('OK-P08', 'PCD ascii: rgb を float で書いたもの（8 桁・9 桁）から色を戻す', async () => {
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer); u32[0] = (12 << 16) | (200 << 8) | 77;
  for (const d of [8, 9]) { const r = await read('rgbf.pcd', pcdHead([['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4], ['rgb', 'F', 4]], 'ascii', 'POINTS 1\n') + `1 2 3 ${f32[0].toPrecision(d)}\n`); eq(r.col(0), [12, 200, 77], `${d} 桁`); }
});
test('OK-P09', 'PCD binary: 途中で切れたファイルは点数入りの日本語のエラー', async () => {
  const h = pcdHead([['x', 'F', 4], ['y', 'F', 4], ['z', 'F', 4]], 'binary', 'POINTS 10\n');
  const t = await tryRead('t.pcd', cat(h, new Uint8Array(12 * 3 + 5)));
  ok(!t.ok && /途中で切れて/.test(t.error) && /3/.test(t.error), t.error);
});
