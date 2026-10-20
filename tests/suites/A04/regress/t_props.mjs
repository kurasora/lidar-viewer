// 性質に基づく試験（fast-check。見つからなければ飛ばす）: 失敗したときは最小の反例に縮めて表示する
import { test, ok, src, setFile } from './lib/harness.mjs';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildE57, bitsOf } from './e57w.mjs';
import { read } from './lib/read.mjs';
setFile('t_props');
const here = dirname(fileURLToPath(import.meta.url));
const cand = [process.env.FAST_CHECK, join(here, '../tools/node_modules/fast-check/lib/fast-check.js'), join(src('node_modules'), 'fast-check/lib/fast-check.js')].filter(Boolean);
const fcPath = cand.find(p => existsSync(p));
const fc = fcPath ? (await import(pathToFileURL(fcPath).href)).default ?? (await import(pathToFileURL(fcPath).href)) : null;
const U = await import(src('src/io/util.js'));
const { Sink } = await import(src('src/io/sink.js'));
const P = await import(src('src/pcd.js'));
const { lzfCompress } = await import('./t_pcd.mjs');
const enc = new TextEncoder(), dec = new TextDecoder();
const check = async (prop, runs = 200) => { const r = await fc.check(prop, { numRuns: runs, seed: 20261017 }); ok(!r.failed, r.failed ? `反例 ${fc.stringify(r.counterexample)}（${r.numShrinks} 回縮めた）${r.errorInstance ? ' ' + String(r.errorInstance.message || r.errorInstance).slice(0, 200) : ''}` : ''); };
const T = (id, title, fn, o) => test(id, title, fc ? fn : () => { console.log('      （fast-check がないので飛ばした）'); }, o);

// 0.4.0 から: LF がなく CR がある（古い Mac 形式）ときは CR だけで区切る（A04-003）
T('OK-F01', '性質: eachLine はどんなチャンクの大きさでも、LF で区切って行末の CR を 1 つ落とした結果と同じ（LF がなく CR があれば CR で区切る）', () => check(fc.asyncProperty(
  fc.array(fc.constantFrom('a', 'b', '1', ' ', '\r', '\n', 'あ', ',', '\r\n'), { maxLength: 60 }).map(a => a.join('')), fc.integer({ min: 1, max: 9 }),
  async (s, ch) => {
    const sep = !s.includes('\n') && s.includes('\r') ? '\r' : '\n';
    const want = s.length ? s.split(sep) : []; if (want.length && want[want.length - 1] === '' && s.endsWith(sep)) want.pop();
    const exp = sep === '\r' ? want : want.map(l => (l.endsWith('\r') ? l.slice(0, -1) : l));
    const got = []; await U.eachLine(new U.Src(enc.encode(s)), 0, (b, a, e) => { got.push(dec.decode(b.subarray(a, e))); }, () => {}, ch);
    return JSON.stringify(got) === JSON.stringify(exp);
  }), 500));
T('OK-F02', '性質: parseToken は座標らしい数の文字列（toFixed/toPrecision/toExponential）で、Float32 に入れた値が Number() と同じ（1 ulp 以内）', () => check(fc.property(
  fc.double({ min: -1e7, max: 1e7, noNaN: true, noDefaultInfinity: true }), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 1, max: 15 }),
  (v, kind, d) => {
    const s = kind === 0 ? v.toFixed(Math.min(d, 12)) : kind === 1 ? v.toPrecision(d) : v.toExponential(d - 1);
    const b = enc.encode(s), a = U.parseToken(b, 0, b.length), e = Number(s);
    const fa = Math.fround(a), fe = Math.fround(e);
    return fa === fe || Math.abs(fa - fe) <= Math.abs(fe) * 2 ** -23;
  }), 3000));
T('OK-F03', '性質: LZF の圧縮→展開で元に戻る（任意のバイト列・繰り返しの多い列）', () => check(fc.property(
  fc.oneof(fc.uint8Array({ maxLength: 2000 }), fc.array(fc.constantFrom(0, 1, 2), { maxLength: 3000 }).map(a => Uint8Array.from(a))),
  a => { const d = P.lzfDecompress(lzfCompress(a), a.length); return d.length === a.length && d.every((x, i) => x === a[i]); }), 300));
T('OK-F04', '性質: Sink は任意の点の列（NaN・Inf を含む）と cap で n = min(cap, 正しい点の数)・total・skipped が合い、残る点は重複のない入力の点', () => check(fc.property(
  fc.array(fc.oneof(fc.constant(NaN), fc.constant(Infinity), fc.double({ min: -1e6, max: 1e6, noNaN: true })), { maxLength: 400 }), fc.integer({ min: 1, max: 50 }),
  (xs, cap) => {
    const s = new Sink({ cap }); const fi = s.field('i'); let valid = 0;
    xs.forEach((x, i) => { const k = s.slot(x, i, 0); if (Number.isFinite(x)) valid++; if (k >= 0) s.F[fi][k] = i; });
    const r = s.finish(); if (r.n !== Math.min(cap, valid) || r.total !== valid || r.skipped !== xs.length - valid) return false;
    const seen = new Set();
    for (let k = 0; k < r.n; k++) { const i = r.fields.i[k]; if (seen.has(i) || !Number.isFinite(xs[i])) return false; seen.add(i); if (Math.abs(r.positions[3 * k + 1] + r.offset[1] - i) > 1e-3) return false; }
    return true;
  }), 1000));
T('OK-F05', '性質: E57 の bitPack を任意の最小・最大（負を含む、幅 2^31 まで）・任意のパケットの大きさで読み戻せる', () => check(fc.asyncProperty(
  fc.integer({ min: -(2 ** 31), max: 2 ** 31 }), fc.integer({ min: 0, max: 2 ** 31 }), fc.integer({ min: 1, max: 40 }), fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 60 }),
  async (min, width, chunk, us) => {
    const max = min + width, vals = us.map(u => min + Math.floor(u * width));
    const fields = [{ name: 'cartesianX', type: 'Float' }, { name: 'cartesianY', type: 'Float' }, { name: 'cartesianZ', type: 'Float' }, { name: 'intensity', type: 'Integer', min, max }];
    const r = await read('p.e57', buildE57({ scans: [{ fields, records: vals.map((v, i) => [i, 0, 0, v]), chunk }] }));
    return r.n === vals.length && vals.every((v, i) => r.fields.intensity[i] === Math.fround(v));
  }), 200), { timeout: 120000 });
