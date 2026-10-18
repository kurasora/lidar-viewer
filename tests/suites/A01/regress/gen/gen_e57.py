# E57 の試験用ファイル（pye57 の libe57（libE57Format）を直接使い、項目の型・ビット幅・pose を自由に決めて書く）
import uuid, math, numpy as np
import pye57
from pye57 import libe57 as L
from common import *


def quat(axis, ang):
    axis = np.array(axis, float) / np.linalg.norm(axis); s = math.sin(ang / 2)
    return np.array([math.cos(ang / 2), *(axis * s)])


def qmat(q):
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def write_e57(fn, scans):
    """scans: [{'fields': [(名前, 型, 値の配列)], 'pose': (q, t) or None, 'colorLimits': (lo, hi) or None, 'name': ...}]
    型: ('float', 'single'|'double', lo, hi) / ('int', lo, hi) / ('scaled', rawlo, rawhi, scale, offset) / ('int_default',)"""
    e = pye57.E57(fn, mode='w')
    imf = e.image_file
    for si, sc in enumerate(scans):
        node = L.StructureNode(imf)
        node.set('guid', L.StringNode(imf, '{%s}' % uuid.uuid4()))
        node.set('name', L.StringNode(imf, sc.get('name', f'scan{si}')))
        if sc.get('pose') is not None:
            q, t = sc['pose']
            pose = L.StructureNode(imf); node.set('pose', pose)
            if q is not None:
                rn = L.StructureNode(imf)
                for k, v in zip('wxyz', q): rn.set(k, L.FloatNode(imf, float(v)))
                pose.set('rotation', rn)
            if t is not None:
                tn = L.StructureNode(imf)
                for k, v in zip('xyz', t): tn.set(k, L.FloatNode(imf, float(v)))
                pose.set('translation', tn)
        if sc.get('colorLimits') is not None:
            lo, hi = sc['colorLimits']
            cb = L.StructureNode(imf)
            for c in ('Red', 'Green', 'Blue'):
                cb.set(f'color{c}Minimum', L.IntegerNode(imf, lo)); cb.set(f'color{c}Maximum', L.IntegerNode(imf, hi))
            node.set('colorLimits', cb)
        proto = L.StructureNode(imf)
        arrays = []
        for nm, ty, vals in sc['fields']:
            if ty[0] == 'float':
                prec = L.E57_SINGLE if ty[1] == 'single' else L.E57_DOUBLE
                proto.set(nm, L.FloatNode(imf, 0.0, prec, float(ty[2]), float(ty[3])))
                arr = np.array(vals, dtype=np.float64).copy(order="C")
            elif ty[0] == 'int':
                proto.set(nm, L.IntegerNode(imf, int(ty[1]), int(ty[1]), int(ty[2])))
                arr = np.array(vals, dtype=np.float64).copy(order="C")  # pye57 の SourceDestBuffer は int64（形式 l）を 4 バイトとして扱う不具合があるので、double で渡して変換させる
            elif ty[0] == 'int_default':
                proto.set(nm, L.IntegerNode(imf, 0))
                arr = np.array(vals, dtype=np.float64).copy(order="C")  # pye57 の SourceDestBuffer は int64（形式 l）を 4 バイトとして扱う不具合があるので、double で渡して変換させる
            elif ty[0] == 'scaled':
                proto.set(nm, L.ScaledIntegerNode(imf, int(ty[1]), int(ty[1]), int(ty[2]), float(ty[3]), float(ty[4])))
                arr = np.array(vals, dtype=np.float64).copy(order="C")
            arrays.append((nm, arr))
        n = len(arrays[0][1])
        codecs = L.VectorNode(imf, True)
        pts = L.CompressedVectorNode(imf, proto, codecs)
        node.set('points', pts)
        e.data3d.append(node)
        bufs = L.VectorSourceDestBuffer()
        for nm, arr in arrays: bufs.append(L.SourceDestBuffer(imf, nm, arr, n, True, True))
        if n:
            w = pts.writer(bufs); w.write(n); w.close()
    e.close()


