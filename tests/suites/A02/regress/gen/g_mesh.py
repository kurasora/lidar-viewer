# OBJ・STL・OFF・VTK の変種
import struct, math
import numpy as np
from common import *

BW = ('node', 'browser')


def objv(V, C=None, scale=1.0, fmt='%.6f', sep=' '):
    out = []
    for i, v in enumerate(V):
        s = 'v' + sep + sep.join(fmt % x for x in v)
        if C is not None:
            s += sep + sep.join(fmt % (c * scale) for c in C[i])
        out.append(s)
    return out


def objf(T, base=1, neg=False, nv=None):
    out = []
    for t in T:
        if neg:
            out.append('f ' + ' '.join(str(int(k) - nv) for k in t))
        else:
            out.append('f ' + ' '.join(str(int(k) + base) for k in t))
    return out


def gen_obj():
    P = two_boxes()
    V, T, C, pid = merge(P)
    nv = len(V)
    base_e = mesh_expect([(a, b, None, n) for a, b, c, n in P], extra={'rgb': False, 'fmt': r'OBJ（頂点 16、三角形 24）'})
    # 1 基本
    open(path('obj/basic.obj'), 'w').write('\n'.join(objv(V) + objf(T)) + '\n')
    case('obj_basic', ['obj/basic.obj'], base_e, BW, '頂点と三角形だけ')
    # 2 頂点色 0〜1
    open(path('obj/vc01.obj'), 'w').write('\n'.join(objv(V, C / 255.0) + objf(T)) + '\n')
    case('obj_vc01', ['obj/vc01.obj'], mesh_expect(P, extra={'rgb': True}), BW, 'v x y z r g b（0〜1）')
    # 3 頂点色 0〜255（B の箱はほぼ黒 (1,1,1)／(0,1,0) の頂点を含む）
    Cb = C.copy(); Cb[pid_vertices(P, 0)] = [200, 30, 30]
    Bv = pid_vertices(P, 1); Cb[Bv] = [1, 1, 1]; Cb[Bv[:2]] = [0, 1, 0]
    open(path('obj/vc255.obj'), 'w').write('\n'.join(objv(V, Cb, fmt='%d') + objf(T)) + '\n')
    e = mesh_expect(P, color_override=[[200, 30, 30], [0.75, 1, 0.75]], ctol=6, extra={'rgb': True})
    case('obj_vc255', ['obj/vc255.obj'], e, BW, 'v x y z r g b（0〜255。暗い頂点 (1,1,1) (0,1,0) を含む）')
    # 4 頂点色 0〜1 だが 1 をわずかに超える値（1.0000001）
    Cf = C / 255.0; Cf[pid_vertices(P, 0)] = [1.0000001, 0, 0]
    open(path('obj/vc_over1.obj'), 'w').write('\n'.join(objv(V, Cf, fmt='%.7f') + objf(T)) + '\n')
    case('obj_vc_over1', ['obj/vc_over1.obj'], mesh_expect(P, extra={'rgb': True}), BW, '頂点色 1.0000001（丸め誤差で 1 を超えた値）')
    # 5 負の添字
    lines = []
    for k, (Vp, Tp, c, n) in enumerate(P):
        lines += objv(Vp)
        lines += objf(Tp, neg=True, nv=len(Vp))
    open(path('obj/negidx.obj'), 'w').write('\n'.join(lines) + '\n')
    case('obj_negidx', ['obj/negidx.obj'], base_e, BW, '負の添字（相対参照）')
    # 6 多角形（四角形の面と正六角形）
    a = box(0, 0, 0, 1, 1, 1)
    quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    hexV = np.array([[4 + math.cos(k * math.pi / 3), 1 + math.sin(k * math.pi / 3), 0.5] for k in range(6)])
    lines = objv(a[0]) + objv(hexV) + ['f ' + ' '.join(str(i + 1) for i in q) for q in quads] + ['f ' + ' '.join(str(9 + k) for k in range(6))]
    open(path('obj/poly.obj'), 'w').write('\n'.join(lines) + '\n')
    hexT = np.array([[0, k, k + 1] for k in range(1, 5)])
    e = mesh_expect([(a[0], a[1], None, 'A'), (hexV, hexT, None, 'hex')], extra={'rgb': False})
    case('obj_poly', ['obj/poly.obj'], e, BW, '四角形・六角形の面')
    # 7 凹多角形（L 字。扇形に分けると外にはみ出す頂点の順）
    L = np.array([[2, 1, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0], [0, 0, 0], [2, 0, 0]], float)
    open(path('obj/concave.obj'), 'w').write('\n'.join(objv(L) + ['f 1 2 3 4 5 6']) + '\n')
    # 正解: L 字の中だけ（[0,2]x[0,1] と [0,1]x[1,2]）。はぐれ点＝凹みの部分 (1,2]x(1,2]
    e = {'n': [999000, 1000001], 'parts': [{'name': 'L1', 'box': [-1e-6, -1e-6, -1e-6, 2 + 1e-6, 1 + 1e-6, 1e-6]}, {'name': 'L2', 'box': [-1e-6, 1 - 1e-6, -1e-6, 1 + 1e-6, 2 + 1e-6, 1e-6]}], 'strayMax': 0.0}
    case('obj_concave', ['obj/concave.obj'], e, BW, '凹んだ多角形の面（L 字）')
    # 8 v/vt/vn と v//vn
    lines = objv(V) + ['vt 0 0', 'vt 1 0', 'vt 1 1', 'vn 0 0 1']
    for i, t in enumerate(T):
        if i % 2: lines.append('f ' + ' '.join(f'{k + 1}/{(j % 3) + 1}/1' for j, k in enumerate(t)))
        else: lines.append('f ' + ' '.join(f'{k + 1}//1' for k in t))
    open(path('obj/vtn.obj'), 'w').write('\n'.join(lines) + '\n')
    case('obj_vtn', ['obj/vtn.obj'], base_e, BW, 'f v/vt/vn・v//vn')
    # 9 いろいろな行（g o s・注釈・空行・字下げ・タブ区切り・mtllib だけ）
    lines = ['# comment', 'mtllib missing.mtl', 'o boxes', '', 'g A']
    for i, v in enumerate(V):
        lines.append(('\t' if i % 2 else '  ') + 'v\t' + '\t'.join('%.6f' % x for x in v))
    lines += ['s off', 'g B', 'vp 0.5 0.5']
    lines += ['  f ' + ' '.join(str(k + 1) for k in t) + '   ' for t in T]
    open(path('obj/misc.obj'), 'w').write('\n'.join(lines))  # 最後の改行なし
    case('obj_misc', ['obj/misc.obj'], base_e, BW, 'g/o/s・注釈・字下げ・タブ・最後の改行なし')
    # 10 CRLF
    open(path('obj/crlf.obj'), 'wb').write(('\r\n'.join(objv(V, C / 255.0) + objf(T)) + '\r\n').encode())
    case('obj_crlf', ['obj/crlf.obj'], mesh_expect(P, extra={'rgb': True}), BW, 'CRLF の改行')
    # 11 行の継続（\）
    lines = []
    for v in V: lines.append('v %.6f %.6f \\\n %.6f' % tuple(v))
    for t in T: lines.append('f %d %d \\\n%d' % tuple(int(k) + 1 for k in t))
    open(path('obj/cont.obj'), 'w').write('\n'.join(lines) + '\n')
    case('obj_cont', ['obj/cont.obj'], base_e, BW, '行の継続（行末の \\）')
    # 12 .mtl の色
    mtl = 'newmtl red\nKd 1 0 0\n\nnewmtl blue\nKd 0 0 1\n'
    open(path('obj/mtl/m.mtl'), 'w').write(mtl)
    lines = ['mtllib m.mtl'] + objv(V) + ['usemtl red'] + objf(T[pid == 0]) + ['usemtl blue'] + objf(T[pid == 1])
    open(path('obj/mtl/m.obj'), 'w').write('\n'.join(lines) + '\n')
    case('obj_mtl', ['obj/mtl/m.obj', 'obj/mtl/m.mtl'], mesh_expect(P, extra={'rgb': True}), BW, '.obj + .mtl（Kd）')
    case('obj_mtl_drop', ['obj/mtl/m.obj', 'obj/mtl/m.mtl'], mesh_expect(P, extra={'rgb': True}), ('browser',), '.obj + .mtl をドラッグ＆ドロップ', drop=True)
    case('obj_mtl_absent', ['obj/mtl/m.obj'], mesh_expect([(a, b, None, n) for a, b, c, n in P], extra={'rgb': False}), BW, '.obj だけ（.mtl を選ばない）')
    # 13 Kd のない材質（map_Kd だけ）と usemtl より前の面
    mtl = 'newmtl red\nKd 1 0 0\nnewmtl texonly\nmap_Kd tex.png\n'
    open(path('obj/mtl2/m2.mtl'), 'w').write(mtl)
    lines = ['mtllib m2.mtl'] + objv(V) + ['usemtl red'] + objf(T[pid == 0]) + ['usemtl texonly'] + objf(T[pid == 1])
    open(path('obj/mtl2/m2.obj'), 'w').write('\n'.join(lines) + '\n')
    e = mesh_expect(P, color_override=[[255, 0, 0], [200, 200, 200]], extra={'rgb': True})
    e['parts'][1]['ctol'] = 60
    case('obj_mtl_nokd', ['obj/mtl2/m2.obj', 'obj/mtl2/m2.mtl'], e, BW, 'Kd のない材質（map_Kd だけ）の面')
    lines = ['mtllib m.mtl'] + objv(V) + objf(T[pid == 1]) + ['usemtl red'] + objf(T[pid == 0])
    open(path('obj/mtl/before.obj'), 'w').write('\n'.join(lines) + '\n')
    e = mesh_expect(P, color_override=[[255, 0, 0], [200, 200, 200]], extra={'rgb': True})
    e['parts'][1]['ctol'] = 60
    case('obj_mtl_before', ['obj/mtl/before.obj', 'obj/mtl/m.mtl'], e, BW, 'usemtl より前の面（材質なし）')
    # 14 2 組の .obj + .mtl を同時に（どちらも材質名 material_0）
    for nm, (Vp, Tp, c, n), kd in [('a', P[0], '1 0 0'), ('b', P[1], '0 0 1')]:
        open(path(f'obj/two/{nm}.mtl'), 'w').write(f'newmtl material_0\nKd {kd}\n')
        open(path(f'obj/two/{nm}.obj'), 'w').write('\n'.join([f'mtllib {nm}.mtl'] + objv(Vp) + ['usemtl material_0'] + objf(Tp)) + '\n')
    ea = mesh_expect([P[0]], extra={'rgb': True}); eb = mesh_expect([P[1]], extra={'rgb': True})
    case('obj_two_mtl', ['obj/two/a.obj', 'obj/two/a.mtl', 'obj/two/b.obj', 'obj/two/b.mtl'],
         {'nfiles': 2, 'perFile': [{'name': 'a.obj', 'expect': ea}, {'name': 'b.obj', 'expect': eb}]}, BW, '2 組の .obj + .mtl（同じ材質名）を一度に')
    # 15 テクスチャ（Kd 1 1 1 + map_Kd、2×1 画素の PNG: 左が赤、右が青）
    from PIL import Image
    im = Image.new('RGB', (2, 1)); im.putpixel((0, 0), (255, 0, 0)); im.putpixel((1, 0), (0, 0, 255))
    im.save(path('obj/tex/tex.png'))
    open(path('obj/tex/t.mtl'), 'w').write('newmtl mat\nKa 1 1 1\nKd 1 1 1\nmap_Kd tex.png\n')
    lines = ['mtllib t.mtl'] + objv(V) + ['vt 0.25 0.5', 'vt 0.75 0.5', 'usemtl mat']
    for i, t in enumerate(T):
        vt = 1 if pid[i] == 0 else 2
        lines.append('f ' + ' '.join(f'{k + 1}/{vt}' for k in t))
    open(path('obj/tex/t.obj'), 'w').write('\n'.join(lines) + '\n')
    case('obj_tex', ['obj/tex/t.obj', 'obj/tex/t.mtl', 'obj/tex/tex.png'], mesh_expect(P, extra={'rgb': True}), BW, 'テクスチャ（map_Kd）の色')
    # 16 線（l）だけ
    LV = np.array([[0, 0, 0], [10, 0, 0], [10, 10, 0]], float)
    open(path('obj/lines.obj'), 'w').write('\n'.join(objv(LV) + ['l 1 2 3']) + '\n')
    e = {'n': [290000, 300010], 'bbox': [[0, 0, 0], [10, 10, 0]], 'parts': [{'name': 's1', 'box': [-1e-6, -1e-6, -1e-6, 10 + 1e-6, 1e-6, 1e-6]}, {'name': 's2', 'box': [10 - 1e-6, -1e-6, -1e-6, 10 + 1e-6, 10 + 1e-6, 1e-6]}], 'strayMax': 0.0, 'note': r'^(?!.*面の上に点を散らして).*$'}
    case('obj_lines', ['obj/lines.obj'], e, BW, '線（l）だけの OBJ（注記が「面の上に…」にならないこと）')
    # 17 大きな座標
    off = np.array([539000.0, 3836000.0, 30.0])
    Pb = [(a + off, b, c, n) for a, b, c, n in P]
    Vb, Tb, Cb2, _ = merge(Pb)
    open(path('obj/big.obj'), 'w').write('\n'.join(objv(Vb, Cb2 / 255.0, fmt='%.4f') + objf(Tb)) + '\n')
    e = mesh_expect(Pb, extra={'rgb': True, 'offset': [539000, 3836000, 0]})
    e['tol'] = 2e-3
    case('obj_big', ['obj/big.obj'], e, BW, 'UTM 風の大きな座標')
    # 18 色のある頂点とない頂点が混在
    lines = objv(P[0][0], np.tile([1, 0, 0], (8, 1)).astype(float)) + objv(P[1][0]) + objf(T)
    open(path('obj/vc_mixed.obj'), 'w').write('\n'.join(lines) + '\n')
    # 19 点だけの OBJ（面なし。点群を OBJ で書き出したもの）
    rng = np.random.default_rng(11); Qp = rng.uniform(0, 10, (3000, 3))
    open(path('obj/points_only.obj'), 'w').write('\n'.join(objv(Qp, np.tile([0.2, 0.4, 0.6], (3000, 1)))) + '\n')
    case('obj_points_only', ['obj/points_only.obj'], {'n': [3000, 3000], 'rgb': True, 'color': [51, 102, 153], 'ctol': 1, 'bbox': [Qp.min(0).tolist(), Qp.max(0).tolist()], 'tol': 1e-4, 'note': r'^(?!.*面の上に点を散らして).*$'}, BW, '面のない点だけの OBJ（色つき）。注記が「面の上に…」にならないこと')
    # 20 点の散らし方: 退化した三角形（同じ頂点・一直線・NaN）が混ざっても、正しい面だけに散らす
    lines = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'v 2 0 0', 'v 5 5 5', 'v nan 0 0',
             'f 1 2 3', 'f 1 1 2', 'f 1 2 4', 'f 2 2 2', 'f 1 6 2', 'f 5 5 5']
    open(path('obj/degenerate.obj'), 'w').write('\n'.join(lines) + '\n')
    e = {'parts': [{'name': 'tri', 'box': [-1e-6, -1e-6, -1e-6, 1 + 1e-6, 1 + 1e-6, 1e-6], 'frac': [0.99, 1.0]}, {'name': 'v4', 'box': [2 - 1e-6, -1e-6, -1e-6, 2 + 1e-6, 1e-6, 1e-6], 'maxCount': 1},
                   {'name': 'v5', 'box': [5 - 1e-6, 5 - 1e-6, 5 - 1e-6, 5 + 1e-6, 5 + 1e-6, 5 + 1e-6], 'maxCount': 1}], 'strayMax': 0.0, 'n': [999000, 1000001]}
    case('mesh_degenerate', ['obj/degenerate.obj'], e, BW, '退化した三角形（同じ頂点・一直線・NaN 座標）を混ぜても正しい面だけに散らす')
    # 21 面の中で一様か（直角三角形の左下 1/2×1/2 の正方形に、面積比 1/2 の点）
    open(path('obj/uniform.obj'), 'w').write('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')
    e = {'parts': [{'name': 'sq', 'box': [-1e-6, -1e-6, -1e-6, 0.5, 0.5, 1e-6], 'frac': [0.495, 0.505]}, {'name': 'rest', 'box': [-1e-6, -1e-6, -1e-6, 1 + 1e-6, 1 + 1e-6, 1e-6]}], 'strayMax': 0.0, 'n': [999998, 1000001]}
    case('mesh_uniform', ['obj/uniform.obj'], e, BW, '三角形の中で一様に散らしているか（部分の面積比）')
    # 22 色の補間（頂点が赤・緑・青 → 平均は (85,85,85)、各頂点の近くはその色）
    open(path('obj/interp.obj'), 'w').write('v 0 0 0 1 0 0\nv 1 0 0 0 1 0\nv 0 1 0 0 0 1\nf 1 2 3\n')
    e = {'rgb': True, 'color': [85, 85, 85], 'ctol': 1.5, 'parts': [{'name': 'nearR', 'box': [-1e-6, -1e-6, -1e-6, 0.05, 0.05, 1e-6], 'color': [242, 6, 6], 'ctol': 8}, {'name': 'rest', 'box': [-1e-6, -1e-6, -1e-6, 1 + 1e-6, 1 + 1e-6, 1e-6]}], 'strayMax': 0.0}
    case('mesh_interp', ['obj/interp.obj'], e, BW, '頂点色の補間（重心座標）')
    case('obj_vc_mixed', ['obj/vc_mixed.obj'], mesh_expect(P, color_override=[[255, 0, 0], [200, 200, 200]], extra={'rgb': True}), BW, '色のある頂点とない頂点の混在')


