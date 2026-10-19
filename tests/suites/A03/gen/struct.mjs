// A03: 構造を意識した改ざん（頭書きの数・再帰・過大確保 など）
import { makeSet, cat, te, latin, u32, u16, i32, f32, f64, le } from './lib.mjs';
const S = makeSet('struct');
const add = c => S.add(c);

// ---------- PCD: POINTS を極端な値に（ascii / binary / binary_compressed） ----------
const pcdHead = (pts, data, extra = '') => `# test\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH ${pts}\nHEIGHT 1\n${extra}POINTS ${pts}\nDATA ${data}\n`;
for (const pts of ['0', '-1', '4294967295', '1000000000000', '30000000', 'NaN', '99999999999999999999']) {
  add({ id: `pcd_ascii_points_${pts.replace(/\W/g, '_')}`, name: 'x.pcd', bytes: cat(pcdHead(pts, 'ascii'), '1 2 3\n4 5 6\n7 8 9\n'), note: `ascii POINTS=${pts}` });
}
// binary: POINTS 巨大 + 実データ 1 点だけ → 前もっての確保を見る
add({ id: 'pcd_bin_points_30M_1pt', name: 'x.pcd', bytes: cat(pcdHead('30000000', 'binary'), f32(1, 2, 3)), note: 'binary POINTS=3e7 だが 1 点ぶんしかない' });
add({ id: 'pcd_bin_points_1e9_1pt', name: 'x.pcd', bytes: cat(pcdHead('1000000000', 'binary'), f32(1, 2, 3)), cap: 1000000000, note: 'binary POINTS=1e9 + cap 10億 → 12GB 確保?' });
// binary_compressed: usize（展開後の大きさ）を巨大に → lzfDecompress の new Uint8Array(usize) 爆弾
for (const [usz, lbl] of [[500 * 1048576, '500MB'], [1500000000, '1_5GB'], [0xfffffff0, '4GB'], [0x7fffffff, '2GB']]) {
  add({ id: `pcd_bc_usize_${lbl}`, name: 'x.pcd', bytes: cat(pcdHead('5', 'binary_compressed'), u32(4), u32(usz >>> 0), new Uint8Array([0, 1, 2, 3])), note: `binary_compressed usize=${lbl} csize=4（解凍爆弾）` });
}
// binary_compressed: csize 巨大（宣言と実体の食い違い）
add({ id: 'pcd_bc_csize_huge', name: 'x.pcd', bytes: cat(pcdHead('5', 'binary_compressed'), u32(0xffffff00), u32(60), new Uint8Array(20)), note: 'csize 巨大' });

// ---------- OFF: 頂点数・面数を巨大に（new Float64Array(nv*3)） ----------
for (const [nv, lbl] of [['1000000000', '1e9'], ['100000000', '1e8'], ['4294967295', '4G'], ['-1', 'neg'], ['20000000', '2e7']]) {
  add({ id: `off_nv_${lbl}`, name: 'x.off', bytes: te.encode(`OFF\n${nv} 0 0\n0 0 0\n`), note: `OFF 頂点数=${nv}（過大確保）` });
}
add({ id: 'off_nf_huge', name: 'x.off', bytes: te.encode(`OFF\n1 1000000000 0\n0 0 0\n`), note: 'OFF 面数 巨大' });

// ---------- VTK: POINTS を巨大に（arr → new Float64Array(n*3)） ----------
for (const [np, lbl] of [['1000000000', '1e9'], ['300000000', '3e8'], ['4294967295', '4G']]) {
  add({ id: `vtk_points_${lbl}`, name: 'x.vtk', bytes: te.encode(`# vtk DataFile Version 3.0\ncomment\nASCII\nDATASET POLYDATA\nPOINTS ${np} float\n0 0 0\n`), note: `VTK POINTS=${np}` });
}
// VTK バイナリ: POINTS 巨大で読み出しが範囲外
add({ id: 'vtk_bin_points', name: 'x.vtk', bytes: cat('# vtk DataFile Version 3.0\nc\nBINARY\nDATASET POLYDATA\nPOINTS 1000000 float\n', new Uint8Array(40)), note: 'VTK バイナリ POINTS 巨大 + データ少' });

