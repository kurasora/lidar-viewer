# PLY の試験用ファイル（頭書き・本体を自分で書く。型・並び・要素を自由に変える）
import numpy as np
from common import *

NP = {'char': 'i1', 'int8': 'i1', 'uchar': 'u1', 'uint8': 'u1', 'short': 'i2', 'int16': 'i2', 'ushort': 'u2', 'uint16': 'u2',
      'int': 'i4', 'int32': 'i4', 'uint': 'u4', 'uint32': 'u4', 'float': 'f4', 'float32': 'f4', 'double': 'f8', 'float64': 'f8'}


def write_ply(fn, fmt, elements, comments=(), nl='\n'):
    """elements: [(名前, [(型, 名前) or ('list', 個数の型, 値の型, 名前)], 行のリスト)]
    行: スカラーは値、list は値の配列"""
    h = ['ply', f'format {fmt} 1.0'] + [f'comment {c}' for c in comments]
    for nm, props, rows in elements:
        h.append(f'element {nm} {len(rows)}')
        for p in props:
            h.append(f'property list {p[1]} {p[2]} {p[3]}' if p[0] == 'list' else f'property {p[0]} {p[1]}')
    h.append('end_header')
    out = bytearray((nl.join(h) + nl).encode())
    end = '<' if fmt == 'binary_little_endian' else '>'
    for nm, props, rows in elements:
        if fmt == 'ascii':
            lines = []
            for r in rows:
                w = []
                for p, v in zip(props, r):
                    if p[0] == 'list': w += [str(len(v))] + [repr(float(x)) if NP[p[2]][0] == 'f' else str(int(x)) for x in v]
                    else: w.append(repr(float(v)) if NP[p[0]][0] == 'f' else str(int(v)))
                lines.append(' '.join(w))
            out += (nl.join(lines) + nl).encode()
        else:
            if all(p[0] != 'list' for p in props):
                dt = np.dtype([(f'f{i}', end + NP[p[0]]) for i, p in enumerate(props)])
                a = np.zeros(len(rows), dt)
                cols = list(zip(*rows)) if rows else []
                for i in range(len(props)): a[f'f{i}'] = np.array(cols[i]) if rows else []
                out += a.tobytes()
            else:
                for r in rows:
                    for p, v in zip(props, r):
                        if p[0] == 'list':
                            out += np.array([len(v)], end + NP[p[1]]).tobytes() + np.array(v, end + NP[p[2]]).tobytes()
                        else:
                            out += np.array([v], end + NP[p[0]]).tobytes()
    open(fn, 'wb').write(bytes(out))


def rows_of(*cols):
    return list(zip(*cols))