def pid_vertices(P, k):
    o = sum(len(p[0]) for p in P[:k])
    return np.arange(o, o + len(P[k][0]))


# ---------------------------------------------------------------- STL
def stl_binary(V, T, header=b'', attrs=None):
    h = header[:80].ljust(80, b'\0')
    out = [h, struct.pack('<I', len(T))]
    for i, t in enumerate(T):
        a, b, c = V[t[0]], V[t[1]], V[t[2]]
        n = np.cross(b - a, c - a); ln = np.linalg.norm(n); n = n / ln if ln else n
        out.append(struct.pack('<12fH', *n, *a, *b, *c, attrs[i] if attrs is not None else 0))
    return b''.join(out)


def stl_ascii(V, T, kw=('solid', 'facet normal', 'outer loop', 'vertex', 'endloop', 'endfacet', 'endsolid'), name='boxes', nl='\n', fmt='%.6f', indent='  '):
    s = [f'{kw[0]} {name}']
    for t in T:
        a, b, c = V[t[0]], V[t[1]], V[t[2]]
        n = np.cross(b - a, c - a); ln = np.linalg.norm(n); n = n / ln if ln else n
        s.append(f'{indent}{kw[1]} ' + ' '.join(fmt % x for x in n))
        s.append(f'{indent * 2}{kw[2]}')
        for p in (a, b, c): s.append(f'{indent * 3}{kw[3]} ' + ' '.join(fmt % x for x in p))
        s.append(f'{indent * 2}{kw[4]}')
        s.append(f'{indent}{kw[5]}')
    s.append(f'{kw[6]} {name}')
    return nl.join(s) + nl