// ---------- 画像 PNM / TGA: 幅×高さを巨大に（new Uint8ClampedArray(w*h*4）） ----------
add({ id: 'pgm_huge', name: 'x.pgm', bytes: te.encode('P5 100000 100000 255\n'), note: 'PGM 100000x100000' });
add({ id: 'ppm_huge', name: 'x.ppm', bytes: te.encode('P6 100000 100000 255\n'), note: 'PPM 100000x100000' });
add({ id: 'pbm_huge', name: 'x.pbm', bytes: te.encode('P4 200000 200000\n'), note: 'PBM 200000x200000' });
add({ id: 'pgm_neg', name: 'x.pgm', bytes: te.encode('P5 -1 -1 255\n'), note: 'PGM 負の寸法' });
// TGA: 幅高さ 0xFFFF
add({ id: 'tga_huge', name: 'x.tga', bytes: cat(new Uint8Array([0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]), u16(0xffff), u16(0xffff), new Uint8Array([24, 0])), note: 'TGA 65535x65535 24bit' });
// WBMP 巨大
add({ id: 'wbmp_huge', name: 'x.wbmp', bytes: new Uint8Array([0, 0, 0x8f, 0x7f, 0x8f, 0x7f]), note: 'WBMP 多バイト整数で巨大な寸法' });
// XPM 巨大
add({ id: 'xpm_huge', name: 'x.xpm', bytes: te.encode('/* XPM */\nstatic char *x[] = {\n"100000 100000 1 1",\n"a c #ffffff",\n};\n'), note: 'XPM 巨大' });

// ---------- DXF: 自己参照するブロック（INSERT 再帰） ----------
const dxfSelfBlock = `0
SECTION
2
BLOCKS
0
BLOCK
2
A
10
0.0
20
0.0
30
0.0
0
INSERT
2
A
10
0.0
20
0.0
30
0.0
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
2
A
10
0.0
20
0.0
30
0.0
0
ENDSEC
0
EOF
`;
add({ id: 'dxf_self_insert', name: 'x.dxf', bytes: te.encode(dxfSelfBlock), note: 'DXF 自己参照 INSERT（無限再帰?）' });
// 相互参照 A→B→A
const dxfMutual = `0
SECTION
2
BLOCKS
0
BLOCK
2
A
0
INSERT
2
B
0
ENDBLK
0
BLOCK
2
B
0
INSERT
2
A
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
2
A
0
ENDSEC
0
EOF
`;
add({ id: 'dxf_mutual_insert', name: 'x.dxf', bytes: te.encode(dxfMutual), note: 'DXF 相互参照 A→B→A（無限再帰?）' });

// ---------- PDMS: 深い NEW のネスト（walk の再帰） ----------
add({ id: 'pdms_deep_new', name: 'x.pdms', bytes: te.encode('NEW SITE\n'.repeat(60000) + 'NEW BOX XLENGTH 1 YLENGTH 1 ZLENGTH 1\n'), note: 'PDMS 深い NEW ネスト 6万（walk 再帰）' });

// ---------- CCBIN v2: 深い子のネスト（obj 再帰） ----------
// version 50、座標 float。各 obj: id(4) name(qstr: ff ff ff ff=空) flags(4) meta count(4=0) + HOBJ(hobj: 5+1(colorOverride bool=0)+1(hasGL bool=0)+1(nameIn3D) ) + childCount(4) + (v>=23 skip4) + (v>=45 skip64)
// 簡単のため HOBJ グループを深くネスト
function ccbinDeep(depth) {
  const parts = [te.encode('CCB2'), u32(50)];
  // 1 ノード分（HOBJ グループ、子 1 個）を depth 個、最後は子 0
  const node = (childCount) => cat(
    u32(0x1234),            // id
    u32(0xffffffff),        // name（空 QString）
    u32(0),                 // flags
    u32(0),                 // meta count
    // hobj: skip5, colorOverride bool(1)=0, hasGL bool(1)=0, v>=24 nameIn3D skip1
    new Uint8Array([0, 0, 0, 0, 0,  0,  0,  0]),
    u32(childCount),        // 子の数
    u32(0),                 // v>=23: 選択時の振る舞い（skip4）
    new Uint8Array(64),     // v>=45: 変換履歴（skip64）
  );
  // クラス ID（v>=34 なので 8 バイト big64）= T.HOBJ = 0x1n
  const cls = () => le(8, 8, 1);
  // 木を前順で: root(cls+node(child=1)) → child(cls+node(child=1)) → ... → leaf(cls+node(child=0))
  // ただし obj は「cls を先に読み、その後 node、その後 children を cls+node で」= 先頭 cls は P.cls() で読む
  const buf = [te.encode('CCB2'), u32(50), cls()];
  for (let i = 0; i < depth; i++) {
    buf.push(node(i < depth - 1 ? 1 : 0));
    if (i < depth - 1) buf.push(cls()); // 次の子の cls
  }
  return cat(...buf);
}
add({ id: 'ccbin_deep_children', name: 'x.bin', bytes: ccbinDeep(20000), note: 'CCBIN v2 深い子ネスト 2万（obj 再帰）' });