def gen():
    n = N0
    P32 = f32(P0)
    X, Y, Z = P0.T
    base_props = [('float', 'x'), ('float', 'y'), ('float', 'z'), ('uchar', 'red'), ('uchar', 'green'), ('uchar', 'blue'), ('float', 'scalar_Intensity')]
    base_rows = rows_of(X, Y, Z, RGB0[:, 0], RGB0[:, 1], RGB0[:, 2], I0)
    # 1) 3 つの形式
    for fmt, tag in (('ascii', 'ascii'), ('binary_little_endian', 'ble'), ('binary_big_endian', 'bbe')):
        write_ply(path(f'ply/basic_{tag}.ply'), fmt, [('vertex', base_props, base_rows)])
        Pexp = P32 if fmt != 'ascii' else P0  # ascii は double の 17 桁で書いている
        case(f'ply/basic_{tag}', [f'ply/basic_{tag}.ply'], f'x y z（float）+ uchar の色 + scalar_Intensity（{fmt}）', P=Pexp, C=RGB0, F={'intensity': I0}, rgb=True)
    # 2) 型の別名（x y z の型）
    for ty in NP:
        k = NP[ty]
        if k[0] == 'f': vals = P0
        elif k in ('i1',): vals = np.round(P0)
        elif k in ('u1',): vals = np.round(P0 + 12)
        elif k in ('i2',): vals = np.round(P0 * 100)
        elif k in ('u2',): vals = np.round((P0 + 12) * 100)
        else: vals = np.round(P0 * 1000) if k[0] == 'i' else np.round((P0 + 12) * 1000)
        props = [(ty, 'x'), (ty, 'y'), (ty, 'z')]
        for fmt, tag in (('binary_little_endian', 'ble'), ('binary_big_endian', 'bbe'), ('ascii', 'ascii')):
            write_ply(path(f'ply/type_{ty}_{tag}.ply'), fmt, [('vertex', props, rows_of(*vals.T))])
            Pexp = vals.astype(np.float32).astype(float) if k == 'f4' and fmt != 'ascii' else vals
            case(f'ply/type_{ty}_{tag}', [f'ply/type_{ty}_{tag}.ply'], f'座標の型 {ty}（{fmt}）', P=Pexp, rgb=False)
    # 3) vertex より前に別の要素・vertex の中で x より前に list
    cam_props = [('float', 'view_px'), ('float', 'view_py'), ('float', 'view_pz'), ('int', 'viewport_w')]
    for fmt, tag in (('binary_little_endian', 'ble'), ('ascii', 'ascii'), ('binary_big_endian', 'bbe')):
        write_ply(path(f'ply/elem_before_vertex_{tag}.ply'), fmt, [('camera', cam_props, [(1.0, 2.0, 3.0, 640)]), ('vertex', base_props, base_rows)])
        case(f'ply/elem_before_vertex_{tag}', [f'ply/elem_before_vertex_{tag}.ply'], f'vertex の前に camera 要素（{fmt}）', P=P32 if fmt != 'ascii' else P0, C=RGB0, F={'intensity': I0}, rgb=True)
        props = [('list', 'uchar', 'float', 'extra'), ('float', 'x'), ('float', 'y'), ('float', 'z'), ('uchar', 'red'), ('uchar', 'green'), ('uchar', 'blue')]
        rows = [([0.5] * (i % 4), X[i], Y[i], Z[i], RGB0[i, 0], RGB0[i, 1], RGB0[i, 2]) for i in range(n)]
        write_ply(path(f'ply/list_before_x_{tag}.ply'), fmt, [('vertex', props, rows)])
        case(f'ply/list_before_x_{tag}', [f'ply/list_before_x_{tag}.ply'], f'vertex の中で x より前に list（長さ 0〜3）（{fmt}）', P=P32 if fmt != 'ascii' else P0, C=RGB0, rgb=True)
        # vertex の後ろに面が 0 枚・線（edge）の要素
        write_ply(path(f'ply/elem_after_{tag}.ply'), fmt, [('vertex', base_props, base_rows), ('face', [('list', 'uchar', 'int', 'vertex_indices')], []),
                                                         ('edge', [('int', 'vertex1'), ('int', 'vertex2')], [(0, 1), (1, 2)])])
        case(f'ply/elem_after_{tag}', [f'ply/elem_after_{tag}.ply'], f'vertex の後ろに face 0 枚と edge 要素（{fmt}）', P=P32 if fmt != 'ascii' else P0, C=RGB0, F={'intensity': I0}, rgb=True)
    # 4) 色の名前・型
    for nm, props_c, vals, exp in [
        ('rgb_short', [('uchar', 'r'), ('uchar', 'g'), ('uchar', 'b')], RGB0, RGB0),
        ('diffuse', [('uchar', 'diffuse_red'), ('uchar', 'diffuse_green'), ('uchar', 'diffuse_blue')], RGB0, RGB0),
        ('alpha', [('uchar', 'red'), ('uchar', 'green'), ('uchar', 'blue'), ('uchar', 'alpha')], np.hstack([RGB0, np.full((n, 1), 128)]), RGB0),
        ('float01', [('float', 'red'), ('float', 'green'), ('float', 'blue')], RGB0 / 255.0, RGB0),
        ('double01', [('double', 'red'), ('double', 'green'), ('double', 'blue')], RGB0 / 255.0, RGB0),
        ('ushort16', [('ushort', 'red'), ('ushort', 'green'), ('ushort', 'blue')], RGB0.astype(np.int64) * 257, RGB0),
    ]:
        props = [('float', 'x'), ('float', 'y'), ('float', 'z')] + props_c
        for fmt, tag in (('binary_little_endian', 'ble'), ('ascii', 'ascii')):
            write_ply(path(f'ply/color_{nm}_{tag}.ply'), fmt, [('vertex', props, rows_of(X, Y, Z, *np.asarray(vals).T))])
            note = {'float01': 'CloudCompare は ×255 して読む', 'double01': 'CloudCompare は ×255 して読む', 'ushort16': 'CloudCompare 2.11 も下位 8 bit を取る（同じ）'}.get(nm, '')
            case(f'ply/color_{nm}_{tag}', [f'ply/color_{nm}_{tag}.ply'], f'色 {nm}（{fmt}）', P=P32 if fmt != 'ascii' else P0, C=exp, rgb=True,
                 extra={'note': note, 'color_tol': 1 if nm in ('float01', 'double01') else 0})
    # 5) いろいろな値の欄（int・quality・法線は使わない）
    props = [('double', 'x'), ('double', 'y'), ('double', 'z'), ('float', 'nx'), ('float', 'ny'), ('float', 'nz'), ('int', 'label'), ('float', 'quality'), ('ushort', 'ring'), ('double', 'time')]
    lab = np.arange(n) % 17; ring = np.arange(n) % 64; tt = np.arange(n) * 0.001
    write_ply(path('ply/fields_ble.ply'), 'binary_little_endian', [('vertex', props, rows_of(X, Y, Z, np.zeros(n), np.zeros(n), np.ones(n), lab, I0, ring, tt))])
    case('ply/fields_ble', ['ply/fields_ble.ply'], '値の欄 label(int) quality(float) ring(ushort) time(double)、法線 nx ny nz', P=P0, F={'label': lab, 'quality': I0, 'ring': ring, 'time': tt}, rgb=False)
    # 6) 頭書きの揺れ（CRLF・comment・obj_info・大文字の X Y Z）
    write_ply(path('ply/crlf_ascii.ply'), 'ascii', [('vertex', base_props, base_rows)], comments=['made by test', 'second comment'], nl='\r\n')
    case('ply/crlf_ascii', ['ply/crlf_ascii.ply'], 'CRLF の ascii PLY（comment 2 行）', P=P0, C=RGB0, F={'intensity': I0}, rgb=True)
    write_ply(path('ply/crlf_ble.ply'), 'binary_little_endian', [('vertex', base_props, base_rows)], comments=['made by test'], nl='\r\n')
    case('ply/crlf_ble', ['ply/crlf_ble.ply'], 'CRLF の頭書き（binary_little_endian）', P=P32, C=RGB0, F={'intensity': I0}, rgb=True)
    s = open(path('ply/basic_ble.ply'), 'rb').read()
    s2 = s.replace(b'property float x\n', b'property float X\n').replace(b'property float y\n', b'property float Y\n').replace(b'property float z\n', b'property float Z\n').replace(b'format binary_little_endian 1.0\n', b'format binary_little_endian 1.0\nobj_info scanner XYZ\n')
    open(path('ply/upper_xyz_ble.ply'), 'wb').write(s2)
    case('ply/upper_xyz_ble', ['ply/upper_xyz_ble.ply'], '欄の名前が大文字 X Y Z・obj_info 行', P=P32, C=RGB0, F={'intensity': I0}, rgb=True)
    # 7) 大きな座標（double の UTM）→ グローバルシフトと 1 mm
    Q = P0 + UTM
    write_ply(path('ply/utm_double_ble.ply'), 'binary_little_endian', [('vertex', [('double', 'x'), ('double', 'y'), ('double', 'z')], rows_of(*Q.T))])
    case('ply/utm_double_ble', ['ply/utm_double_ble.ply'], 'UTM の座標（double）', P=Q, rgb=False, mm=True)
    # 最初の点が (0,0,0)、残りは UTM（スキャナーの無効な点が先頭に入っている場合）
    Q2 = Q.copy(); Q2[0] = 0
    write_ply(path('ply/first_origin_utm_ble.ply'), 'binary_little_endian', [('vertex', [('double', 'x'), ('double', 'y'), ('double', 'z')], rows_of(*Q2.T))])
    case('ply/first_origin_utm_ble', ['ply/first_origin_utm_ble.ply'], '最初の点だけ (0,0,0)、残りは UTM（double）', P=Q2, rgb=False, mm=True)
    # 8) 頂点 0 個
    write_ply(path('ply/empty_ble.ply'), 'binary_little_endian', [('vertex', base_props, [])])
    case('ply/empty_ble', ['ply/empty_ble.ply'], '頂点 0 個（正しい PLY）', error='.', extra={'note': '「点がありません」のような知らせが期待'})
    # 欄の名前に HTML（細工したファイル。画面の「情報」や欄の選択に名前がそのまま入らないか）
    evil = '<h1/style=color:red;font-size:40px>警告：このファイルは壊れています。修理ツールを入れてください</h1>'
    write_ply(path('ply/html_field_name_ble.ply'), 'binary_little_endian', [('vertex', [('float', 'x'), ('float', 'y'), ('float', 'z'), ('float', evil)], rows_of(X, Y, Z, I0))])
    case('ply/html_field_name_ble', ['ply/html_field_name_ble.ply'], '欄の名前が HTML の PLY（細工したファイル）', P=P32, rgb=False, extra={'note': '場面試験 html_field_name で画面への差し込みを確かめる'})
    xss = "<img/src=x/onerror=document.title='xss'>"
    write_ply(path('ply/xss_field_name_ble.ply'), 'binary_little_endian', [('vertex', [('float', 'x'), ('float', 'y'), ('float', 'z'), ('float', xss)], rows_of(X, Y, Z, I0))])
    case('ply/xss_field_name_ble', ['ply/xss_field_name_ble.ply'], '欄の名前に img の onerror（細工したファイル）', P=P32, rgb=False, extra={'note': 'bxss.js で実行されるかを確かめる'})
    # 9) 3D Gaussian Splatting の PLY（62 個の float の欄。色は f_dc_* で RGB ではない）
    names = ['x', 'y', 'z', 'nx', 'ny', 'nz'] + [f'f_dc_{i}' for i in range(3)] + [f'f_rest_{i}' for i in range(45)] + ['opacity'] + [f'scale_{i}' for i in range(3)] + [f'rot_{i}' for i in range(4)]
    vals = np.zeros((n, len(names))); vals[:, :3] = P0; vals[:, 6:9] = 0.3; vals[:, 54] = 0.9
    write_ply(path('ply/gsplat_ble.ply'), 'binary_little_endian', [('vertex', [('float', nm) for nm in names], [tuple(r) for r in vals])])
    case('ply/gsplat_ble', ['ply/gsplat_ble.ply'], '3D Gaussian Splatting の PLY（float の欄 62 個）', P=P32, rgb=False)
    # ascii で欄が 64 を超える（70 個）
    names70 = ['x', 'y', 'z'] + [f'v{i}' for i in range(67)]
    vals70 = np.zeros((n, 70)); vals70[:, :3] = P0; vals70[:, 69] = np.arange(n)
    write_ply(path('ply/many70_ascii.ply'), 'ascii', [('vertex', [('float', nm) for nm in names70], [tuple(r) for r in vals70])])
    case('ply/many70_ascii', ['ply/many70_ascii.ply'], 'ascii で欄が 70 個（最後の欄 v66 に 0〜4999）', P=P0, F={'v66': np.arange(n).astype(float)}, rgb=False)