def gen():
    n = N0
    P = P0.copy()
    lo, hi = P.min(0) - 1, P.max(0) + 1
    xyz = lambda prec, Q=P, a=lo, b=hi: [(f'cartesian{c}', ('float', prec, a[k], b[k]), Q[:, k]) for k, c in enumerate('XYZ')]

    # 1) 直交座標の符号化: double / single / ScaledInteger（0.1 mm）/ ビット幅が 8 の倍数でない ScaledInteger / Integer（mm）
    write_e57(path('e57/cart_double.e57'), [{'fields': xyz('double')}])
    case('e57/cart_double', ['e57/cart_double.e57'], '直交座標 Float double・pose なし', P=P, rgb=False)
    write_e57(path('e57/cart_single.e57'), [{'fields': xyz('single')}])
    case('e57/cart_single', ['e57/cart_single.e57'], '直交座標 Float single', P=f32(P), rgb=False)
    sc = 1e-4
    raw = np.round(P / sc)
    fl = [(f'cartesian{c}', ('scaled', int(raw[:, k].min()) - 3, int(raw[:, k].max()) + 3, sc, 0.0), raw[:, k] * sc) for k, c in enumerate('XYZ')]
    write_e57(path('e57/cart_scaled.e57'), [{'fields': fl}])
    case('e57/cart_scaled', ['e57/cart_scaled.e57'], f'直交座標 ScaledInteger（scale {sc}、ビット幅 {[int(np.ceil(np.log2(raw[:,k].max()-raw[:,k].min()+7))) for k in range(3)]}）', P=raw * sc, rgb=False)
    sc2 = 0.001; off2 = 5.0
    raw2 = np.round((P - off2) / sc2)
    fl = [(f'cartesian{c}', ('scaled', -1048576, 1048575, sc2, off2), raw2[:, k] * sc2 + off2) for k, c in enumerate('XYZ')]
    write_e57(path('e57/cart_scaled21.e57'), [{'fields': fl}])
    case('e57/cart_scaled21', ['e57/cart_scaled21.e57'], '直交座標 ScaledInteger 21 bit（scale 0.001、offset 5、範囲 ±2^20）', P=raw2 * sc2 + off2, rgb=False)
    rawi = np.round(P * 1000).astype(np.int64)
    fl = [(f'cartesian{c}', ('int', -20000, 100000), rawi[:, k]) for k, c in enumerate('XYZ')]
    write_e57(path('e57/cart_integer.e57'), [{'fields': fl}])
    case('e57/cart_integer', ['e57/cart_integer.e57'], '直交座標 Integer（-20000〜100000、17 bit。単位は書かれた整数のまま）', P=rawi.astype(float), rgb=False)

    # 2) 球座標（double / range だけ ScaledInteger）
    r = np.linalg.norm(P, axis=1); az = np.arctan2(P[:, 1], P[:, 0]); el = np.arcsin(P[:, 2] / r)
    sph = [('sphericalRange', ('float', 'double', 0, 200), r), ('sphericalAzimuth', ('float', 'double', -math.pi, math.pi), az), ('sphericalElevation', ('float', 'double', -math.pi / 2, math.pi / 2), el)]
    write_e57(path('e57/sph_double.e57'), [{'fields': sph}])
    case('e57/sph_double', ['e57/sph_double.e57'], '球座標（range・azimuth・elevation が double）', P=P, rgb=False)
    rr = np.round(r / 1e-4)
    sph2 = [('sphericalRange', ('scaled', 0, int(rr.max()) + 1, 1e-4, 0.0), rr * 1e-4), ('sphericalAzimuth', ('float', 'single', -4, 4), az), ('sphericalElevation', ('float', 'single', -2, 2), el)]
    write_e57(path('e57/sph_scaled.e57'), [{'fields': sph2}])
    az32, el32 = az.astype(np.float32).astype(float), el.astype(np.float32).astype(float); R2 = rr * 1e-4
    Psph = np.stack([R2 * np.cos(el32) * np.cos(az32), R2 * np.cos(el32) * np.sin(az32), R2 * np.sin(el32)], 1)
    case('e57/sph_scaled', ['e57/sph_scaled.e57'], '球座標（range が ScaledInteger、角度が single）', P=Psph, rgb=False)

    # 3) invalidState（0 = 有効、1 = 方向だけ有効、2 = 無効）
    st = np.zeros(n, np.int64); st[::7] = 2; st[3::11] = 1
    write_e57(path('e57/invalid_cart.e57'), [{'fields': xyz('double') + [('cartesianInvalidState', ('int', 0, 2), st)]}])
    case('e57/invalid_cart', ['e57/invalid_cart.e57'], 'cartesianInvalidState（2 を 715 点、1 を 455 点）', P=P[st == 0], rgb=False, extra={'note': '1（方向だけ有効）・2 の点を除くのは CloudCompare と同じ'})
    write_e57(path('e57/invalid_sph.e57'), [{'fields': sph + [('sphericalInvalidState', ('int', 0, 2), st)]}])
    case('e57/invalid_sph', ['e57/invalid_sph.e57'], 'sphericalInvalidState', P=P[st == 0], rgb=False)

    # 4) 複数スキャン + pose（回転と平行移動）。3 つに分け、それぞれ違う pose
    parts = np.array_split(np.arange(n), 3)
    poses = [(quat([0, 0, 1], 0.6), np.array([12.0, -3.0, 0.5])), (quat([1, 2, 3], 1.1), np.array([-5.0, 7.0, 2.0])), (None, np.array([100.0, 0, 0]))]
    scans = []
    for (q, t), ix in zip(poses, parts):
        R = qmat(q) if q is not None else np.eye(3)
        loc = (P[ix] - t) @ R
        scans.append({'fields': [(f'cartesian{c}', ('float', 'double', -500, 500), loc[:, k]) for k, c in enumerate('XYZ')], 'pose': (q, t)})
    write_e57(path('e57/multi_pose.e57'), scans)
    case('e57/multi_pose', ['e57/multi_pose.e57'], 'スキャン 3 つ（z 回転＋移動、斜めの軸の回転＋移動、移動だけ）', P=P, rgb=False)
    # 回転の四元数が単位でない（書き手の丸め。正規化して使うのが普通）
    q = quat([0, 0, 1], 0.6) * 1.000001
    loc = (P - [1.0, 2.0, 3.0]) @ qmat(q)
    write_e57(path('e57/pose_unnormalized.e57'), [{'fields': [(f'cartesian{c}', ('float', 'double', -500, 500), loc[:, k]) for k, c in enumerate('XYZ')], 'pose': (q, [1.0, 2.0, 3.0])}])
    case('e57/pose_unnormalized', ['e57/pose_unnormalized.e57'], 'pose の四元数の長さが 1.000001', P=P, rgb=False)

    # 5) 色: 8 bit（colorLimits 0〜255）、16 bit（colorLimits 0〜65535）、colorLimits なし（項目の範囲 0〜255）
    col = lambda C, lo_, hi_: [(f'color{c}', ('int', lo_, hi_), C[:, k]) for k, c in enumerate(['Red', 'Green', 'Blue'])]
    write_e57(path('e57/color8.e57'), [{'fields': xyz('double') + col(RGB0.astype(np.int64), 0, 255), 'colorLimits': (0, 255)}])
    case('e57/color8', ['e57/color8.e57'], '色 8 bit（colorLimits 0〜255）', P=P, C=RGB0, rgb=True)
    write_e57(path('e57/color16.e57'), [{'fields': xyz('double') + col(RGB0.astype(np.int64) * 257, 0, 65535), 'colorLimits': (0, 65535)}])
    case('e57/color16', ['e57/color16.e57'], '色 16 bit（colorLimits 0〜65535、値は 8 bit×257）', P=P, C=RGB0, rgb=True)
    write_e57(path('e57/color_nolimits.e57'), [{'fields': xyz('double') + col(RGB0.astype(np.int64), 0, 255)}])
    case('e57/color_nolimits', ['e57/color_nolimits.e57'], '色 8 bit（colorLimits なし、項目の範囲 0〜255）', P=P, C=RGB0, rgb=True)
    # 色の範囲が 0〜255 だが、項目の型の範囲は 0〜65535（16 bit で持つ書き手）
    write_e57(path('e57/color_proto16_lim255.e57'), [{'fields': xyz('double') + col(RGB0.astype(np.int64), 0, 65535), 'colorLimits': (0, 255)}])
    case('e57/color_proto16_lim255', ['e57/color_proto16_lim255.e57'], '色: 項目は 0〜65535、colorLimits は 0〜255（値は 8 bit）', P=P, C=RGB0, rgb=True)
    # 1 つ目のスキャンは色なし、2 つ目は色あり
    write_e57(path('e57/color_mixed.e57'), [{'fields': [(f'cartesian{c}', ('float', 'double', -500, 500), P[:2500, k]) for k, c in enumerate('XYZ')]},
                                            {'fields': [(f'cartesian{c}', ('float', 'double', -500, 500), P[2500:, k]) for k, c in enumerate('XYZ')] + col(RGB0[2500:].astype(np.int64), 0, 255), 'colorLimits': (0, 255)}])
    Cm = RGB0.copy(); Cm[:2500] = 200
    case('e57/color_mixed', ['e57/color_mixed.e57'], 'スキャン 1 は色なし・スキャン 2 は色あり（色なしは灰色 200 になる作り）', P=P, C=Cm, rgb=True)

    # 6) 強度: Float（0〜1）、Integer 11 bit（0〜2047）、ScaledInteger
    Ii = (I0 * 12).astype(np.int64)
    write_e57(path('e57/intensity.e57'), [{'fields': xyz('double') + [('intensity', ('int', 0, 2047), Ii)]}])
    case('e57/intensity', ['e57/intensity.e57'], '強度 Integer 0〜2047（11 bit）', P=P, F={'intensity': Ii.astype(float)}, rgb=False)
    write_e57(path('e57/intensity_float.e57'), [{'fields': xyz('double') + [('intensity', ('float', 'single', 0, 1), I0 / 255)]}])
    case('e57/intensity_float', ['e57/intensity_float.e57'], '強度 Float single 0〜1', P=P, F={'intensity': f32(I0 / 255)}, rgb=False)
    write_e57(path('e57/intensity_scaled.e57'), [{'fields': xyz('double') + [('intensity', ('scaled', 0, 1000, 0.001, 0.0), np.round(I0 / 255 * 1000) / 1000)]}])
    case('e57/intensity_scaled', ['e57/intensity_scaled.e57'], '強度 ScaledInteger（0〜1000 × 0.001、10 bit）', P=P, F={'intensity': np.round(I0 / 255 * 1000) / 1000}, rgb=False)
    # 値が 1 つしかない項目（min = max → データを持たない）
    write_e57(path('e57/const_field.e57'), [{'fields': xyz('double') + [('intensity', ('int', 7, 7), np.full(n, 7))] + col(RGB0.astype(np.int64), 0, 255), 'colorLimits': (0, 255)}])
    case('e57/const_field', ['e57/const_field.e57'], '強度の範囲が 7〜7（0 bit。値はすべて 7）', P=P, C=RGB0, F={'intensity': np.full(n, 7.0)}, rgb=True)
    # Integer の範囲を書かない（既定 = int64 全体 → 64 bit。libE57Format は既定値の属性を書かない）
    write_e57(path('e57/int_default_range.e57'), [{'fields': xyz('double') + [('intensity', ('int_default',), Ii)]}])
    case('e57/int_default_range', ['e57/int_default_range.e57'], '強度 Integer の minimum/maximum を省略（既定の int64 の範囲、64 bit で詰められる）', P=P, F={'intensity': Ii.astype(float)}, rgb=False)

    # 7) 大きな点群（30 万点。データがパケット・ページをまたぐ。座標 21 bit・強度 11 bit・色）
    m = 300000
    rng = np.random.default_rng(9)
    PB = rng.uniform([-50, -20, -3], [150, 40, 5], (m, 3))
    rawb = np.round((PB - off2) / sc2)
    IB = rng.integers(0, 2048, m)
    CB = rng.integers(0, 256, (m, 3))
    fl = [(f'cartesian{c}', ('scaled', -1048576, 1048575, sc2, off2), rawb[:, k] * sc2 + off2) for k, c in enumerate('XYZ')] + [('intensity', ('int', 0, 2047), IB)] + col(CB, 0, 255)
    write_e57(path('e57/big300k.e57'), [{'fields': fl, 'colorLimits': (0, 255)}])
    case('e57/big300k', ['e57/big300k.e57'], '30 万点（21 bit 座標・11 bit 強度・色。パケット・ページをまたぐ）', P=rawb * sc2 + off2, C=CB.astype(np.uint8), F={'intensity': IB.astype(float)}, rgb=True)

    # 8) 大きな座標（UTM）: 座標そのものが UTM / 局所座標 + pose の平行移動が UTM
    Q = P + UTM
    write_e57(path('e57/utm_cart.e57'), [{'fields': [(f'cartesian{c}', ('float', 'double', -1e7, 1e7), Q[:, k]) for k, c in enumerate('XYZ')]}])
    case('e57/utm_cart', ['e57/utm_cart.e57'], 'UTM の座標（double）', P=Q, rgb=False, mm=True)
    write_e57(path('e57/utm_pose.e57'), [{'fields': xyz('double'), 'pose': (np.array([1.0, 0, 0, 0]), UTM)}])
    case('e57/utm_pose', ['e57/utm_pose.e57'], '局所座標 + pose の平行移動が UTM', P=Q, rgb=False, mm=True)

    # 9) 点が 0 個のスキャンが混ざる・行と列の番号・時刻（使わない項目）
    write_e57(path('e57/empty_scan.e57'), [{'fields': [(f'cartesian{c}', ('float', 'double', -1, 1), np.zeros(0)) for c in 'XYZ']}, {'fields': xyz('double')}])
    case('e57/empty_scan', ['e57/empty_scan.e57'], '1 つ目のスキャンは点が 0 個', P=P, rgb=False)
    rowi = np.arange(n) // 100; coli = np.arange(n) % 100
    write_e57(path('e57/rowcol_time.e57'), [{'fields': xyz('double') + [('rowIndex', ('int', 0, 49), rowi), ('columnIndex', ('int', 0, 99), coli), ('timeStamp', ('float', 'double', 0, 1e3), np.arange(n) * 0.01)]}])
    case('e57/rowcol_time', ['e57/rowcol_time.e57'], 'rowIndex・columnIndex・timeStamp つき（座標に影響しないこと）', P=P, rgb=False)
