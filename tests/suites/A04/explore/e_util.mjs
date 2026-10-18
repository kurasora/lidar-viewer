import { join } from 'node:path';
const ROOT = process.env.PCDV_ROOT || '/home/claude/pcd-viewer';
const U = await import(join(ROOT, 'src/io/util.js'));
const enc = new TextEncoder();
const src = s => new U.Src(typeof s === 'string' ? enc.encode(s) : s);
async function lines(s, chunk) {
  const out = [];
  await U.eachLine(src(s), 0, (b, a, e) => { out.push(new TextDecoder().decode(b.subarray(a, e))); }, () => {}, chunk);
  return out;
}
const cases = {
  'LF': 'a\nb\nc\n',
  'CRLF': 'a\r\nb\r\nc\r\n',
  'no last LF': 'a\nb\nc',
  'CR only': 'a\rb\rc\r',
  'empty': '',
  'only LF': '\n',
  'BOM': '﻿1 2 3\n4 5 6\n',
  'multibyte': 'あいう\nえお\n',
  'last CR no LF': 'a\nb\r',
};
for (const [k, v] of Object.entries(cases)) {
  const ref = await lines(v, 1 << 24);
  const res = [];
  for (const ch of [1, 2, 3, 4, 5, 7]) {
    const r = await lines(v, ch);
    if (JSON.stringify(r) !== JSON.stringify(ref)) res.push(`chunk=${ch}: ${JSON.stringify(r)}`);
  }
  console.log(k.padEnd(14), JSON.stringify(ref), res.length ? 'DIFF ' + res.join(' ; ') : 'chunk 変えても同じ');
}
// 長い 1 行（チャンクより長い）: 時間
for (const n of [1e5, 4e5, 1.6e6]) {
  const s = '1 '.repeat(n) + '\n';
  const t0 = Date.now();
  let cnt = 0;
  await U.eachLine(src(s), 0, () => { cnt++; }, () => {}, 4096);
  console.log('long line', n * 2, 'bytes, chunk 4096:', Date.now() - t0, 'ms, lines', cnt);
}
// 途中で止める（false）ときの戻り値
{
  const s = 'aa\nbb\ncc\ndd\n';
  for (const ch of [1, 3, 5, 100]) {
    let k = 0;
    const pos = await U.eachLine(src(s), 0, () => (++k === 2 ? false : undefined), () => {}, ch);
    console.log('stop after 2 lines, chunk', ch, '→ 戻り値', pos, '（期待 6）');
  }
}
// parseToken と parseFloat の比較
const tok = s => { const b = enc.encode(s); return U.parseToken(b, 0, b.length); };
for (const s of ['1', '-1', '+1', '1.5', '.5', '5.', '1e3', '1E-3', '1e+3', '1e', '-', '+', '.', 'nan', 'NaN', '-nan', 'inf', '-inf', 'Infinity', 'id', 'intensity', 'i', 'nanx', '12abc', '0x10', '1.5.3', '1,5', '00012', '1e400', '-0', '123456789012345678901234', '0.1234567890123456789', '1e-320', '4.9e-324', '2.4e-39'])
  console.log(JSON.stringify(s).padEnd(28), 'parseToken', String(tok(s)).padEnd(24), 'Number()', Number(s));
// numbersIn
{
  const b = enc.encode('1,2;3\t4  5\r');
  const out = new Float64Array(8);
  const n = U.numbersIn(b, 0, b.length, out);
  console.log('numbersIn', n, Array.from(out.subarray(0, n)));
}
// parseXML
{
  const x = U.parseXML('<?xml version="1.0"?><!DOCTYPE e57Root><e57Root a="1" b=\'2\'><x>1&lt;2&amp;3&#65;&#x42;</x><y/><![CDATA[<raw>]]><!-- c --></e57Root>');
  const r = U.xmlChild(x, 'e57Root');
  console.log('xml', r.attrs, U.xmlChild(r, 'x').text, r.text, r.children.map(c => c.name));
  try { U.parseXML('<a>&#x110000;</a>'); console.log('xml bad charref: no error'); } catch (e) { console.log('xml bad charref:', e.name, e.message); }
  try { U.parseXML('<a b="x>y">t</a>'); const z = U.parseXML('<a b="x>y">t</a>'); console.log('xml > in attr:', JSON.stringify(z.children[0].attrs), JSON.stringify(z.children[0].text)); } catch (e) { console.log('xml > in attr err', e.message); }
  const deep = '<a>'.repeat(20000) + '</a>'.repeat(20000);
  try { const d = U.parseXML(deep); U.xmlFind(d, 'zz'); console.log('deep xml 20000: ok'); } catch (e) { console.log('deep xml 20000:', e.name, e.message); }
}
// rng
{
  const r = U.rng(1); let mn = 1, mx = 0;
  for (let i = 0; i < 1e6; i++) { const v = r(); if (v < mn) mn = v; if (v > mx) mx = v; }
  console.log('rng min', mn, 'max', mx);
  console.log('rng(0) === rng(1)?', U.rng(0)() === U.rng(1)());
}
console.log('extOf', U.extOf('a.PCD'), U.extOf('noext'), U.extOf('a.sbf.data'), U.extOf('.hidden'), U.extOf('dir.v1/file'));
