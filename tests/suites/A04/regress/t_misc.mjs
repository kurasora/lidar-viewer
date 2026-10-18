// PTX・SBF・PN/PV/SOI/Bundler/SinusX/Salome・画像・PSZ の単体試験
import { test, isoTest, eq, ok, near, setFile } from './lib/harness.mjs';
import { read, tryRead, isJapanese, enc, cat } from './lib/read.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
setFile('t_misc');

test('OK-X01', 'PTX: 変換行列（行ベクトル × 行列、最後の行が平行移動）・0 0 0 の点を除く', async () => {
  const hdr = '2\n1\n0 0 0\n1 0 0\n0 1 0\n0 0 1\n0 1 0 0\n-1 0 0 0\n0 0 1 0\n10 20 30 1\n';
  const r = await read('m.ptx', hdr + '1 0 0 0.5\n0 0 0 0.5\n');
  eq([r.n, r.pt(0), r.fields.intensity[0]], [1, [10, 21, 30], 0.5]);
});
test('A04-035', 'PTX: 1 つ目のスキャンに色がなく 2 つ目にあるとき、2 つ目の色を捨てない', async () => {
  const hdr = '2\n1\n0 0 0\n1 0 0\n0 1 0\n0 0 1\n1 0 0 0\n0 1 0 0\n0 0 1 0\n0 0 0 1\n';
  const r = await read('mix.ptx', hdr + '1 1 1 0.5\n2 2 2 0.5\n' + hdr + '3 3 3 0.5 255 0 0\n4 4 4 0.5 255 0 0\n');
  eq([r.col(2), r.col(0)], [[255, 0, 0], [200, 200, 200]]);
});
test('A04-006', 'SBF: CloudCompare が書いたグローバルシフト付きの SBF（.sbf + .sbf.data）を元の座標で読む（シフトを 2 回足さない）', async () => {
  const D = join(here, 'fixtures');
  const ref = readFileSync(join(D, 'utm_ref.txt'), 'utf8').trim().split('\n').map(l => l.split(' ').map(Number));
  for (const [name, comp] of [['utm.sbf', 'utm.sbf.data'], ['utm.sbf.data', 'utm.sbf']]) {
    const r = await read(name, readFileSync(join(D, name)), { companions: { [comp]: readFileSync(join(D, comp)) } });
    let e = 0; for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(r.pt(i)[k] - ref[i][k]));
    ok(r.n === 2000 && e < 0.01, `${name}: 最大誤差 ${e.toFixed(1)} m、1 点目 ${JSON.stringify(r.pt(0))}（元 ${JSON.stringify(ref[0].slice(0, 3))}）`);
  }
});
test('OK-X02', 'CloudCompare BIN（グローバルシフト付き）を元の座標で読む（同じ点群を CloudCompare で BIN に書いたもの）', async () => {
  const D = join(here, 'fixtures');
  const ref = readFileSync(join(D, 'utm_ref.txt'), 'utf8').trim().split('\n').map(l => l.split(' ').map(Number));
  const r = await read('utm.bin', readFileSync(join(D, 'utm.bin')));
  let e = 0; for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(r.pt(i)[k] - ref[i][k]));
  ok(r.n === 2000 && e < 0.001, `最大誤差 ${e}`);
});
test('OK-X03', 'PN・PV: float32 の並び、大きさが 1 点の倍数でなければ日本語のエラー', async () => {
  const pv = new Float32Array([1, 2, 3, 9, 4, 5, 6, 8]);
  const r = await read('a.pv', new Uint8Array(pv.buffer)); eq([r.n, r.pt(1), r.fields.value[1]], [2, [4, 5, 6], 8]);
  const t = await tryRead('b.pn', new Uint8Array(30)); ok(!t.ok && isJapanese(t.error), t.error);
});
test('OK-X04', 'Bundler: カメラ 5 行を飛ばし、点（位置・色・見えた画像）を読む', async () => {
  const s = '# Bundle file v0.3\n1 2\n500 0 0\n1 0 0\n0 1 0\n0 0 1\n0 0 0\n1 2 3\n255 0 0\n1 0 0 0.1 0.1\n4 5 6\n0 255 0\n1 0 1 0.2 0.2\n';
  const r = await read('b.out', s); eq([r.n, r.pt(1), r.col(1)], [2, [4, 5, 6], [0, 255, 0]]);
});
test('OK-X05', 'Salome（.poly）: 空行で線が切れ、始点 = 終点なら閉じた線', async () => {
  const r = await read('a.poly', '0 0 0\n10 0 0\n10 10 0\n0 0 0\n\n20 0 0\n30 0 0\n');
  ok(r.n > 290000, `n=${r.n}`); ok(/線 2 本/.test(r.info.format), r.info.format);
});
// ---- 画像
test('A04-036', 'PBM P1: 画素の間に区切りがない書き方（0101）も読む', async () => {
  const r = await read('a.pbm', 'P1\n4 2\n0101\n1010\n');
  eq(Array.from(r.fields.luminance).map(v => (v > 128 ? 'w' : 'b')).join(''), 'wbwbbwbw');
});
test('A04-036', 'XPM: 3 桁の色（#F00）を正しく読む', async () => {
  const r = await read('c.xpm', '/* XPM */\nstatic char *x[] = {\n"2 1 2 1",\n"a c #F00",\n"b c #00F",\n"ab"\n};\n');
  eq([r.col(0), r.col(1)], [[255, 0, 0], [0, 0, 255]]);
});
test('A04-036', 'TGA: 色表つき（type 1）を色表の色で読む（読めないなら断る）', async () => {
  const tga = new Uint8Array(18 + 6 + 2); tga[1] = 1; tga[2] = 1; tga[5] = 2; tga[7] = 24; tga[12] = 2; tga[14] = 1; tga[16] = 8; tga[17] = 32;
  tga.set([0, 0, 255, 0, 255, 0], 18); tga.set([0, 1], 24);
  const t = await tryRead('p.tga', tga);
  ok(!t.ok || (t.r.col(0).join() === '255,0,0' && t.r.col(1).join() === '0,255,0'), t.ok ? `色 ${t.r.col(0)} / ${t.r.col(1)}（色表の番号を明るさにしている）` : '');
});
test('OK-X06', 'PNM: P2・P3・P5（16 bit）・P6、TGA 無圧縮 24 bit・RLE、WBMP', async () => {
  eq(Array.from((await read('a.pgm', 'P2\n2 1\n255\n0 255\n')).fields.luminance), [0, 255]);
  eq((await read('a.ppm', 'P3\n1 1\n255\n10 20 30\n')).col(0), [10, 20, 30]);
  const p5 = cat('P5\n1 1\n65535\n', new Uint8Array([0x80, 0x00])); near((await read('b.pgm', p5)).col(0), [128, 128, 128], 1);
  const p6 = cat('P6\n1 1\n255\n', new Uint8Array([1, 2, 3])); eq((await read('b.ppm', p6)).col(0), [1, 2, 3]);
  const tga = new Uint8Array(18 + 3); tga[2] = 2; tga[12] = 1; tga[14] = 1; tga[16] = 24; tga.set([30, 20, 10], 18); eq((await read('a.tga', tga)).col(0), [10, 20, 30]);
  const rle = new Uint8Array(18 + 4); rle[2] = 10; rle[12] = 3; rle[14] = 1; rle[16] = 24; rle.set([0x82, 3, 2, 1], 18); eq((await read('r.tga', rle)).n, 3);
  const wb = new Uint8Array([0, 0, 8, 1, 0b10100000]); eq(Array.from((await read('a.wbmp', wb)).fields.luminance).map(v => (v > 128 ? 1 : 0)), [1, 0, 1, 0, 0, 0, 0, 0]);
});
isoTest('A04-037', 'PSZ: 使わない 400 MB の中身（圧縮後 0.4 MB）を展開しない（メモリ 300 MB 以内）', 'iso/psz_bomb.mjs', { timeoutMs: 120000, memMB: 300 });
// ---- GeoTIFF の nodata（tifffile でファイルを作る。なければ飛ばす）
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
let TIFDIR = null;
function tifDir() {
  if (TIFDIR) return TIFDIR;
  const d = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'a04tif-'));
  execFileSync('python3', [join(here, 'gen_tif.py'), d], { stdio: 'pipe' });
  return (TIFDIR = d);
}
for (const [f, label] of [['nd_m9999.tif', '-9999'], ['nd18.tif', '"-3.4028234663852886e+38"（17 桁）'], ['nd9.tif', '"-3.40282347e+38"（9 桁。float32 で同じ値）']]) {
  test(f === 'nd9.tif' ? 'A04-043' : 'OK-X07', `GeoTIFF: nodata ${label} の画素を点にしない（80×50 の左半分が nodata → 2000 点）`, async () => {
    const r = await read(f, readFileSync(join(tifDir(), f)));
    let lo = Infinity; for (let i = 0; i < r.n; i++) lo = Math.min(lo, r.pt(i)[2]);
    ok(r.n === 2000 && lo > -1e30, `n=${r.n}、z の最小 ${lo}（${r.info.note}）`);
  });
}
// ---- CloudCompare BIN の古い形（v1）: 点群 2 個（1 個目: 色・名前・値の欄の名前・値の欄（−1 は隠した点）、2 個目: 法線だけ）
function binV1() {
  const parts = [];
  const u32 = v => { const x = Buffer.alloc(4); x.writeUInt32LE(v); return x; };
  parts.push(u32(2));
  parts.push(u32(3), Buffer.from([1 | 2 | 8 | 16 | 32]), Buffer.from('first\0'), Buffer.from('Dist\0'));
  for (let i = 0; i < 3; i++) { const x = Buffer.alloc(12 + 3 + 8); x.writeFloatLE(i, 0); x.writeFloatLE(2 * i, 4); x.writeFloatLE(-i, 8); x[12] = 10 * i; x[13] = 20; x[14] = 30; x.writeDoubleLE(i === 1 ? -1 : 0.5 * i, 15); parts.push(x); }
  parts.push(u32(2), Buffer.from([1 | 4]));
  for (let i = 0; i < 2; i++) { const x = Buffer.alloc(24); x.writeFloatLE(100 + i, 0); x.writeFloatLE(0, 4); x.writeFloatLE(1, 8); x.writeFloatLE(1, 20); parts.push(x); }
  return new Uint8Array(Buffer.concat(parts));
}
test('OK-X08', 'CloudCompare BIN v1（古い形）: 点群 2 個・色・値の欄（−1 は NaN）・色のない点群は灰色・大きさがぴったりでなければ断る', async () => {
  const r = await read('v1.bin', binV1());
  eq([r.n, r.pt(2), r.col(2), r.col(3)], [5, [2, 4, -2], [20, 20, 30], [200, 200, 200]]);
  const d = Array.from(r.fields.dist); ok(d[0] === 0 && Number.isNaN(d[1]) && d[2] === 1 && d[3] === 0, JSON.stringify(d));
  const t = await tryRead('bad.bin', binV1().subarray(0, 50)); ok(!t.ok && /CloudCompare の BIN ファイルではない/.test(t.error), t.error);
});
