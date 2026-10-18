# PN・PV・SOI・OUT（Bundler）・POLY（Salome）・SX（SinusX）・CloudCompare の古い BIN（v1）
#   読み方の正解は CloudCompare 2.11.3 のソース（qAdditionalIO の PNFilter・PVFilter・SoiFilter・BundlerFilter・SalomeHydroFilter・SinusxFilter、
#   qCC_io の BinFilter）。Debian の CloudCompare にはこのプラグインが入っていないので、実物では比べられない
import struct, numpy as np
from common import *


def gen():
    n = N0
    P32 = f32(P0)
    # PN / PV（float32 のリトルエンディアン）
    np.hstack([P0, np.tile([0, 0, 1.0], (n, 1))]).astype('<f4').tofile(path('misc/cloud.pn'))
    case('misc/pn', ['misc/cloud.pn'], 'PN（x y z nx ny nz の float）', P=P32, rgb=False)
    np.hstack([P0, I0[:, None]]).astype('<f4').tofile(path('misc/cloud.pv'))
    case('misc/pv', ['misc/cloud.pv'], 'PV（x y z 値 の float）', P=P32, F={'value': I0}, rgb=False)
    np.hstack([P0, I0[:, None]]).astype('<f4').tofile(path('misc/cloud_pv_as.pn'))
    case('misc/pv_as_pn', ['misc/cloud_pv_as.pn'], 'PV の中身を .pn の名前にしたもの（4 の倍数だが 24 の倍数でない大きさ）', error='倍数', extra={'note': '形式が違う旨の知らせ'})
    # SOI（CloudCompare の SoiFilter: #CC# まで頭書き、スキャンごとに #pt#点数、各点 x y z 濃淡(整数)。色 = 濃淡 << 3）
    half = n // 2
    G = (I0 / 8).astype(int)  # 0〜21
    lines = ['#SOI_V1', f'#NP#{n}', '#NS#2', '#CC#']
    for sl in (slice(0, half), slice(half, n)):
        lines.append(f'#pt#{len(P0[sl])}')
        lines += [f'{p[0]:.4f} {p[1]:.4f} {p[2]:.4f} {g}' for p, g in zip(P0[sl], G[sl])]
    open(path('misc/2scans.soi'), 'w').write('\n'.join(lines) + '\n')
    Psoi = reparse([l for l in lines if not l.startswith('#')])
    Csoi = np.repeat(np.minimum(255, G * 8)[:, None], 3, 1).astype(np.uint8)
    case('misc/soi', ['misc/2scans.soi'], 'Mensi Soisic（2 スキャン、濃淡 → 灰色）', P=Psoi, C=Csoi, F={'intensity': G}, rgb=True)
    # Bundler（.out）: 色の行がない点が 1 つある（CloudCompare は黒にして続きを読む）
    lines = ['# Bundle file v0.3', f'2 {n}'] + ['800 0 0', '1 0 0', '0 1 0', '0 0 1', '0 0 -5'] * 2
    for i in range(n):
        lines.append(f'{P0[i,0]:.5f} {P0[i,1]:.5f} {P0[i,2]:.5f}')
        lines.append(f'{RGB0[i,0]} {RGB0[i,1]} {RGB0[i,2]}')
        lines.append('1 0 0 0.0 0.0')
    open(path('misc/bundler.out'), 'w').write('\n'.join(lines) + '\n')
    Pb = reparse([f'{P0[i,0]:.5f} {P0[i,1]:.5f} {P0[i,2]:.5f}' for i in range(n)])
    case('misc/bundler', ['misc/bundler.out'], 'Bundler v0.3（カメラ 2 台・点 5,000、点ごとに 位置・色・見えたカメラ の 3 行）', P=Pb, C=RGB0, rgb=True)
    lines2 = list(lines)
    k = 12 + 3 * 100 + 1  # 100 番目の点の色の行
    del lines2[k]
    open(path('misc/bundler_nocolor.out'), 'w').write('\n'.join(lines2) + '\n')
    Cb = RGB0.copy(); Cb[100] = 0
    case('misc/bundler_nocolor', ['misc/bundler_nocolor.out'], 'Bundler: 100 番目の点だけ色の行がない（CloudCompare は黒にして続きを読む）', P=Pb, C=Cb, rgb=True)
    # Salome Hydro（.poly）と SinusX（.sx）: 線。頂点が含まれ、点がすべて線分の上にあること
    T = np.loadtxt('/home/claude/pcd-viewer/sample/trajectory.txt', comments='#')[:, 1:4][::5]
    rects = [np.array([[x0, y0, 0], [x0 + 6, y0, 0], [x0 + 6, y0 + 4, 0], [x0, y0 + 4, 0], [x0, y0, 0]], float) for x0, y0 in [(0, 3), (10, 3), (20, 3), (30, -8)]]
    with open(path('misc/lines.poly'), 'w') as f:
        for L in [T] + rects:
            for p in L: f.write(f'{p[0]:.4f} {p[1]:.4f} {p[2]:.4f}\n')
            f.write('\n')
    segs = []
    for L in [T] + rects:
        Lr = np.round(L, 4)
        segs += [(Lr[i], Lr[i + 1]) for i in range(len(Lr) - 1)]
    case('misc/salome', ['misc/lines.poly'], 'Salome Hydro（線 5 本: 軌跡 + 四角形 4 つ）', P=np.concatenate([np.round(L, 4) for L in [T] + rects]), rgb=False, nocheck_points=True,
         extra={'lines': 'misc/lines.segs.npy'})
    np.save(path('misc/lines.segs.npy'), np.array([np.concatenate(s) for s in segs]))
    with open(path('misc/lines.sx'), 'w') as f:
        f.write('C Generated for test\n')
        for k, L in enumerate([T] + rects):
            closed = 1 if k else 0
            f.write(f'B S\nCN line{k}\nCP 1 {closed}\nCP 0\n')
            pts = L[:-1] if closed else L
            for p in pts: f.write(f' {p[0]:+.6E} {p[1]:+.6E} {p[2]:+.6E} A\n')
    segs2 = []
    for k, L in enumerate([T] + rects):
        Lr = np.array([[float(f'{v:+.6E}') for v in p] for p in (L[:-1] if k else L)])
        segs2 += [(Lr[i], Lr[i + 1]) for i in range(len(Lr) - 1)]
        if k: segs2.append((Lr[-1], Lr[0]))  # 閉じた線
    np.save(path('misc/lines_sx.segs.npy'), np.array([np.concatenate(s) for s in segs2]))
    case('misc/sinusx', ['misc/lines.sx'], 'SinusX（線 5 本、四角形は「閉じた線」CP 1 1）', P=None, rgb=False, nocheck_points=True, extra={'lines': 'misc/lines_sx.segs.npy'})
    # CloudCompare の古い BIN（v1）: 点群の数・点数・印（色 2、法線 4、値 8、名前 16、値の名前 32）・float の xyz（+色 + 法線 + double の値）
    with open(path('misc/old_v1.bin'), 'wb') as f:
        f.write(struct.pack('<I', 2))
        # 点群 1: 色 + 値 + 名前 + 値の名前
        flags = 2 | 8 | 16 | 32
        f.write(struct.pack('<IB', half, flags)); f.write(b'cloud1\0'); f.write(b'Intensity\0')
        for i in range(half):
            f.write(struct.pack('<fff', *P0[i])); f.write(bytes(RGB0[i].astype(np.uint8))); f.write(struct.pack('<d', I0[i]))
        # 点群 2: 法線だけ
        f.write(struct.pack('<IB', n - half, 4))
        for i in range(half, n):
            f.write(struct.pack('<fff', *P0[i])); f.write(struct.pack('<fff', 0, 0, 1))
    C1 = RGB0.copy(); C1[half:] = 200
    case('misc/ccbin_v1', ['misc/old_v1.bin'], 'CloudCompare の古い BIN（v1、点群 2 つ: 色 + 値 / 法線だけ）', P=P32, C=C1, rgb=True)
