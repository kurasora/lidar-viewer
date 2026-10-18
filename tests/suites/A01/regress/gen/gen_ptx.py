# PTX（Leica）の試験用ファイル
#   1 スキャン = 列数・行数・スキャナー位置（1 行）・スキャナーの軸（3 行）・4×4 の変換（4 行、行ベクトル × 行列、最後の行が平行移動）・列×行 個の点
import math, numpy as np
from common import *


def rotz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def write_ptx(rel, scans, nl='\n', inv='0 0 0 0.5 0 0 0'):
    """scans: [{'pts': 世界座標 (m,3), 'R', 't', 'cols', 'I', 'RGB', 'sensor': (位置, 軸 3×3) or None, 'invalid_first': bool}]"""
    out = []
    for sc in scans:
        pts, R, t = sc['pts'], sc['R'], sc['t']
        m = len(pts); cols = sc.get('cols', 300)
        cells = ([None] if sc.get('invalid_first') else []) + list(range(m))
        rows = math.ceil(len(cells) / cols) if cols else 0
        cells += [None] * (rows * cols - len(cells))
        out += [str(cols), str(rows)]
        spos, sax = sc.get('sensor') or (t, R)
        out.append(' '.join(f'{v:.6f}' for v in spos))
        for k in range(3): out.append(' '.join(f'{v:.6f}' for v in sax[:, k]))
        M = np.eye(4); M[:3, :3] = R.T; M[3, :3] = t
        for r in M: out.append(' '.join(f'{v:.10f}' for v in r))
        loc = (pts - t) @ R
        I = sc.get('I'); C = sc.get('RGB')
        for ci, c in enumerate(cells):
            if c is None: out.append(sc.get('inv_first', inv) if ci == 0 else inv); continue
            x, y, z = loc[c]
            s = f'{x:.6f} {y:.6f} {z:.6f}'
            if I is not None: s += f' {I[c]:.5f}'
            if C is not None: s += f' {C[c,0]} {C[c,1]} {C[c,2]}'
            out.append(s)
    open(path(rel), 'wb').write((nl.join(out) + nl).encode())


def expected_world(scans):
    P, C, I = [], [], []
    for sc in scans:
        loc = np.array([[float(f'{v:.6f}') for v in p] for p in (sc['pts'] - sc['t']) @ sc['R']])
        M = np.eye(4); M[:3, :3] = sc['R'].T; M[3, :3] = sc['t']
        Mr = np.array([[float(f'{v:.10f}') for v in r] for r in M])
        P.append(loc @ Mr[:3, :3] + Mr[3, :3])
        if sc.get('RGB') is not None: C.append(sc['RGB'])
        if sc.get('I') is not None: I.append(np.array([float(f'{v:.5f}') for v in sc['I']]))
    return np.concatenate(P), (np.concatenate(C) if C else None), (np.concatenate(I) if I else None)


def gen():
    n = N0
    half = n // 2
    I1 = I0 / 255
    s1 = {'pts': P0[:half], 'R': rotz(0.3), 't': np.array([0.0, 2.0, 0.0]), 'I': I1[:half], 'RGB': RGB0[:half]}
    s2 = {'pts': P0[half:], 'R': rotz(0.6) @ np.array([[1, 0, 0], [0, math.cos(0.1), -math.sin(0.1)], [0, math.sin(0.1), math.cos(0.1)]]), 't': np.array([5.0, 2.0, 0.3]), 'I': I1[half:], 'RGB': RGB0[half:]}
    # 1) 2 スキャン・色あり・空のマスは 0 0 0 0.5 0 0 0
    write_ptx('ptx/2scans_rgb.ptx', [s1, s2])
    P, C, I = expected_world([s1, s2])
    case('ptx/2scans_rgb', ['ptx/2scans_rgb.ptx'], '2 スキャン（回転 + 移動）・色あり・空のマス 0 0 0', P=P, C=C, F={'intensity': I}, rgb=True)
    # 2) 色なし（4 列）・空のマスは 0 0 0 0.5
    a = dict(s1, RGB=None); b = dict(s2, RGB=None)
    write_ptx('ptx/2scans_norgb.ptx', [a, b], inv='0 0 0 0.5')
    P, _, I = expected_world([a, b])
    case('ptx/2scans_norgb', ['ptx/2scans_norgb.ptx'], '2 スキャン・色なし（x y z 強度）', P=P, F={'intensity': I}, rgb=False)
    # 3) 最初のマスが空（0 0 0 0.5 の 4 列）で、ほかは 7 列（色あり）
    c1 = dict(s1, invalid_first=True, inv_first='0 0 0 0.5')
    write_ptx('ptx/first_invalid_4col.ptx', [c1, s2])
    P, C, I = expected_world([s1, s2])
    case('ptx/first_invalid_4col', ['ptx/first_invalid_4col.ptx'], '最初のマスだけ空で 4 列（0 0 0 0.5）、ほかのマスは 7 列（色あり、空のマスも 0 0 0 0.5 0 0 0）', P=P, C=C, rgb=True, extra={'note': 'CloudCompare 2.11 は最初の「有効な点」の列数で色の有無を決めるので色を読む'})
    # 4) スキャナー位置・軸の行（3〜6 行目）が 4×4 の変換と違う（4×4 だけで点を動かすのが CloudCompare と同じ）
    d1 = dict(s1, sensor=(np.array([100.0, 200.0, 300.0]), np.eye(3)))
    write_ptx('ptx/sensor_differs.ptx', [d1])
    P, C, I = expected_world([s1])
    case('ptx/sensor_differs', ['ptx/sensor_differs.ptx'], 'スキャナー位置・軸の行が 4×4 の変換と違う', P=P, C=C, rgb=True)
    # 5) 平行移動が UTM（1 mm 以内か）
    u1 = {'pts': P0 + UTM, 'R': rotz(0.2), 't': UTM + [1.0, 2.0, 0.0], 'I': I1, 'RGB': RGB0}
    write_ptx('ptx/utm.ptx', [u1])
    P, C, I = expected_world([u1])
    case('ptx/utm', ['ptx/utm.ptx'], '4×4 の平行移動が UTM', P=P, C=C, rgb=True, mm=True)
    # 6) CRLF・3 スキャン・点が 0 のスキャン（列数 0）
    e0 = {'pts': np.zeros((0, 3)), 'R': np.eye(3), 't': np.zeros(3), 'I': np.zeros(0), 'RGB': np.zeros((0, 3), np.uint8), 'cols': 0}
    s3 = {'pts': P0[:100] + [0, 0, 5], 'R': np.eye(3), 't': np.array([0.0, 0, 0]), 'I': I1[:100], 'RGB': RGB0[:100]}
    write_ptx('ptx/3scans_crlf.ptx', [s1, e0, s3], nl='\r\n')
    P, C, I = expected_world([s1, s3])
    case('ptx/3scans_crlf', ['ptx/3scans_crlf.ptx'], 'CRLF・スキャン 3 つ（2 つ目は 0 × 0）', P=P, C=C, rgb=True)
