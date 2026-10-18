# 点数の上限（capSel）より多い点群: 間引いた点数・total・知らせ・偏り
import numpy as np, laspy
from common import *


def gen():
    m = 50000
    rng = np.random.default_rng(21)
    P = np.concatenate([P0 + [0, 40 * k, 0] for k in range(10)])  # 廊下を 10 本並べた 5 万点（y で 10 組に分かれる）
    C = np.tile(RGB0, (10, 1))
    h = laspy.LasHeader(point_format=3, version='1.2'); h.scales = [0.001] * 3
    las = laspy.LasData(h); las.x, las.y, las.z = P.T
    las.red, las.green, las.blue = (C.astype(np.uint16) * 257).T
    las.intensity = np.arange(m) % 65536
    fn = path('cap/las50k.las'); las.write(fn)
    r = laspy.read(fn); PL = np.stack([r.x, r.y, r.z], 1)
    for cap in (10000, 49999, 50000, 50001):
        sampled = cap < m
        case(f'cap/las50k_cap{cap}', ['cap/las50k.las'], f'LAS 5 万点を上限 {cap:,} 点で開く', P=PL, C=C, F={'intensity': (np.arange(m) % 65536).astype(float)}, rgb=True,
             cap=cap, n=min(cap, m), total=m, extra={'sampled': sampled, 'strata': 10})
    # PCD（binary）と文字（.xyz）
    hdr = f'VERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH {m}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {m}\nDATA binary\n'
    rec = np.zeros(m, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('i', '<f4')]); rec['x'], rec['y'], rec['z'] = P.T; rec['i'] = np.arange(m)
    open(path('cap/pcd50k.pcd'), 'wb').write(hdr.encode() + rec.tobytes())
    case('cap/pcd50k_cap10000', ['cap/pcd50k.pcd'], 'PCD 5 万点を上限 1 万点で開く', P=f32(P), F={'intensity': np.arange(m).astype(float)}, rgb=False, cap=10000, n=10000, total=m, extra={'sampled': True, 'strata': 10})
    rows = [f'{p[0]:.6f} {p[1]:.6f} {p[2]:.6f}' for p in P]
    open(path('cap/xyz50k.xyz'), 'w').write('\n'.join(rows) + '\n')
    case('cap/xyz50k_cap10000', ['cap/xyz50k.xyz'], '文字の点群 5 万点を上限 1 万点で開く', P=reparse(rows), rgb=False, cap=10000, n=10000, total=m, extra={'sampled': True, 'strata': 10})
    # 上限 1 点（境界）
    case('cap/pcd50k_cap1', ['cap/pcd50k.pcd'], 'PCD 5 万点を上限 1 点で開く（境界）', P=f32(P), rgb=False, cap=1, n=1, total=m, extra={'sampled': True, 'no_browser': True})
