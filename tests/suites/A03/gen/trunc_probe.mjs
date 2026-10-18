import { makeSet, cat, te, f32 } from './lib.mjs';
const S = makeSet('tprobe');
// 現実的な途中切れ: OFF / VTK ascii（正しい小さな頭書き＋本体が途中で切れる）
S.add({ id: 'off_trunc', name: 'x.off', bytes: te.encode('OFF\n100 50 0\n0 0 0\n1 1 1\n2 2 2\n') , note: 'OFF 頂点100宣言・3行で切れ（コピー途中切れ）' });
S.add({ id: 'vtk_trunc_ascii', name: 'x.vtk', bytes: te.encode('# vtk DataFile Version 3.0\nc\nASCII\nDATASET POLYDATA\nPOINTS 100000 float\n0 0 0\n1 1 1\n'), note: 'VTK ascii POINTS 10万宣言・2点で切れ' });
// 中くらいの画像（実際に RAM を埋める）
S.add({ id: 'pgm_mid_20k', name: 'x.pgm', bytes: te.encode('P5 20000 20000 255\n'), note: 'PGM 2万x2万=1.6GB 確保＋充填' });
S.add({ id: 'vtk_ascii_fill_1e8', name: 'x.vtk', bytes: te.encode('# vtk DataFile Version 3.0\nc\nASCII\nDATASET POLYDATA\nPOINTS 100000000 float\n0 0 0\n'), note: 'VTK ascii POINTS 1e8=2.4GB 充填' });
S.write();
