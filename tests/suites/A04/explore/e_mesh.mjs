import { read, tryRead, show, enc } from './lib.mjs';
const colorsOf = (r, pred) => { const m = new Map(); for (let i = 0; i < r.n; i++) { const p = r.pt(i); if (pred(p)) { const k = r.col(i)?.join(',') ?? 'なし'; m.set(k, (m.get(k) || 0) + 1); } } return [...m].sort((a, b) => b[1] - a[1]).slice(0, 4); };

// ---- OBJ: 頂点色 + 線（l）
{
  const s = 'v 0 0 0 1 0 0\nv 1 0 0 1 0 0\nv 0 1 0 1 0 0\nv 0 0 5 0 1 0\nv 10 0 5 0 1 0\nf 1 2 3\nl 4 5\n';
  const r = await read('vc.obj', s);
  show('OBJ 頂点色つきの面 + 線: 線の点（z=5）の色', colorsOf(r, p => p[2] === 5));
}
// ---- OBJ: 頂点色の 0〜1 / 0〜255 の判定が頂点ごと
{
  const s = 'v 0 0 0 255 128 0\nv 1 0 0 1 1 0\nv 0 1 0 200 100 50\n';
  const r = await read('vc255.obj', s);
  show('OBJ 0〜255 の頂点色に (1,1,0) が混ざる', [r.col(0), r.col(1), r.col(2)]);
}
// ---- STL: 短いファイル・色
{
  const t = await tryRead('empty.stl', new Uint8Array(0));
  show('STL 0 バイト', t.ok ? `エラーなし n=${t.r.n}` : `${t.name}: ${t.error}`);
  const t2 = await tryRead('short.stl', enc.encode('solid x\nendsolid x\n'));
  show('STL 文字・三角形なし（19 バイト）', t2.ok ? `エラーなし n=${t2.r.n}` : `${t2.name}: ${t2.error}`);
  // 色付きバイナリ STL: VisCAM/SolidView 形式（bit15=1、bit0-4 = 青、10-14 = 赤）で赤い三角形
  const mk = (attr, header = '') => {
    const b = new Uint8Array(84 + 50); const dv = new DataView(b.buffer);
    b.set(enc.encode(header.padEnd(80, ' ').slice(0, 80)));
    dv.setUint32(80, 1, true);
    const v = [0, 0, 0, 1, 0, 0, 0, 1, 0]; v.forEach((x, j) => dv.setFloat32(84 + 12 + 4 * j, x, true));
    dv.setUint16(84 + 48, attr, true);
    return b;
  };
  const red5 = 31;
  const visRed = 0x8000 | (red5 << 10); // VisCAM: 赤は bit10-14
  const r1 = await read('vis.stl', mk(visRed));
  show('STL VisCAM 形式の「赤」(bit15=1, 赤=bit10-14)', r1.col(0));
  const magRed = (red5 << 0); // Magics: bit15=0 が「面の色あり」、赤は bit0-4（ヘッダに COLOR=）
  const r2 = await read('mag.stl', mk(magRed, 'COLOR=\xC8\xC8\xC8\xFF MATERIAL='));
  show('STL Magics 形式の「赤」(bit15=0, 赤=bit0-4)', r2.col(0));
}
// ---- OFF: NOFF（法線つき）・COFF（RGBA）・CNOFF
{
  const nof = 'NOFF\n3 1 0\n0 0 0 0 0 -1\n1 0 0 0 0 -1\n0 1 0 0 0 -1\n3 0 1 2\n';
  const r = await read('n.off', nof);
  show('NOFF（x y z nx ny nz）の頂点の色', [r.col(0), r.col(1)]);
  const coff = 'COFF\n3 1 0\n0 0 0 255 0 0 255\n1 0 0 255 0 0 255\n0 1 0 255 0 0 255\n3 0 1 2\n';
  const rc = await read('c.off', coff);
  show('COFF（RGBA 0〜255）の頂点の色', [rc.col(0), rc.col(1)]);
  const cnoff = 'CNOFF\n3 1 0\n0 0 0 0 0 1 255 0 0 255\n1 0 0 0 0 1 255 0 0 255\n0 1 0 0 0 1 255 0 0 255\n3 0 1 2\n';
  const rcn = await read('cn.off', cnoff);
  show('CNOFF（x y z nx ny nz r g b a）の頂点の色', [rcn.col(0), rcn.col(1)]);
  const t = await tryRead('e.off', '');
  show('OFF 空のファイル', t.ok ? 'エラーなし' : `${t.name}: ${t.error}`);
}
// ---- VTK 5.1（OFFSETS / CONNECTIVITY）
{
  const v51 = '# vtk DataFile Version 5.1\nvtk output\nASCII\nDATASET POLYDATA\nPOINTS 4 float\n0 0 0 10 0 0 10 10 0 0 10 0\nPOLYGONS 3 6\nOFFSETS vtktypeint64\n0 3 6\nCONNECTIVITY vtktypeint64\n0 1 2 0 2 3\n';
  const t = await tryRead('v51.vtk', v51);
  show('VTK 5.1 の四角（三角形 2 枚）', t.ok ? `n=${t.r.n} ${t.r.info.format}` : t.error);
  const v42 = '# vtk DataFile Version 4.2\nvtk output\nASCII\nDATASET POLYDATA\nPOINTS 4 float\n0 0 0 10 0 0 10 10 0 0 10 0\nPOLYGONS 2 8\n3 0 1 2\n3 0 2 3\n';
  const t2 = await tryRead('v42.vtk', v42);
  show('同じ四角を VTK 4.2 で', t2.ok ? `n=${t2.r.n} ${t2.r.info.format}` : t2.error);
  // CELL_DATA の SCALARS（面の数 2 ≠ 点の数 4）のあとに POINT_DATA の色
  const vcd = '# vtk DataFile Version 4.2\nvtk output\nASCII\nDATASET POLYDATA\nPOINTS 4 float\n0 0 0 10 0 0 10 10 0 0 10 0\nVERTICES 4 8\n1 0\n1 1\n1 2\n1 3\nCELL_DATA 4\nPOINT_DATA 4\nSCALARS height float 1\nLOOKUP_TABLE default\n1 2 3 4\n';
  const t3 = await tryRead('vcd.vtk', vcd);
  show('VTK 点だけ + POINT_DATA の値', t3.ok ? [t3.r.n, Array.from(t3.r.fields.height || [])] : t3.error);
  const vcd2 = '# vtk DataFile Version 4.2\nvtk output\nASCII\nDATASET POLYDATA\nPOINTS 4 float\n0 0 0 10 0 0 10 10 0 0 10 0\nVERTICES 2 6\n2 0 1\n2 2 3\nCELL_DATA 2\nSCALARS cellid int 1\nLOOKUP_TABLE default\n7 8\nPOINT_DATA 4\nSCALARS height float 1\nLOOKUP_TABLE default\n1 2 3 4\n';
  const t4 = await tryRead('vcd2.vtk', vcd2);
  show('VTK CELL_DATA（2 個）のあとに POINT_DATA の値', t4.ok ? [t4.r.n, Object.fromEntries(Object.entries(t4.r.fields).map(([k, v]) => [k, Array.from(v)]))] : t4.error);
}
// ---- glTF: LINES（mode 1）・scenes なし・外部 .bin の大文字小文字
{
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 5, 5, 0, 6, 5, 0]);
  const b64 = Buffer.from(pos.buffer).toString('base64');
  const g = (extra) => JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 48, uri: 'data:application/octet-stream;base64,' + b64 }], bufferViews: [{ buffer: 0, byteLength: 48 }], accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 1 }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0, ...extra });
  const r = await read('lines.gltf', g({}));
  let between = 0; for (let i = 0; i < r.n; i++) { const p = r.pt(i); if (p[0] > 1.5 && p[0] < 4.5) between++; }
  show('glTF LINES（0-1 と 2-3 の 2 本）: 1〜5 の間の点', `${between} 点（期待 0）`);
  const r2 = await read('noscene.gltf', JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 48, uri: 'data:application/octet-stream;base64,' + b64 }], bufferViews: [{ buffer: 0, byteLength: 48 }], accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 0 }] }], nodes: [{ children: [1] }, { mesh: 0 }] }));
  show('glTF scenes なし・子のノードに点 4 個', `n=${r2.n}（期待 4）`);
  const ext = JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 48, uri: 'Model.BIN' }], bufferViews: [{ buffer: 0, byteLength: 48 }], accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 0 }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }] });
  const t3 = await tryRead('m.gltf', ext, { companions: { 'model.bin': new Uint8Array(pos.buffer) } });
  show('glTF の uri "Model.BIN" と選んだファイル "model.bin"', t3.ok ? `n=${t3.r.n}` : t3.error);
}
// ---- DXF: ブロックが自分自身を挿入
{
  const dxf = ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'A', '10', '0', '20', '0', '30', '0', '0', 'POINT', '10', '1', '20', '1', '30', '0', '0', 'INSERT', '2', 'A', '10', '1', '20', '0', '30', '0', '0', 'ENDBLK', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '2', 'A', '10', '0', '20', '0', '30', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const t0 = Date.now();
  const t = await tryRead('rec.dxf', dxf);
  show('DXF ブロック A の中に INSERT A', (t.ok ? `エラーなし n=${t.r.n}` : `${t.name}: ${t.error}`) + `（${Date.now() - t0} ms）`);
  // 入れ子の倍々（20 段、各 2 回挿入 → 2^20 点）
  const L = [];
  L.push('0', 'SECTION', '2', 'BLOCKS');
  L.push('0', 'BLOCK', '2', 'B0', '10', '0', '20', '0', '30', '0', '0', 'POINT', '10', '0', '20', '0', '30', '0', '0', 'ENDBLK');
  for (let k = 1; k <= 20; k++) L.push('0', 'BLOCK', '2', 'B' + k, '10', '0', '20', '0', '30', '0', '0', 'INSERT', '2', 'B' + (k - 1), '10', '0', '20', '0', '30', '0', '0', 'INSERT', '2', 'B' + (k - 1), '10', String(2 ** k), '20', '0', '30', '0', '0', 'ENDBLK');
  L.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '2', 'B20', '10', '0', '20', '0', '30', '0', '0', 'ENDSEC', '0', 'EOF');
  const t1 = Date.now();
  const tb = await tryRead('nest.dxf', L.join('\n'));
  show(`DXF 入れ子 20 段（ファイル ${L.join('\n').length} バイト）`, (tb.ok ? `エラーなし n=${tb.r.n}` : `${tb.name}: ${tb.error}`) + `（${Date.now() - t1} ms, RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB）`);
}
