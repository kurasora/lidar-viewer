import { read, tryRead, show } from './lib.mjs';

// ---- PLY: float の色（0〜1）
{
  const head = c => `ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty ${c} red\nproperty ${c} green\nproperty ${c} blue\nend_header\n`;
  const r1 = await read('f.ply', head('float') + '0 0 0 1 0 0\n1 0 0 0 1 0\n2 0 0 0.5 0.5 0.5\n');
  show('PLY float 色 (1,0,0),(0,1,0),(.5,.5,.5)', [r1.col(0), r1.col(1), r1.col(2)]);
  const r2 = await read('d.ply', head('double') + '0 0 0 1 0 0\n1 0 0 0 1 0\n2 0 0 0.5 0.5 0.5\n');
  show('PLY double 色', [r2.col(0), r2.col(1), r2.col(2)]);
  const r3 = await read('u.ply', head('uchar') + '0 0 0 255 0 0\n1 0 0 0 255 0\n2 0 0 128 128 128\n');
  show('PLY uchar 色（基準）', [r3.col(0), r3.col(1), r3.col(2)]);
  // バイナリの float 色
  const hb = `ply\nformat binary_little_endian 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nproperty float red\nproperty float green\nproperty float blue\nend_header\n`;
  const body = new Float32Array([0, 0, 0, 1, 0.5, 0.25, 1, 1, 1, 0.2, 0.4, 0.6]);
  const buf = new Uint8Array(hb.length + body.byteLength); buf.set(new TextEncoder().encode(hb)); buf.set(new Uint8Array(body.buffer), hb.length);
  const r4 = await read('fb.ply', buf);
  show('PLY binary float 色 (1,.5,.25),(.2,.4,.6)', [r4.col(0), r4.col(1)]);
}

// ---- ASCII: CSV で 8 列以上（x,y,z,r,g,b,nx,ny,nz）
{
  let s = '//X,Y,Z,R,G,B,Nx,Ny,Nz\n';
  for (let i = 0; i < 50; i++) s += `${(i * 0.37).toFixed(3)},${(i * 0.11).toFixed(3)},${(1 + i * 0.01).toFixed(3)},${i % 256},${(i * 3) % 256},${(i * 7) % 256},0,0,1\n`;
  const r = await read('cloud9.csv', s);
  show('CSV 9 列（見出しあり）: 形式', r.info.format);
  show('  点数・先頭の点', [r.n, r.pt(0), r.pt(1)]);
  const r2 = await read('cloud9.txt', s);
  show('同じ中身を .txt で: 形式', r2.info.format);
  show('  点数・先頭の点', [r2.n, r2.pt(0), r2.pt(1)]);
  let s8 = 'x,y,z,intensity,r,g,b,label\n';
  for (let i = 0; i < 50; i++) s8 += `${i * 0.5},${i * 0.25},1.5,${(i * 13) % 1000},10,20,30,${i % 3}\n`;
  const r3 = await read('scan.csv', s8);
  show('CSV 8 列（x,y,z,intensity,r,g,b,label）', [r3.info.format, r3.n, r3.pt(1)]);
}
// ---- ASCII: x y z i r g b（i が 0〜255 の整数）
{
  let s = '';
  for (let i = 0; i < 100; i++) s += `${i * 0.1} ${i * 0.2} 1.0 ${(i * 37) % 256} 200 100 50\n`;
  const r = await read('pts7.txt', s);
  show('x y z i(0..255) r g b: 形式', r.info.format);
  show('  先頭の点の色・値', [r.col(1), Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, v[1]]))]);
  const rp = await read('pts7.pts', '100\n' + s);
  show('同じ中身を .pts（1 行目に点数）: 形式', rp.info.format);
  show('  先頭の点の色・値', [rp.col(1), Object.fromEntries(Object.entries(rp.fields).map(([k, v]) => [k, v[1]]))]);
}
// ---- ASCII: BOM 付き・見出しなし
{
  const r = await read('bom.xyz', '﻿1 2 3\n4 5 6\n7 8 9\n');
  show('BOM 付き xyz（3 点）: n / skipped', [r.n, r.skipped, r.pt(0)]);
}
// ---- ASCII: CR だけの改行
{
  let s = '';
  for (let i = 0; i < 2000; i++) s += `${i * 0.1} ${i * 0.2} ${i * 0.3}\r`;
  const t = await tryRead('cr.xyz', s);
  if (t.ok) show('CR だけの改行（2000 点）', [t.r.n, t.r.info.format.slice(0, 60), Object.keys(t.r.fields).length + ' 個の値の欄']);
  else show('CR だけの改行（2000 点）: エラー', t.error);
}
// ---- ASCII: 1 行目のデータに nan
{
  const r = await read('nan1.xyz', '1 2 nan\n4 5 6\n7 8 9\n');
  show('1 行目に nan', [r.n, r.skipped, r.info.format]);
}
// ---- ASCII: 欧州式の小数点（カンマ）+ セミコロン区切り
{
  const r = await read('eu.csv', '1,5;2,5;3,5\n4,5;5,5;6,5\n');
  show('1,5;2,5;3,5（小数点がカンマ）', [r.n, r.pt(0), r.info.format]);
}
