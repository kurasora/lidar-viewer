import { read, tryRead, show, enc, ROOT } from './lib.mjs';
import { join } from 'node:path';

// ---- PTX: 1 つ目のスキャンに色がなく、2 つ目にある
{
  const hdr = '2\n1\n0 0 0\n1 0 0\n0 1 0\n0 0 1\n1 0 0 0\n0 1 0 0\n0 0 1 0\n0 0 0 1\n';
  const s = hdr + '1 1 1 0.5\n2 2 2 0.5\n' + hdr + '3 3 3 0.5 255 0 0\n4 4 4 0.5 255 0 0\n';
  const r = await read('mix.ptx', s);
  show('PTX 色なしスキャン → 色ありスキャン: 2 つ目の点の色', [r.col(2), r.col(3), r.rgb ? 'rgb あり' : 'rgb なし']);
  // 変換行列（行ベクトル × 行列、最後の行が平行移動）
  const hdr2 = '1\n1\n0 0 0\n1 0 0\n0 1 0\n0 0 1\n0 1 0 0\n-1 0 0 0\n0 0 1 0\n10 20 30 1\n';
  const r2 = await read('m.ptx', hdr2 + '1 0 0 0.5\n');
  show('PTX z 90 度 + (10,20,30): (1,0,0) →', [r2.pt(0), '期待 [10,21,30]']);
}
// ---- Bundler: 点の途中に空行
{
  const s = '# Bundle file v0.3\n0 2\n1 2 3\n255 0 0\n0\n\n4 5 6\n0 255 0\n0\n';
  const r = await read('b.out', s);
  show('Bundler 点の間に空行', [r.n, r.pt(0), r.col(0), r.n > 1 ? r.pt(1) : null, r.n > 1 ? r.col(1) : null]);
}
// ---- SinusX: CP の閉じた線の印
{
  const s = 'B S\nCN sq\nCP 1 1\nCP 0\n0 0 0 A\n10 0 0 A\n10 10 0 A\n0 10 0 A\n';
  const r = await read('sq.sx', s);
  let diag = 0; for (let i = 0; i < r.n; i++) { const p = r.pt(i); if (p[0] === 0 && p[1] > 0.5 && p[1] < 9.5) diag++; }
  show('SinusX CP 1 1（閉じた四角）: x=0 の辺の点', diag);
  const r0 = await read('sq0.sx', s.replace('CP 1 1', 'CP 0 1'));
  let d0 = 0; for (let i = 0; i < r0.n; i++) { const p = r0.pt(i); if (p[0] === 0 && p[1] > 0.5 && p[1] < 9.5) d0++; }
  show('SinusX CP 0 1: x=0 の辺の点', d0);
  const r1 = await read('sq1.sx', s.replace('CP 1 1', 'CP 1 0'));
  let d1 = 0; for (let i = 0; i < r1.n; i++) { const p = r1.pt(i); if (p[0] === 0 && p[1] > 0.5 && p[1] < 9.5) d1++; }
  show('SinusX CP 1 0: x=0 の辺の点', d1);
}
// ---- SHP: 空・壊れた長さ
{
  const t = await tryRead('e.shp', new Uint8Array(50));
  show('SHP 50 バイト', t.ok ? `エラーなし n=${t.r.n}` : `${t.name}: ${t.error}`);
  const b = new Uint8Array(100 + 8 + 28); const dv = new DataView(b.buffer);
  dv.setInt32(0, 9994, false); dv.setInt32(24, (b.length) / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, 1, true);
  dv.setInt32(100, 1, false); dv.setInt32(104, -10, false); dv.setInt32(108, 1, true); dv.setFloat64(112, 3, true); dv.setFloat64(120, 4, true);
  const t2 = await tryRead('neg.shp', b);
  show('SHP 記録の長さが負', t2.ok ? `エラーなし n=${t2.r.n}` : `${t2.name}: ${t2.error}`);
}
// ---- 画像: PBM P1（区切りなし）、XPM #RGB、TGA パレット
{
  const p1 = 'P1\n4 2\n0101\n1010\n';
  const r = await read('a.pbm', p1);
  const lum = Array.from(r.fields.luminance);
  show('PBM P1 区切りなし（0101/1010）の明るさ', lum.map(v => v > 128 ? '白' : '黒').join(''));
  const p1s = 'P1\n4 2\n0 1 0 1\n1 0 1 0\n';
  const rs = await read('b.pbm', p1s);
  show('PBM P1 区切りあり（基準）', Array.from(rs.fields.luminance).map(v => v > 128 ? '白' : '黒').join(''));
  const xpm = '/* XPM */\nstatic char *x[] = {\n"2 1 2 1",\n"a c #F00",\n"b c #00F",\n"ab"\n};\n';
  const rx = await read('c.xpm', xpm);
  show('XPM #F00 / #00F（3 桁）', [rx.col(0), rx.col(1)]);
  // TGA 色表つき（type 1）: 2 色の表（赤・緑）、画素は 0,1
  const tga = new Uint8Array(18 + 6 + 2); tga[1] = 1; tga[2] = 1; tga[5] = 2; tga[7] = 24; tga[12] = 2; tga[14] = 1; tga[16] = 8; tga[17] = 32;
  tga.set([0, 0, 255, 0, 255, 0], 18); tga.set([0, 1], 24);
  const rt = await read('p.tga', tga);
  show('TGA 色表つき（赤・緑）', [rt.col(0), rt.col(1)]);
}
// ---- PSZ: 中の zip を全部展開する（使わないファイルも）
{
  const { zipSync, strToU8 } = await import(join(ROOT, 'node_modules/fflate/esm/index.mjs'));
  const ply = 'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n';
  const big = new Uint8Array(400e6); // 0 だけの 400 MB（zip で数百 KB）
  const z = zipSync({ 'doc.xml': strToU8('<document><chunk><frames><frame path="f.zip"/></frames></chunk></document>'), 'f.zip': zipSync({ 'doc.xml': strToU8('<frame><point_cloud><points path="p.ply"/></point_cloud></frame>'), 'p.ply': strToU8(ply) }), 'images/depth.bin': big }, { level: 9 });
  const t0 = Date.now();
  const t = await tryRead('a.psz', z);
  show(`PSZ ${(z.length / 1e6).toFixed(2)} MB（使わない 400 MB の展開物を含む）`, (t.ok ? `エラーなし n=${t.r.n}` : t.error) + `（${Date.now() - t0} ms、RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB）`);
}
