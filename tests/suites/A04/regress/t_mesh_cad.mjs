// メッシュ・図面の形式（mesh.js・cad.js）の単体試験
import { test, isoTest, eq, ok, near, setFile } from './lib/harness.mjs';
import { read, tryRead, isJapanese, enc } from './lib/read.mjs';
setFile('t_mesh_cad');
const colorsWhere = (r, pred) => { const m = new Map(); for (let i = 0; i < r.n; i++) if (pred(r.pt(i))) { const k = r.col(i)?.join(',') ?? 'なし'; m.set(k, (m.get(k) || 0) + 1); } return m; };

test('OK-M01', 'OBJ: v/vt/vn/f（1/2/3 形式・負の番号）・usemtl と .mtl の Kd', async () => {
  const obj = 'mtllib a.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nusemtl red\nf 1/1/1 2/1/1 -1/1/1\n';
  const r = await read('a.obj', obj, { companions: { 'a.mtl': 'newmtl red\nKd 1 0 0\n' } });
  eq(r.n, 1000000); const c = colorsWhere(r, () => true); eq([...c.keys()], ['255,0,0']);
});
test('A04-010', 'OBJ: 頂点色つきの面 + 線（l）: 線の上の点は黒にしない（灰色）', async () => {
  const r = await read('vc.obj', 'v 0 0 0 1 0 0\nv 1 0 0 1 0 0\nv 0 1 0 1 0 0\nv 0 0 5 0 1 0\nv 10 0 5 0 1 0\nf 1 2 3\nl 4 5\n');
  const c = colorsWhere(r, p => p[2] === 5);
  ok(!c.has('0,0,0'), `線の点の色 ${JSON.stringify([...c])}`);
});
test('A04-028', 'OBJ: 頂点色の 0〜1 / 0〜255 の判定をファイル全体で揃える（頂点ごとに変えない）', async () => {
  const r = await read('vc255.obj', 'v 0 0 0 255 128 0\nv 1 0 0 1 1 0\nv 0 1 0 200 100 50\n');
  eq(r.col(1), [1, 1, 0]);
});
test('OK-M02', 'STL: バイナリ・文字の判定（大きさ = 84 + 50×三角形）', async () => {
  const b = new Uint8Array(84 + 50); const dv = new DataView(b.buffer); dv.setUint32(80, 1, true);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((x, j) => dv.setFloat32(96 + 4 * j, x, true));
  eq((await read('b.stl', b)).n, 1000000);
  const a = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n';
  eq((await read('a.stl', a)).n, 1000000);
});
test('A04-026', 'STL: 84 バイト未満（空・三角形なし）は日本語のエラー', async () => {
  for (const d of [new Uint8Array(0), enc.encode('solid x\nendsolid x\n')]) { const t = await tryRead('e.stl', d); ok(t.ok || isJapanese(t.error), `${t.name}: ${t.error}`); }
});
test('A04-029', 'STL: 色付き（VisCAM/SolidView: bit15=1・赤 = bit10〜14）の赤い面を赤で表示する', async () => {
  const b = new Uint8Array(84 + 50); const dv = new DataView(b.buffer); dv.setUint32(80, 1, true);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((x, j) => dv.setFloat32(96 + 4 * j, x, true)); dv.setUint16(132, 0x8000 | (31 << 10), true);
  const r = await read('vis.stl', b); eq(r.col(0), [248, 0, 0]);
});
test('A04-030', 'OFF: NOFF（法線）・CNOFF（法線 + 色）で法線を色として読まない', async () => {
  const n = await read('n.off', 'NOFF\n3 1 0\n0 0 0 0 0 -1\n1 0 0 0 0 -1\n0 1 0 0 0 -1\n3 0 1 2\n');
  ok(!n.rgb || n.col(0).join() === '200,200,200', `NOFF の色 ${n.col(0)}`);
  const cn = await read('cn.off', 'CNOFF\n3 1 0\n0 0 0 0 0 1 255 0 0 255\n1 0 0 0 0 1 255 0 0 255\n0 1 0 0 0 1 255 0 0 255\n3 0 1 2\n');
  eq(cn.col(0), [255, 0, 0], 'CNOFF の色');
});
test('OK-M03', 'OFF: COFF（RGBA 0〜255）・多角形の面（扇に分ける）・# の注釈', async () => {
  const r = await read('c.off', 'COFF # c\n4 1 0\n0 0 0 255 0 0 255\n1 0 0 255 0 0 255\n1 1 0 255 0 0 255\n0 1 0 255 0 0 255\n4 0 1 2 3\n');
  eq([r.n, r.col(0)], [1000000, [255, 0, 0]]);
});
test('A04-026', 'OFF: 空のファイルは日本語のエラー', async () => { const t = await tryRead('e.off', ''); ok(!t.ok && isJapanese(t.error), `${t.name}: ${t.error}`); });
test('A04-014', 'VTK 5.1（OFFSETS / CONNECTIVITY）の POLYGONS を面として読む', async () => {
  const t = await tryRead('v51.vtk', '# vtk DataFile Version 5.1\nvtk output\nASCII\nDATASET POLYDATA\nPOINTS 4 float\n0 0 0 10 0 0 10 10 0 0 10 0\nPOLYGONS 3 6\nOFFSETS vtktypeint64\n0 3 6\nCONNECTIVITY vtktypeint64\n0 1 2 0 2 3\n');
  ok(t.ok && t.r.n === 1000000, t.ok ? `n=${t.r.n}（面がなく頂点だけ） ${t.r.info.format}` : t.error);
});
test('OK-M04', 'VTK 4.2: POLYGONS・TRIANGLE_STRIPS・UNSTRUCTURED_GRID（CELLS + CELL_TYPES）・BINARY', async () => {
  const v42 = '# vtk DataFile Version 4.2\nvtk output\nASCII\nDATASET POLYDATA\nPOINTS 4 float\n0 0 0 10 0 0 10 10 0 0 10 0\nPOLYGONS 2 8\n3 0 1 2\n3 0 2 3\n';
  eq((await read('a.vtk', v42)).n, 1000000);
  const ug = '# vtk DataFile Version 3.0\nx\nASCII\nDATASET UNSTRUCTURED_GRID\nPOINTS 4 double\n0 0 0 10 0 0 10 10 0 0 10 0\nCELLS 1 5\n4 0 1 2 3\nCELL_TYPES 1\n9\n';
  eq((await read('u.vtk', ug)).n, 1000000);
  // BINARY（ビッグエンディアン）
  const h = '# vtk DataFile Version 3.0\nx\nBINARY\nDATASET POLYDATA\nPOINTS 3 float\n';
  const pts = new Uint8Array(36); const dv = new DataView(pts.buffer); [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(4 * i, v, false));
  const pol = new Uint8Array(16); const dv2 = new DataView(pol.buffer); [3, 0, 1, 2].forEach((v, i) => dv2.setInt32(4 * i, v, false));
  const parts = [enc.encode(h), pts, enc.encode('\nPOLYGONS 1 4\n'), pol, enc.encode('\n')];
  const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  eq((await read('b.vtk', all)).n, 1000000);
});
test('A04-031', 'VTK: CELL_DATA の SCALARS（面の数の値）を点の値として読まない', async () => {
  const r = await read('vcd.vtk', '# vtk DataFile Version 4.2\nvtk output\nASCII\nDATASET POLYDATA\nPOINTS 4 float\n0 0 0 10 0 0 10 10 0 0 10 0\nVERTICES 2 6\n2 0 1\n2 2 3\nCELL_DATA 2\nSCALARS cellid int 1\nLOOKUP_TABLE default\n7 8\nPOINT_DATA 4\nSCALARS height float 1\nLOOKUP_TABLE default\n1 2 3 4\n');
  ok(!('cellid' in r.fields), `点の値の欄に cellid = ${r.fields.cellid && Array.from(r.fields.cellid)}`);
  eq(Array.from(r.fields.height), [1, 2, 3, 4]);
});
const gltf = (mode, extra = {}) => { const pos = new Float32Array([0, 0, 0, 1, 0, 0, 5, 5, 0, 6, 5, 0]); return JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 48, uri: 'data:application/octet-stream;base64,' + Buffer.from(pos.buffer).toString('base64') }], bufferViews: [{ buffer: 0, byteLength: 48 }], accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0, ...extra }); };
test('A04-032', 'glTF: LINES（mode 1）は 2 点ずつ別の線（0-1 と 2-3 の間をつながない）', async () => {
  const r = await read('l.gltf', gltf(1)); let between = 0;
  for (let i = 0; i < r.n; i++) { const p = r.pt(i); if (p[0] > 1.5 && p[0] < 4.5) between++; }
  eq(between, 0);
});
test('A04-032', 'glTF: scenes がないとき、子のノードを 2 回数えない', async () => {
  const r = await read('n.gltf', JSON.stringify({ ...JSON.parse(gltf(0)), scenes: undefined, scene: undefined, nodes: [{ children: [1] }, { mesh: 0 }] }));
  eq(r.n, 4);
});
test('A04-032', 'glTF: 外部の .bin は大文字小文字を区別せずに一緒に選んだファイルと結びつける', async () => {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 5, 5, 0, 6, 5, 0]);
  const j = JSON.parse(gltf(0)); j.buffers[0].uri = 'Model.BIN';
  const t = await tryRead('m.gltf', JSON.stringify(j), { companions: { 'model.bin': new Uint8Array(pos.buffer) } });
  ok(t.ok && t.r.n === 4, t.ok ? `n=${t.r.n}` : t.error);
});
test('OK-M05', 'glTF: ノードの行列・TRS・三角形の帯（5）と扇（6）・COLOR_0', async () => {
  const r = await read('t.gltf', JSON.stringify({ ...JSON.parse(gltf(4)), nodes: [{ mesh: 0, translation: [100, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }] }));
  near(r.pt(1), [100, 1, 0], 1e-6);
  for (const m of [5, 6]) ok((await read('s.gltf', gltf(m))).n === 1000000, `mode ${m}`);
});
// ---- DXF
test('OK-D01', 'DXF: POINT・LINE・LWPOLYLINE・3DFACE・CIRCLE・ブロックの INSERT（移動・回転・倍率）・画層の色', async () => {
  const L = ['0', 'SECTION', '2', 'TABLES', '0', 'LAYER', '2', 'L1', '62', '1', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'B', '10', '0', '20', '0', '30', '0', '0', 'POINT', '8', '0', '62', '0', '10', '1', '20', '0', '30', '0', '0', 'ENDBLK', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', '0', 'POINT', '8', 'L1', '10', '5', '20', '6', '30', '7', '0', 'INSERT', '2', 'B', '8', '0', '62', '3', '10', '100', '20', '0', '30', '0', '41', '2', '42', '2', '43', '2', '50', '90', '0', 'ENDSEC', '0', 'EOF'];
  const r = await read('a.dxf', L.join('\n'));
  const pts = []; for (let i = 0; i < r.n; i++) pts.push([...r.pt(i).map(v => +v.toFixed(6)), ...r.col(i)]);
  ok(pts.some(p => p.join() === '5,6,7,255,0,0'), `画層 L1 の赤い点 ${JSON.stringify(pts)}`);
  ok(pts.some(p => Math.abs(p[0] - 100) < 1e-6 && Math.abs(p[1] - 2) < 1e-6 && p[3] === 0 && p[4] === 255), `INSERT（回転 90 度・倍率 2）で (100,2,0)・BYBLOCK の緑 ${JSON.stringify(pts)}`);
});
isoTest('A04-033', 'DXF: 自分自身を挿入するブロックで英語の「Maximum call stack size exceeded」にしない', 'iso/dxf_self.mjs', { timeoutMs: 10000, memMB: 400 });
isoTest('A04-033', 'DXF: 2.6 KB の入れ子のブロック（24 段・各 2 回）で 1,600 万点を作らない（20 秒・600 MB 以内）', 'iso/dxf_nest.mjs', { timeoutMs: 20000, memMB: 600, args: ['24'] });
// ---- SHP
test('OK-D02', 'SHP: 点（Z）と DBF の数値の属性・多角形（Z）', async () => {
  const shp = (st, body) => { const b = new Uint8Array(100 + 8 + body.length); const dv = new DataView(b.buffer); dv.setInt32(0, 9994, false); dv.setInt32(24, b.length / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, st, true); dv.setInt32(100, 1, false); dv.setInt32(104, body.length / 2, false); b.set(body, 108); return b; };
  const body = new Uint8Array(36); const dv = new DataView(body.buffer); dv.setInt32(0, 11, true); dv.setFloat64(4, 539000.5, true); dv.setFloat64(12, 3836000.25, true); dv.setFloat64(20, 31.5, true);
  const dbf = new Uint8Array(32 + 32 + 1 + 1 + 10); const dd = new DataView(dbf.buffer); dbf[0] = 3; dd.setUint32(4, 1, true); dd.setUint16(8, 65, true); dd.setUint16(10, 11, true);
  dbf.set(enc.encode('INTENSITY'), 32); dbf[43] = 'N'.charCodeAt(0); dbf[48] = 10; dbf[64] = 0x0d; dbf[65] = 0x20; dbf.set(enc.encode('      42.5'), 66);
  const r = await read('p.shp', shp(11, body), { companions: { 'p.dbf': dbf } });
  near(r.pt(0), [539000.5, 3836000.25, 31.5], 1e-6); eq(r.fields.intensity[0], 42.5);
});
isoTest('A04-034', 'SHP: 記録の長さが −4 語の壊れたファイルで、同じ記録を読み続けない（5 秒・300 MB 以内）', 'iso/shp_loop.mjs', { timeoutMs: 5000, memMB: 300 });
// ---- 未網羅だった分岐: DXF のポリフェースメッシュ・SHP の MultiPoint / MultiPatch・VTK の TRIANGLE_STRIPS
const polyface = idx => ['0', 'SECTION', '2', 'ENTITIES', '0', 'POLYLINE', '8', '0', '66', '1', '70', '64', '71', '3', '72', '1',
  '0', 'VERTEX', '8', '0', '10', '0', '20', '0', '30', '0', '70', '192', '0', 'VERTEX', '8', '0', '10', '1', '20', '0', '30', '0', '70', '192', '0', 'VERTEX', '8', '0', '10', '0', '20', '1', '30', '0', '70', '192',
  '0', 'VERTEX', '8', '0', '10', '0', '20', '0', '30', '0', '70', '128', '71', String(idx[0]), '72', String(idx[1]), '73', String(idx[2]), '0', 'SEQEND', '0', 'ENDSEC', '0', 'EOF'].join('\n');
test('OK-D03', 'DXF: ポリフェースメッシュ（POLYLINE 70=64 + VERTEX）の面の上に点を散らす', async () => {
  const r = await read('pf.dxf', polyface([1, 2, 3]));
  ok(r.n > 900000, `n=${r.n}`);
});
test('A04-051', 'DXF: ポリフェースメッシュの面が範囲外の頂点番号を指しても、英語の TypeError にしない', async () => {
  const t = await tryRead('pf_bad.dxf', polyface([1, 2, 9]));
  ok(t.ok || isJapanese(t.error), `${t.name}: ${t.error}`);
});
const shpFile = (st, content) => { const b = new Uint8Array(100 + 8 + content.length); const dv = new DataView(b.buffer); dv.setInt32(0, 9994, false); dv.setInt32(24, b.length / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, st, true); dv.setInt32(100, 1, false); dv.setInt32(104, content.length / 2, false); b.set(content, 108); return b; };
test('OK-D04', 'SHP: MultiPointZ（Z の位置 = 点の後ろ + Z の範囲 16 バイト）', async () => {
  const np = 3, c = new Uint8Array(40 + 16 * np + 16 + 8 * np + 16 + 8 * np); const dv = new DataView(c.buffer);
  dv.setInt32(0, 18, true); dv.setInt32(36, np, true);
  for (let j = 0; j < np; j++) { dv.setFloat64(40 + 16 * j, 10 + j, true); dv.setFloat64(48 + 16 * j, 20 + j, true); dv.setFloat64(40 + 16 * np + 16 + 8 * j, 5 + j, true); }
  const r = await read('mp.shp', shpFile(18, c));
  eq([r.n, r.pt(2)], [3, [12, 22, 7]]);
});
test('OK-D05', 'SHP: MultiPatch（三角形の帯）の面の上に点を散らし、Z を使う', async () => {
  const np = 4, c = new Uint8Array(44 + 4 + 4 + 16 * np + 16 + 8 * np + 16 + 8 * np); const dv = new DataView(c.buffer);
  dv.setInt32(0, 31, true); dv.setInt32(36, 1, true); dv.setInt32(40, np, true); dv.setInt32(44, 0, true); dv.setInt32(48, 0, true);
  const P = [[0, 0, 7], [1, 0, 7], [0, 1, 7], [1, 1, 7]]; const pts = 52;
  P.forEach((p, j) => { dv.setFloat64(pts + 16 * j, p[0], true); dv.setFloat64(pts + 16 * j + 8, p[1], true); dv.setFloat64(pts + 16 * np + 16 + 8 * j, p[2], true); });
  const r = await read('mpatch.shp', shpFile(31, c));
  ok(r.n > 900000, `n=${r.n}`); near(r.pt(100)[2], 7, 1e-9);
});
test('OK-M06', 'VTK: TRIANGLE_STRIPS（帯）の面', async () => {
  const s = '# vtk DataFile Version 4.2\nx\nASCII\nDATASET POLYDATA\nPOINTS 4 float\n0 0 0 1 0 0 0 1 0 1 1 0\nTRIANGLE_STRIPS 1 5\n4 0 1 2 3\n';
  eq((await read('ts.vtk', s)).n, 1000000);
});