// ---------- CCBIN v1: 点群数・点数の境界 ----------
add({ id: 'ccbin_v1_nc_huge', name: 'x.bin', bytes: u32(0xffffffff), note: 'CCBIN v1 点群数 4G' });

// ---------- PLY: 面リストの要素数を巨大に（binary） ----------
// vertex 1 個、face 1 個、面リストの個数 = 0xFFFFFFFF
const plyBinListHuge = cat(
  'ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n',
  f32(0, 0, 0),          // 頂点
  new Uint8Array([255]), // uchar の個数 = 255
  u32(0, 0, 0, 0, 0),    // 本当は 255 個必要だが足りない
);
add({ id: 'ply_bin_face_list_255', name: 'x.ply', bytes: plyBinListHuge, note: 'PLY binary 面リスト 255 個宣言・データ不足' });
// list の個数に int を使い巨大
const plyBinListInt = cat(
  'ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list int int vi\nend_header\n',
  f32(0, 0, 0, 1, 0, 0, 0, 1, 0),
  i32(1000000000),       // 面リストの個数 = 10 億
  i32(0, 1, 2),
);
add({ id: 'ply_bin_face_list_1e9', name: 'x.ply', bytes: plyBinListInt, note: 'PLY binary 面リスト 10億個宣言（new Array(c)）' });
// PLY ascii mesh: vertex count 2e7（過大確保）だが face あり
add({ id: 'ply_ascii_vcount_2e7', name: 'x.ply', bytes: te.encode('ply\nformat ascii 1.0\nelement vertex 20000000\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vi\nend_header\n0 0 0\n'), note: 'PLY ascii 頂点2e7宣言+面1（480MB 確保）' });

// ---------- SBF: 値の欄の数を巨大に ----------
const sbfData = cat(new Uint8Array([42, 42]), le(8, 8, 5), u16(0xffff), f64(0, 0, 0), new Uint8Array(64 - 2 - 8 - 2 - 24));
add({ id: 'sbf_nsf_65535', name: 'x.sbf', bytes: te.encode('[SBF]\nPoints=5\nSFCount=65535\n'), companions: [{ name: 'x.sbf.data', bytes: sbfData }], note: 'SBF 値の欄 65535（多数フィールド）' });
// SBF n 巨大
const sbfBigN = cat(new Uint8Array([42, 42]), le(8, 8, 1000000000000), u16(1), f64(0, 0, 0), new Uint8Array(64 - 36), f32(0, 0, 0, 0));
add({ id: 'sbf_n_1e12', name: 'x.sbf', bytes: te.encode('[SBF]\n'), companions: [{ name: 'x.sbf.data', bytes: sbfBigN }], note: 'SBF 点数 1e12' });

// ---------- E57: xmlOff/xmlLen を外へ ----------
const e57Head = (xmlOff, xmlLen, page = 1024) => cat(te.encode('ASTM-E57'), u32(1, 0), le(8, 8, xmlOff), le(8, 8, xmlLen), le(8, 8, page), new Uint8Array(8));
add({ id: 'e57_xmloff_outside', name: 'x.e57', bytes: cat(e57Head(1000000000, 1000), new Uint8Array(100)), note: 'E57 XML オフセット ファイル外' });
add({ id: 'e57_xmllen_huge', name: 'x.e57', bytes: cat(e57Head(48, 0xffffffff), new Uint8Array(100)), note: 'E57 XML 長さ 4G' });

// ---------- simple PN/PV: サイズが倍数でない ----------
add({ id: 'pn_not_multiple', name: 'x.pn', bytes: new Uint8Array(23), note: 'PN 23 バイト（24 の倍数でない）' });

S.write();
console.log('struct cases:', S.dir);
