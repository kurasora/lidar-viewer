// 文字の点群（ascii.js）と PLY（ply.js）の単体試験
import { test, isoTest, eq, ok, near, setFile } from './lib/harness.mjs';
import { read, tryRead, isJapanese, enc, cat } from './lib/read.mjs';
setFile('t_ascii_ply');

// ---- PLY
const plyHead = (fmt, n, props, extra = '') => `ply\nformat ${fmt} 1.0\n${extra}element vertex ${n}\n${props.map(([t, nm]) => `property ${t} ${nm}\n`).join('')}end_header\n`;
test('OK-Y01', 'PLY ascii / binary LE / binary BE: 座標・uchar の色・scalar_ の値', async () => {
  const props = [['float', 'x'], ['float', 'y'], ['float', 'z'], ['uchar', 'red'], ['uchar', 'green'], ['uchar', 'blue'], ['float', 'scalar_Intensity']];
  const ra = await read('a.ply', plyHead('ascii', 2, props) + '1 2 3 255 0 10 7.5\n4 5 6 0 255 20 8.5\n');
  eq([ra.pt(1), ra.col(1), ra.fields.intensity[1]], [[4, 5, 6], [0, 255, 20], 8.5]);
  for (const le of [true, false]) {
    const b = new ArrayBuffer(2 * 19), dv = new DataView(b);
    [[1, 2, 3, 255, 0, 10, 7.5], [4, 5, 6, 0, 255, 20, 8.5]].forEach((v, i) => { const o = 19 * i; dv.setFloat32(o, v[0], le); dv.setFloat32(o + 4, v[1], le); dv.setFloat32(o + 8, v[2], le); dv.setUint8(o + 12, v[3]); dv.setUint8(o + 13, v[4]); dv.setUint8(o + 14, v[5]); dv.setFloat32(o + 15, v[6], le); });
    const r = await read('b.ply', cat(plyHead(le ? 'binary_little_endian' : 'binary_big_endian', 2, props), b));
    eq([r.pt(1), r.col(1), r.fields.intensity[1]], [[4, 5, 6], [0, 255, 20], 8.5], le ? 'LE' : 'BE');
  }
});
test('A04-002', 'PLY: float / double の色（0〜1）を 0〜255 に直す（ascii）', async () => {
  for (const t of ['float', 'double']) {
    const r = await read('f.ply', plyHead('ascii', 3, [['float', 'x'], ['float', 'y'], ['float', 'z'], [t, 'red'], [t, 'green'], [t, 'blue']]) + '0 0 0 1 0 0\n1 0 0 0 1 0\n2 0 0 0.5 0.5 0.5\n');
    eq([r.col(0), r.col(1), r.col(2)], [[255, 0, 0], [0, 255, 0], [128, 128, 128]], t);
  }
});
test('A04-002', 'PLY: float の色（binary）', async () => {
  const body = new Float32Array([0, 0, 0, 1, 0.5, 0.25, 1, 1, 1, 0.2, 0.4, 0.6]);
  const r = await read('fb.ply', cat(plyHead('binary_little_endian', 2, [['float', 'x'], ['float', 'y'], ['float', 'z'], ['float', 'red'], ['float', 'green'], ['float', 'blue']]), body));
  eq([r.col(0), r.col(1)], [[255, 128, 64], [51, 102, 153]]);
});
test('OK-Y02', 'PLY: 面（face）があれば面の上に点を散らす（100 万点）・使わない要素（edge）を飛ばす', async () => {
  const h = 'ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement edge 2\nproperty int vertex1\nproperty int vertex2\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n';
  const v = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), e = new Int32Array([0, 1, 1, 2]), f = new Uint8Array(13); f[0] = 3; new DataView(f.buffer).setInt32(1, 0, true); new DataView(f.buffer).setInt32(5, 1, true); new DataView(f.buffer).setInt32(9, 2, true);
  const r = await read('m.ply', cat(h, v, e, f));
  eq(r.n, 1000000); ok(/面 1 枚/.test(r.info.format), r.info.format);
});
test('A04-027', 'PLY: tristrips（三角形の帯）を扇ではなく帯として面にする', async () => {
  // 4 頂点の帯 0-1-2-3 は三角形 (0,1,2) と (1,2,3)。扇として読むと (0,1,2),(0,2,3) になり、面の形が違う
  const h = 'ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement tristrips 1\nproperty list int int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n10 10 0\n4 0 1 2 3\n';
  const r = await read('ts.ply', h);
  // 帯の 2 枚目 (1,2,3) の内側の点 (3.5, 3.5) 付近に点があるはず。扇の (0,2,3) は x<=10・y>=x の側
  let inStrip2 = 0; for (let i = 4; i < r.n; i++) { const p = r.pt(i); if (p[0] > p[1] + 0.5) inStrip2++; }
  ok(inStrip2 > 100000, `三角形 (1,2,3) の右下側の点 ${inStrip2}`);
});
test('A04-026', 'PLY: 途中で切れた binary は日本語のエラー（英語の RangeError にしない）', async () => {
  const t = await tryRead('t.ply', cat(plyHead('binary_little_endian', 10, [['float', 'x'], ['float', 'y'], ['float', 'z']]), new Uint8Array(30)));
  ok(!t.ok, 'エラーにならない'); ok(isJapanese(t.error), `${t.name}: ${t.error}`);
});
// ---- 文字の点群
const rows = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
test('OK-A01', '文字: 見出し（//X Y Z R G B Intensity）・CloudCompare の書き出しと同じ 7 列', async () => {
  const r = await read('c.asc', '//X Y Z R G B Intensity\n' + rows(5, i => `${i} ${-i} 0.5 ${i * 10} 20 30 ${i * 1.5}\n`));
  eq([r.n, r.pt(4), r.col(4), r.fields.intensity[4]], [5, [4, -4, 0.5], [40, 20, 30], 6]);
});
test('A04-001', '文字: 見出し付きの 9 列の CSV（X,Y,Z,R,G,B,Nx,Ny,Nz）を点群として読む（高さの表にしない）', async () => {
  const r = await read('cloud9.csv', '//X,Y,Z,R,G,B,Nx,Ny,Nz\n' + rows(50, i => `${(i * 0.37).toFixed(3)},${(i * 0.11).toFixed(3)},${(1 + i * 0.01).toFixed(3)},${i % 256},${(i * 3) % 256},${(i * 7) % 256},0,0,1\n`));
  eq([r.n, r.pt(1), r.col(1)], [50, [0.37, 0.11, 1.01].map(Math.fround), [1, 3, 7]], r.info.format);
});
test('A04-001', '文字: 見出し x,y,z,intensity,r,g,b,label の 8 列の CSV を点群として読む', async () => {
  const r = await read('scan.csv', 'x,y,z,intensity,r,g,b,label\n' + rows(50, i => `${i * 0.5},${i * 0.25},1.5,${(i * 13) % 1000},10,20,30,${i % 3}\n`));
  ok(r.n === 50 && !/高さの表/.test(r.info.format), `${r.info.format}・${r.n} 点`);
  eq([r.pt(2), r.col(2), r.fields.intensity[2], r.fields.label[2]], [[1, 0.5, 1.5], [10, 20, 30], 26, 2], r.info.format);
});
test('OK-A02', '文字: CSV の高さの表（名前に matrix・数値だけの格子）は 1 マス = 1 点', async () => {
  const r = await read('dem_matrix.csv', '1,2,3\n4,5,6\n');
  eq([r.n, r.pt(5)], [6, [2, -1, 6]]);
});
isoTest('A04-003', '文字: CR だけの改行（2000 点）を 2000 点として読み、メモリを使いすぎない（300 MB 以内）', 'iso/cr_only.mjs', { timeoutMs: 20000, memMB: 300 });
test('A04-005', '文字: BOM 付き（見出しなし）でも先頭の点を落とさない', async () => {
  const r = await read('bom.xyz', '﻿1 2 3\n4 5 6\n7 8 9\n');
  eq([r.n, r.skipped, r.pt(0)], [3, 0, [1, 2, 3]]);
});
test('A04-005', '文字: 1 行目のデータに nan があっても見出しとして黙って捨てない（除外として数える）', async () => {
  const r = await read('nan1.xyz', '1 2 nan\n4 5 6\n7 8 9\n');
  eq([r.n, r.n + r.skipped], [2, 3]);
});
test('OK-A03', '文字: .pts（1 行目が点数）・x y z i の 4 列目は intensity', async () => {
  const r = await read('a.pts', '3\n' + rows(3, i => `${i} 0 0 ${i * 100}\n`));
  eq([r.n, Array.from(r.fields.intensity)], [3, [0, 100, 200]]);
});
test('OK-A04', '文字: 途中の注釈行（// と #）・空行・3 列未満の行は飛ばす', async () => {
  const r = await read('b.xyz', '1 2 3\n// c\n# d\n\n5 6\n7 8 9\n');
  eq([r.n, r.pt(1)], [2, [7, 8, 9]]);
});
test('OK-A05', '文字: 列の数が行で違うとき、足りない値の欄は NaN', async () => {
  const r = await read('c.txt', 'x y z p q\n1 2 3 4 5\n6 7 8\n');
  ok(r.fields.p && r.fields.q && Number.isNaN(r.fields.p[1]) && Number.isNaN(r.fields.q[1]), JSON.stringify(Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, Array.from(v)]))));
});
test('OK-A06', '文字: 見出しの名前で列を決める（Easting Northing Elevation・lat lon alt）', async () => {
  const r = await read('d.txt', 'Northing Easting Elevation\n10 20 30\n');
  eq(r.pt(0), [20, 10, 30]);
  const r2 = await read('e.txt', 'id lat lon alt\n1 35 139 40\n');
  eq(r2.pt(0), [139, 35, 40]);
});