def gen_stl():
    P = two_boxes()
    V, T, C, pid = merge(P)
    P0 = [(a, b, None, n) for a, b, c, n in P]
    e0 = mesh_expect(P0, vertex_count=len(T) * 3, extra={'rgb': False})
    open(path('stl/bin.stl'), 'wb').write(stl_binary(V, T, b'binary two boxes'))
    case('stl_bin', ['stl/bin.stl'], {**e0, 'fmt': 'バイナリ'}, BW, 'バイナリ STL')
    open(path('stl/bin_solid.stl'), 'wb').write(stl_binary(V, T, b'solid twoboxes exported by CAD'))
    case('stl_bin_solid', ['stl/bin_solid.stl'], {**e0, 'fmt': 'バイナリ'}, BW, '先頭が solid で始まるバイナリ STL')
    open(path('stl/bin_trailing.stl'), 'wb').write(stl_binary(V, T, b'binary') + b'\0\0')
    case('stl_bin_trailing', ['stl/bin_trailing.stl'], {**e0, 'fmt': 'バイナリ'}, BW, '最後に余分な 2 バイトがあるバイナリ STL')
    # 色: VisCAM/SolidView 方式（bit15=1 が「色あり」、bit0-4 = 青、5-9 = 緑、10-14 = 赤）
    def vis(r, g, b): return 0x8000 | (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
    attrs = [vis(255, 0, 0) if p == 0 else vis(0, 0, 255) for p in pid]
    open(path('stl/color_viscam.stl'), 'wb').write(stl_binary(V, T, b'VisCAM colored', attrs))
    case('stl_color_viscam', ['stl/color_viscam.stl'], mesh_expect(P, vertex_count=len(T) * 3, color_override=[[248, 0, 0], [0, 0, 248]], extra={'rgb': True}), BW, '色付きバイナリ STL（VisCAM/SolidView 方式: 赤が上位ビット）')
    # 色: Materialise Magics 方式（見出しに COLOR=、bit15=0 が「面ごとの色」、bit0-4 = 赤）
    def mag(r, g, b): return (b >> 3) << 10 | (g >> 3) << 5 | (r >> 3)
    attrs = [mag(255, 0, 0) if p == 0 else mag(0, 0, 255) for p in pid]
    hdr = b'COLOR=' + bytes([128, 128, 128, 255]) + b' MATERIAL=' + bytes([128, 128, 128, 255] * 3)
    open(path('stl/color_magics.stl'), 'wb').write(stl_binary(V, T, hdr, attrs))
    case('stl_color_magics', ['stl/color_magics.stl'], mesh_expect(P, vertex_count=len(T) * 3, color_override=[[248, 0, 0], [0, 0, 248]], extra={'rgb': True}), BW, '色付きバイナリ STL（Materialise Magics 方式）')
    open(path('stl/ascii.stl'), 'w').write(stl_ascii(V, T))
    case('stl_ascii', ['stl/ascii.stl'], {**e0, 'fmt': '文字'}, BW, '文字の STL')
    open(path('stl/ascii_upper.stl'), 'w').write(stl_ascii(V, T, kw=('SOLID', 'FACET NORMAL', 'OUTER LOOP', 'VERTEX', 'ENDLOOP', 'ENDFACET', 'ENDSOLID')))
    case('stl_ascii_upper', ['stl/ascii_upper.stl'], {**e0, 'fmt': '文字'}, BW, '大文字のキーワード（SOLID/FACET/VERTEX）')
    s = stl_ascii(V, T, nl='\r\n', fmt='%.6E', indent='\t').replace('vertex ', 'vertex   ')
    open(path('stl/ascii_ws.stl'), 'w', newline='').write(s.rstrip('\r\n'))
    case('stl_ascii_ws', ['stl/ascii_ws.stl'], {**e0, 'fmt': '文字'}, BW, 'タブ・余分な空白・指数表記・CRLF・最後の改行なし')
    s = stl_ascii(P[0][0], P[0][1], name='A') + stl_ascii(P[1][0], P[1][1], name='B')
    open(path('stl/ascii_multi.stl'), 'w').write(s)
    case('stl_ascii_multi', ['stl/ascii_multi.stl'], {**e0, 'fmt': '文字'}, BW, '複数の solid')
    open(path('stl/bin_zero.stl'), 'wb').write(stl_binary(V, T[:0], b'empty'))
    case('stl_bin_zero', ['stl/bin_zero.stl'], {'error': '点がありません|三角形がありません|空'}, BW, '三角形 0 個のバイナリ STL')


# ---------------------------------------------------------------- OFF
def gen_off():
    P = two_boxes()
    V, T, C, pid = merge(P)
    P0 = [(a, b, None, n) for a, b, c, n in P]
    e0 = mesh_expect(P0, extra={'rgb': False})

    def body(vl, faces):
        return '\n'.join(vl) + '\n' + '\n'.join(faces) + '\n'
    faces = ['3 ' + ' '.join(str(int(k)) for k in t) for t in T]
    vl = [' '.join('%.6f' % x for x in v) for v in V]
    open(path('off/basic.off'), 'w').write('OFF\n# comment\n\n%d %d 0\n' % (len(V), len(T)) + body(vl, faces))
    case('off_basic', ['off/basic.off'], e0, BW, 'OFF（注釈・空行つき）')
    open(path('off/inline.off'), 'w').write('OFF %d %d 0\n' % (len(V), len(T)) + body(vl, faces))
    case('off_inline', ['off/inline.off'], e0, BW, 'OFF と個数が同じ行')
    # COFF 0〜255（暗い頂点を含む）
    Cb = C.copy(); Cb[pid_vertices(P, 0)] = [200, 30, 30]
    Bv = pid_vertices(P, 1); Cb[Bv] = [1, 1, 1]; Cb[Bv[:2]] = [0, 1, 0]
    vl2 = [' '.join('%.6f' % x for x in v) + ' %d %d %d 255' % tuple(Cb[i]) for i, v in enumerate(V)]
    open(path('off/coff255.off'), 'w').write('COFF\n%d %d 0\n' % (len(V), len(T)) + body(vl2, faces))
    case('off_coff255', ['off/coff255.off'], mesh_expect(P, color_override=[[200, 30, 30], [0.75, 1, 0.75]], ctol=6, extra={'rgb': True}), BW, 'COFF（色 0〜255、暗い頂点を含む）')
    vl3 = [' '.join('%.6f' % x for x in v) + ' %.4f %.4f %.4f 1' % tuple(C[i] / 255) for i, v in enumerate(V)]
    open(path('off/cofff.off'), 'w').write('COFF\n%d %d 0\n' % (len(V), len(T)) + body(vl3, faces))
    case('off_cofff', ['off/cofff.off'], mesh_expect(P, extra={'rgb': True}), BW, 'COFF（色 0〜1）')
    # NOFF（法線つき）
    nrm = V - V.mean(0); nrm /= np.linalg.norm(nrm, axis=1)[:, None]
    vl4 = [' '.join('%.6f' % x for x in v) + ' ' + ' '.join('%.6f' % x for x in nrm[i]) for i, v in enumerate(V)]
    open(path('off/noff.off'), 'w').write('NOFF\n%d %d 0\n' % (len(V), len(T)) + body(vl4, faces))
    case('off_noff', ['off/noff.off'], e0, BW, 'NOFF（頂点に法線）')
    vl5 = [' '.join('%.6f' % x for x in v) + ' ' + ' '.join('%.6f' % x for x in nrm[i]) + ' %d %d %d 255' % tuple(C[i]) for i, v in enumerate(V)]
    open(path('off/cnoff.off'), 'w').write('CNOFF\n%d %d 0\n' % (len(V), len(T)) + body(vl5, faces))
    case('off_cnoff', ['off/cnoff.off'], mesh_expect(P, extra={'rgb': True}), BW, 'CNOFF（法線と色）')
    # 四角形の面・面の色
    a = box(0, 0, 0, 1, 1, 1)
    quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    open(path('off/quads.off'), 'w').write('OFF\n8 6 12\n' + '\n'.join(' '.join('%g' % x for x in v) for v in a[0]) + '\n' + '\n'.join('4 ' + ' '.join(map(str, q)) + ' 255 0 0' for q in quads) + '\n')
    case('off_quads', ['off/quads.off'], mesh_expect([(a[0], a[1], None, 'A')], extra={'rgb': False}), BW, '四角形の面（面の色つき）')
    # バイナリ OFF
    b = b'OFF BINARY\n' + struct.pack('>3i', len(V), len(T), 0) + V.astype('>f4').tobytes() + b''.join(struct.pack('>4i', 3, *map(int, t)) + struct.pack('>i', 0) for t in T)
    open(path('off/binary.off'), 'wb').write(b)
    case('off_binary', ['off/binary.off'], {'error': '.'}, BW, 'バイナリ OFF（対応外なら分かる知らせ）')


# ---------------------------------------------------------------- VTK
def gen_vtk():
    P = two_boxes()
    V, T, C, pid = merge(P)
    P0 = [(a, b, None, n) for a, b, c, n in P]
    nv, nt = len(V), len(T)
    hdr = '# vtk DataFile Version 3.0\ntest\n'
    pts = 'POINTS %d float\n' % nv + '\n'.join(' '.join('%.6f' % x for x in v) for v in V) + '\n'
    polys = 'POLYGONS %d %d\n' % (nt, nt * 4) + '\n'.join('3 ' + ' '.join(map(str, t)) for t in T) + '\n'
    cols = 'POINT_DATA %d\nCOLOR_SCALARS RGB 3\n' % nv + '\n'.join(' '.join('%.4f' % (c / 255) for c in C[i]) for i in range(nv)) + '\n'
    open(path('vtk/ascii.vtk'), 'w').write(hdr + 'ASCII\nDATASET POLYDATA\n' + pts + polys + cols)
    case('vtk_ascii', ['vtk/ascii.vtk'], mesh_expect(P, extra={'rgb': True}), BW, 'ASCII・POLYDATA・POLYGONS・COLOR_SCALARS')
    open(path('vtk/crlf.vtk'), 'wb').write((hdr + 'ASCII\nDATASET POLYDATA\n' + pts + polys + cols).replace('\n', '\r\n').encode())
    case('vtk_crlf', ['vtk/crlf.vtk'], mesh_expect(P, extra={'rgb': True}), BW, 'CRLF の改行')
    # バイナリ（ビッグエンディアン）
    b = (hdr + 'BINARY\nDATASET POLYDATA\nPOINTS %d float\n' % nv).encode() + V.astype('>f4').tobytes() + b'\n'
    b += ('POLYGONS %d %d\n' % (nt, nt * 4)).encode() + np.hstack([np.full((nt, 1), 3), T]).astype('>i4').tobytes() + b'\n'
    b += ('POINT_DATA %d\nCOLOR_SCALARS RGB 3\n' % nv).encode() + C.astype('u1').tobytes() + b'\n'
    open(path('vtk/binary.vtk'), 'wb').write(b)
    case('vtk_binary', ['vtk/binary.vtk'], mesh_expect(P, extra={'rgb': True}), BW, 'BINARY（float・int・uchar の色）')
    b = (hdr + 'BINARY\nDATASET POLYDATA\nPOINTS %d double\n' % nv).encode() + V.astype('>f8').tobytes() + b'\n'
    b += ('POLYGONS %d %d\n' % (nt, nt * 4)).encode() + np.hstack([np.full((nt, 1), 3), T]).astype('>i4').tobytes() + b'\n'
    open(path('vtk/binary_double.vtk'), 'wb').write(b)
    case('vtk_binary_double', ['vtk/binary_double.vtk'], mesh_expect(P0, extra={'rgb': False}), BW, 'BINARY・double の座標')
    # 三角形の帯（箱の側面 4 枚を 1 本の帯、上下は別の帯）
    def strips_for_box(o, x0, y0, z0, x1, y1, z1):
        s = [[o + 0, o + 4, o + 1, o + 5, o + 2, o + 6, o + 3, o + 7, o + 0, o + 4], [o + 0, o + 1, o + 3, o + 2], [o + 4, o + 5, o + 7, o + 6]]
        return s
    S = strips_for_box(0, 0, 0, 0, 1, 1, 1) + strips_for_box(8, 3, 0, 0, 5, 2, 1)
    size = sum(len(s) + 1 for s in S)
    open(path('vtk/strips.vtk'), 'w').write(hdr + 'ASCII\nDATASET POLYDATA\n' + pts + 'TRIANGLE_STRIPS %d %d\n' % (len(S), size) + '\n'.join(str(len(s)) + ' ' + ' '.join(map(str, s)) for s in S) + '\n')
    case('vtk_strips', ['vtk/strips.vtk'], mesh_expect(P0, extra={'rgb': False}), BW, 'TRIANGLE_STRIPS')
    # UNSTRUCTURED_GRID: 三角形(5)・四角形(9)・多角形(7)
    cells, types = [], []
    for t in T[pid == 0]: cells.append([3, *t]); types.append(5)
    Bq = [[8, 11, 10, 9], [12, 13, 14, 15], [8, 9, 13, 12], [9, 10, 14, 13], [10, 11, 15, 14], [11, 8, 12, 15]]
    for k, q in enumerate(Bq): cells.append([4, *q]); types.append(9 if k % 2 else 7)
    size = sum(len(c) for c in cells)
    open(path('vtk/ugrid.vtk'), 'w').write(hdr + 'ASCII\nDATASET UNSTRUCTURED_GRID\n' + pts.replace('float', 'float') + 'CELLS %d %d\n' % (len(cells), size) + '\n'.join(' '.join(map(str, c)) for c in cells) + '\nCELL_TYPES %d\n' % len(types) + '\n'.join(map(str, types)) + '\n' + cols)
    case('vtk_ugrid', ['vtk/ugrid.vtk'], mesh_expect(P, extra={'rgb': True}), BW, 'UNSTRUCTURED_GRID（三角形・四角形・多角形）')
    # CELL_DATA（面ごとの値）が POINT_DATA より前
    celld = 'CELL_DATA %d\nSCALARS cellid int 1\nLOOKUP_TABLE default\n' % nt + '\n'.join(str(i) for i in range(nt)) + '\n'
    open(path('vtk/celldata.vtk'), 'w').write(hdr + 'ASCII\nDATASET POLYDATA\n' + pts + polys + celld + cols)
    case('vtk_celldata', ['vtk/celldata.vtk'], mesh_expect(P, extra={'rgb': True}), BW, 'CELL_DATA（面ごとの値）のあとに POINT_DATA の色')
    cb = ('CELL_DATA %d\nSCALARS cellid int 1\nLOOKUP_TABLE default\n' % nt).encode() + np.arange(nt).astype('>i4').tobytes() + b'\n'
    b = (hdr + 'BINARY\nDATASET POLYDATA\nPOINTS %d float\n' % nv).encode() + V.astype('>f4').tobytes() + b'\n'
    b += ('POLYGONS %d %d\n' % (nt, nt * 4)).encode() + np.hstack([np.full((nt, 1), 3), T]).astype('>i4').tobytes() + b'\n' + cb
    b += ('POINT_DATA %d\nCOLOR_SCALARS RGB 3\n' % nv).encode() + C.astype('u1').tobytes() + b'\n'
    open(path('vtk/celldata_bin.vtk'), 'wb').write(b)
    case('vtk_celldata_bin', ['vtk/celldata_bin.vtk'], mesh_expect(P, extra={'rgb': True}), BW, 'BINARY で CELL_DATA のあとに POINT_DATA の色')
    # 面が点より少ない（四角形 12 枚・点 16 個）ときの CELL_DATA
    Aq = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    Q = Aq + [[k + 8 for k in q] for q in Aq]
    pq = 'POLYGONS %d %d\n' % (len(Q), len(Q) * 5) + '\n'.join('4 ' + ' '.join(map(str, q)) for q in Q) + '\n'
    celld = 'CELL_DATA %d\nSCALARS cellid int 1\nLOOKUP_TABLE default\n' % len(Q) + '\n'.join(str(i) for i in range(len(Q))) + '\n'
    open(path('vtk/celldata_few.vtk'), 'w').write(hdr + 'ASCII\nDATASET POLYDATA\n' + pts + pq + celld + cols)
    case('vtk_celldata_few', ['vtk/celldata_few.vtk'], mesh_expect(P, extra={'rgb': True}), BW, 'CELL_DATA（面 12 < 点 16）のあとに POINT_DATA の色')
    # VTK 5.1（VTK 9 の既定。OFFSETS / CONNECTIVITY）
    offs = list(range(0, nt * 3 + 1, 3))
    p51 = 'POLYGONS %d %d\nOFFSETS vtktypeint64\n' % (nt + 1, nt * 3) + ' '.join(map(str, offs)) + '\nCONNECTIVITY vtktypeint64\n' + ' '.join(str(int(k)) for k in T.ravel()) + '\n'
    open(path('vtk/v51_ascii.vtk'), 'w').write('# vtk DataFile Version 5.1\ntest\nASCII\nDATASET POLYDATA\n' + pts + p51 + cols)
    case('vtk51_ascii', ['vtk/v51_ascii.vtk'], mesh_expect(P, extra={'rgb': True}), BW, 'VTK 5.1 形式（OFFSETS/CONNECTIVITY、ASCII）')
    b = ('# vtk DataFile Version 5.1\ntest\nBINARY\nDATASET POLYDATA\nPOINTS %d float\n' % nv).encode() + V.astype('>f4').tobytes() + b'\n'
    b += ('POLYGONS %d %d\nOFFSETS vtktypeint64\n' % (nt + 1, nt * 3)).encode() + np.array(offs).astype('>i8').tobytes() + b'\nCONNECTIVITY vtktypeint64\n' + T.ravel().astype('>i8').tobytes() + b'\n'
    open(path('vtk/v51_binary.vtk'), 'wb').write(b)
    case('vtk51_binary', ['vtk/v51_binary.vtk'], mesh_expect(P0, extra={'rgb': False}), BW, 'VTK 5.1 形式（BINARY・vtktypeint64）')
    # 点だけ＋スカラー（強度）＋ FIELD
    rng = np.random.default_rng(1)
    Q = rng.uniform(0, 10, (500, 3)); I = np.linspace(0, 99, 500)
    s = hdr + 'ASCII\nDATASET POLYDATA\nPOINTS 500 float\n' + '\n'.join(' '.join('%.5f' % x for x in q) for q in Q) + '\nVERTICES 500 1000\n' + '\n'.join('1 %d' % i for i in range(500)) + '\n'
    s += 'POINT_DATA 500\nSCALARS Intensity float 1\nLOOKUP_TABLE default\n' + '\n'.join('%.3f' % v for v in I) + '\n'
    s += 'FIELD FieldData 2\nreturns 1 500 int\n' + ' '.join(str(i % 3 + 1) for i in range(500)) + '\nnormals2 3 500 float\n' + ' '.join('0 0 1' for i in range(500)) + '\n'
    open(path('vtk/points.vtk'), 'w').write(s)
    case('vtk_points', ['vtk/points.vtk'], {'n': [500, 500], 'bbox': [Q.min(0).tolist(), Q.max(0).tolist()], 'tol': 1e-4, 'fields': ['intensity', 'returns'], 'fieldRange': {'intensity': [0, 99, 1e-3], 'returns': [1, 3, 0]}}, BW, '点だけ・SCALARS と FIELD')
    # SCALARS（3 成分の色 unsigned_char）
    s = hdr + 'ASCII\nDATASET POLYDATA\nPOINTS 500 float\n' + '\n'.join(' '.join('%.5f' % x for x in q) for q in Q) + '\nPOINT_DATA 500\nSCALARS rgb_colors unsigned_char 3\nLOOKUP_TABLE default\n' + '\n'.join('255 0 0' for i in range(500)) + '\n'
    open(path('vtk/points_rgbscalars.vtk'), 'w').write(s)
    case('vtk_points_rgbscalars', ['vtk/points_rgbscalars.vtk'], {'n': [500, 500], 'bbox': [Q.min(0).tolist(), Q.max(0).tolist()], 'tol': 1e-4}, BW, 'SCALARS rgb_colors unsigned_char 3（3 成分。少なくとも誤らずに読めること）')
    # LINES
    LV = np.array([[0, 0, 0], [10, 0, 0], [10, 10, 0]], float)
    s = hdr + 'ASCII\nDATASET POLYDATA\nPOINTS 3 float\n' + '\n'.join(' '.join('%g' % x for x in v) for v in LV) + '\nLINES 1 4\n3 0 1 2\n'
    open(path('vtk/lines.vtk'), 'w').write(s)
    case('vtk_lines', ['vtk/lines.vtk'], {'n': [290000, 300010], 'bbox': [[0, 0, 0], [10, 10, 0]], 'parts': [{'name': 's1', 'box': [-1e-6, -1e-6, -1e-6, 10 + 1e-6, 1e-6, 1e-6]}, {'name': 's2', 'box': [10 - 1e-6, -1e-6, -1e-6, 10 + 1e-6, 10 + 1e-6, 1e-6]}], 'strayMax': 0.0}, BW, 'LINES')
    # METADATA（VTK 9 が配列のあとに書く）
    meta = 'METADATA\nINFORMATION 0\n\n'
    s = hdr + 'ASCII\nDATASET POLYDATA\n' + pts + meta + polys + 'POINT_DATA %d\nCOLOR_SCALARS RGB 3\n' % nv + '\n'.join(' '.join('%.4f' % (c / 255) for c in C[i]) for i in range(nv)) + '\n' + meta
    open(path('vtk/metadata.vtk'), 'w').write(s)
    case('vtk_metadata', ['vtk/metadata.vtk'], mesh_expect(P, extra={'rgb': True}), BW, 'METADATA の塊（VTK 9）')


if __name__ == '__main__':
    gen_obj(); gen_stl(); gen_off(); gen_vtk()
    save()
