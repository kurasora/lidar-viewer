// src/io/util.js の単体試験
import { test, eq, ok, near, src, setFile } from './lib/harness.mjs';
setFile('t_util');
const U = await import(src('src/io/util.js'));
const enc = new TextEncoder();
const S = s => new U.Src(typeof s === 'string' ? enc.encode(s) : s);
async function lines(s, chunk) {
  const out = [];
  await U.eachLine(S(s), 0, (b, a, e) => { out.push(new TextDecoder().decode(b.subarray(a, e))); }, () => {}, chunk);
  return out;
}
const CASES = { LF: ['a\nb\nc\n', ['a', 'b', 'c']], CRLF: ['a\r\nb\r\nc\r\n', ['a', 'b', 'c']], 'last no LF': ['a\nb\nc', ['a', 'b', 'c']], empty: ['', []], 'only LF': ['\n', ['']], multibyte: ['あいう\nえお\n', ['あいう', 'えお']], 'last CR': ['a\nb\r', ['a', 'b']] };
for (const [k, [s, want]] of Object.entries(CASES)) {
  test('OK-U01', `eachLine: ${k} をチャンク 1〜7・16MB のどれでも同じに切る`, async () => {
    for (const ch of [1, 2, 3, 4, 5, 7, 1 << 24]) eq(await lines(s, ch), want, `chunk=${ch}`);
  });
}
test('OK-U02', 'eachLine: CRLF の CR と LF がチャンクの境目で分かれても CR を落とす', async () => {
  const s = 'ab\r\ncd\r\n';
  for (let ch = 1; ch <= s.length; ch++) eq(await lines(s, ch), ['ab', 'cd'], `chunk=${ch}`);
});
test('OK-U03', 'eachLine: UTF-8 の多バイト文字がチャンクの境目で割れても行は正しい', async () => {
  const s = '点群,あ\n座標,い\n';
  for (let ch = 1; ch <= 9; ch++) eq(await lines(s, ch), ['点群,あ', '座標,い'], `chunk=${ch}`);
});
test('OK-U04', 'eachLine: 途中で false を返したときの戻り値 = 次の行の先頭のバイト位置', async () => {
  for (const ch of [1, 3, 5, 100]) { let k = 0; const pos = await U.eachLine(S('aa\nbb\ncc\n'), 0, () => (++k === 2 ? false : undefined), () => {}, ch); eq(pos, 6, `chunk=${ch}`); }
});
test('OK-U05', 'eachLine: 開始位置（start）から読む', async () => {
  const out = []; await U.eachLine(S('skip\nx\ny\n'), 5, (b, a, e) => { out.push(new TextDecoder().decode(b.subarray(a, e))); }, () => {}, 2);
  eq(out, ['x', 'y']);
});
test('A04-003', 'eachLine: CR だけの改行（古い Mac 形式）も行に分ける', async () => {
  eq(await lines('1 2 3\r4 5 6\r', 1 << 24), ['1 2 3', '4 5 6']);
});
test('A04-019', 'eachLine: チャンクより長い 1 行の処理時間が長さに比例する（3.2 MB の 1 行・チャンク 4 KB で 1 秒以内）', async () => {
  const s = '1 '.repeat(1.6e6) + '\n';
  const t0 = Date.now(); let n = 0;
  await U.eachLine(S(s), 0, () => { n++; }, () => {}, 4096);
  eq(n, 1); ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms かかった（チャンクごとに先頭から作り直している）`);
}, { timeout: 120000 });

// ---- parseToken
const tok = s => { const b = enc.encode(s); return U.parseToken(b, 0, b.length); };
test('OK-U10', 'parseToken: 通常の数（符号・小数点・指数）', () => {
  for (const [s, v] of [['1', 1], ['-1', -1], ['+1', 1], ['1.5', 1.5], ['.5', 0.5], ['5.', 5], ['1e3', 1000], ['1E-3', 0.001], ['1e+3', 1000], ['00012', 12], ['-12.25e1', -122.5]]) eq(tok(s), v, s);
});
test('OK-U11', 'parseToken: 数でないもの・nan・inf', () => {
  for (const s of ['-', '+', '.', 'nan', 'NaN', '-nan', 'nanx', '12abc', '0x10', '1.5.3', '1,5', '']) ok(Number.isNaN(tok(s)), `${s} → ${tok(s)}`);
  eq(tok('inf'), Infinity); eq(tok('-inf'), -Infinity); eq(tok('Infinity'), Infinity);
});
test('A04-020', 'parseToken: "i" で始まる inf 以外の語（id・intensity）は NaN', () => {
  for (const s of ['id', 'intensity', 'i', 'index']) ok(Number.isNaN(tok(s)), `${s} → ${tok(s)}`);
});
test('OK-U12', 'parseToken と Number() を Float32 に入れた値が同じ（座標らしい数 20 万個。点は Float32 で持つので、それより細かい差は問わない）', () => {
  let s = 99, worst = 0, at = '';
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 200000; i++) {
    const v = (r() - 0.5) * Math.pow(10, Math.floor(r() * 14) - 4);
    const strs = [v.toFixed(Math.floor(r() * 10)), v.toPrecision(1 + Math.floor(r() * 17)), v.toExponential(Math.floor(r() * 12))];
    for (const t of strs) {
      const a = Math.fround(tok(t)), b = Math.fround(Number(t));
      if (a === b) continue;
      const ulp = Math.abs(b) * 2 ** -23 || 2 ** -149;
      const d = Math.abs(a - b) / ulp;
      if (d > worst) { worst = d; at = t; }
    }
  }
  ok(worst <= 1, `Float32 で最大 ${worst.toFixed(1)} ulp（${at}）`);
});
test('OK-U13', 'numbersIn: 空白・タブ・カンマ・セミコロン・CR で区切り、語の数を返す（入れ物より多い語は数だけ）', () => {
  const b = enc.encode('1,2;3\t4  5\r'); const out = new Float64Array(3);
  eq(U.numbersIn(b, 0, b.length, out), 5); eq(Array.from(out), [1, 2, 3]);
});
// ---- parseXML
test('OK-U20', 'parseXML: 属性（" と \'）・文字参照・CDATA・注釈・宣言・空要素', () => {
  const x = U.parseXML('<?xml version="1.0"?><!DOCTYPE e57Root><e57Root a="1" b=\'2\'><x>1&lt;2&amp;3&#65;&#x42;</x><y/><![CDATA[<raw>]]><!-- c --></e57Root>');
  const r = U.xmlChild(x, 'e57Root');
  eq(r.attrs, { a: '1', b: '2' }); eq(U.xmlChild(r, 'x').text, '1<2&3AB'); eq(r.text, '<raw>'); eq(r.children.map(c => c.name), ['x', 'y']);
});
test('OK-U21', 'parseXML: 名前空間の接頭辞を外して探す（xmlChild・xmlFind）', () => {
  const x = U.parseXML('<e57:root><e57:a><e57:b>1</e57:b></e57:a></e57:root>');
  eq(U.xmlFind(x, 'b').length, 1); eq(U.xmlChild(U.xmlChild(x, 'root'), 'a').name, 'e57:a');
});
test('A04-021', 'parseXML: 範囲外の文字参照（&#x110000;）で英語の RangeError を出さない', () => {
  try { U.parseXML('<a>&#x110000;</a>'); } catch (e) { throw new Error(`${e.name}: ${e.message}`); }
});
test('A04-021', 'parseXML/xmlFind: 深い入れ子（2 万段）で「Maximum call stack size exceeded」にならない', () => {
  const deep = '<a>'.repeat(20000) + '</a>'.repeat(20000);
  U.xmlFind(U.parseXML(deep), 'zz');
});
test('OK-U22', 'rng: (0,1) の範囲・種 0 は 1 と同じ', () => {
  const r = U.rng(1); let mn = 1, mx = 0;
  for (let i = 0; i < 1e6; i++) { const v = r(); mn = Math.min(mn, v); mx = Math.max(mx, v); }
  ok(mn > 0 && mx < 1); eq(U.rng(0)(), U.rng(1)());
});
test('OK-U23', 'extOf / baseName', () => {
  eq([U.extOf('a.PCD'), U.extOf('noext'), U.extOf('a.sbf.data'), U.extOf('.hidden')], ['pcd', '', 'data', 'hidden']);
  eq([U.baseName('C:\\x\\y.las'), U.baseName('/a/b.ply'), U.baseName('c.e57')], ['y.las', 'b.ply', 'c.e57']);
});
test('OK-U24', 'Src: Uint8Array・ArrayBuffer・Blob を受け、範囲外の read は短く返す', async () => {
  const s1 = new U.Src(new Uint8Array([1, 2, 3])), s2 = new U.Src(new Uint8Array([1, 2, 3]).buffer), s3 = new U.Src(new Blob([new Uint8Array([1, 2, 3])]), 'n');
  for (const s of [s1, s2, s3]) { eq(s.size, 3); eq(Array.from(await s.read(1, 10)), [2, 3]); eq((await s.read(5, 2)).length, 0); }
  eq(s3.name, 'n');
});
