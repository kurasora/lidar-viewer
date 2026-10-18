# 点群のサンプル（Python の各形式ライブラリ、または CloudCompare のソースに沿った手書き）
import numpy as np, laspy, pye57, struct, json, math
P = np.load('src/P.npy'); I = np.load('src/I.npy'); RGB = np.load('src/RGB.npy')
n = len(P); O = 'out/'
UTM = np.array([539000.0, 3836000.0, 30.0])   # 地図座標（UTM）らしい大きな値をのせる
json.dump({'n': n, 'mean': P.mean(0).tolist(), 'min': P.min(0).tolist(), 'max': P.max(0).tolist(), 'utm': UTM.tolist()}, open('out_expected.json', 'w'))

# LAS 1.2（点の形式 3: GPS 時刻 + 色）。座標は UTM の大きな値
h = laspy.LasHeader(point_format=3, version='1.2'); h.scales = [0.001] * 3; h.offsets = UTM
las = laspy.LasData(h)
Q = P + UTM
las.x, las.y, las.z = Q[:, 0], Q[:, 1], Q[:, 2]
las.intensity = I.astype(np.uint16) * 256
las.classification = np.where(P[:, 2] < -0.1, 2, 1).astype(np.uint8)
las.gps_time = 1.7e9 + np.arange(n) * 1e-4
las.red, las.green, las.blue = (RGB[:, 0].astype(np.uint16) * 257), (RGB[:, 1].astype(np.uint16) * 257), (RGB[:, 2].astype(np.uint16) * 257)
las.write(O + 'laspy_utm.las')
# LAZ（LAS 1.4、点の形式 7）
h = laspy.LasHeader(point_format=7, version='1.4'); h.scales = [0.001] * 3; h.offsets = [0, 0, 0]
laz = laspy.LasData(h)
laz.x, laz.y, laz.z = P[:, 0], P[:, 1], P[:, 2]
laz.intensity = I.astype(np.uint16); laz.classification = np.ones(n, np.uint8) * 1
laz.red, laz.green, laz.blue = (RGB[:, 0].astype(np.uint16) * 257), (RGB[:, 1].astype(np.uint16) * 257), (RGB[:, 2].astype(np.uint16) * 257)
laz.write(O + 'laspy_14.laz', laz_backend=laspy.LazBackend.Lazrs)

# E57（2 スキャン。2 つ目はスキャナーの位置・向き付き）
def quat(axis, ang):
    axis = np.array(axis) / np.linalg.norm(axis); s = math.sin(ang / 2)
    return np.array([math.cos(ang / 2), *(axis * s)])
def qmat(q):
    w, x, y, z = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
e = pye57.E57(O + 'pye57_2scans.e57', mode='w')
half = n // 2
for si, (sl, q, t) in enumerate([(slice(0, half), np.array([1.0, 0, 0, 0]), np.zeros(3)), (slice(half, n), quat([0, 0, 1], 0.6), np.array([12.0, -3.0, 0.5]))]):
    R = qmat(q); loc = (P[sl] - t) @ R   # 世界 = R・局所 + t
    data = {'cartesianX': loc[:, 0], 'cartesianY': loc[:, 1], 'cartesianZ': loc[:, 2], 'intensity': I[sl] / 255.0,
            'colorRed': RGB[sl, 0].astype(np.uint8), 'colorGreen': RGB[sl, 1].astype(np.uint8), 'colorBlue': RGB[sl, 2].astype(np.uint8)}
    e.write_scan_raw(data, name=f'scan{si}', rotation=q, translation=t)
e.close()

# PTX（2 スキャン。格子状に並べ、空のマスは 0 0 0）
with open(O + 'handmade_2scans.ptx', 'w') as f:
    for si, sl in enumerate([slice(0, half), slice(half, n)]):
        pts = P[sl]; m = len(pts); cols = 300; rows = math.ceil(m / cols)
        ang = 0.3 * (si + 1); c, s = math.cos(ang), math.sin(ang); t = np.array([5.0 * si, 2.0, 0.0])
        R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        loc = (pts - t) @ R
        f.write(f"{cols}\n{rows}\n{t[0]} {t[1]} {t[2]}\n")
        for k in range(3): f.write(' '.join(str(v) for v in R[:, k]) + '\n')
        M = np.eye(4); M[:3, :3] = R.T; M[3, :3] = t   # PTX の変換は行ベクトル × 行列（最後の行が平行移動）
        for r in M: f.write(' '.join(f'{v:.10f}' for v in r) + '\n')
        for i in range(rows * cols):
            if i < m:
                x, y, z = loc[i]; f.write(f"{x:.6f} {y:.6f} {z:.6f} {I[sl][i] / 255:.5f} {RGB[sl][i][0]} {RGB[sl][i][1]} {RGB[sl][i][2]}\n")
            else: f.write("0 0 0 0.5 0 0 0\n")

# PN（座標 + 法線、float32）/ PV（座標 + 値、float32）
nrm = np.tile([0, 0, 1], (n, 1))
np.hstack([P, nrm]).astype('<f4').tofile(O + 'handmade_cloud.pn')
np.hstack([P, I[:, None]]).astype('<f4').tofile(O + 'handmade_cloud.pv')

# SOI（Mensi Soisic）: スキャンごとに #pt# の点数、各点は x y z 濃淡
with open(O + 'handmade_2scans.soi', 'w') as f:
    f.write(f"#SOI_V1\n#NP#{n}\n#NS#2\n#CC#\n")
    for sl in [slice(0, half), slice(half, n)]:
        f.write(f"#pt#{len(P[sl])}\n")
        for p, i in zip(P[sl], I[sl]): f.write(f"{p[0]:.4f} {p[1]:.4f} {p[2]:.4f} {min(31, int(i) >> 3)}\n")

# Bundler（.out）: カメラ 2 台 + 点（位置・色・見えたカメラ）
with open(O + 'handmade_bundler.out', 'w') as f:
    f.write(f"# Bundle file v0.3\n2 {n}\n")
    for k in range(2):
        f.write("800 0 0\n1 0 0\n0 1 0\n0 0 1\n" + f"{-10.0 * k} 0 -5\n")
    for p, c in zip(P, RGB): f.write(f"{p[0]:.5f} {p[1]:.5f} {p[2]:.5f}\n{c[0]} {c[1]} {c[2]}\n1 0 0 0.0 0.0\n")

# 軌跡と四角形を線（ポリライン）として: Salome Hydro（.poly）と SinusX（.sx）
T = np.loadtxt('/home/claude/pcd-viewer/sample/trajectory.txt', comments='#')[:, 1:4]
T = T[::5]
rects = [np.array([[x0, y0, 0], [x0 + 6, y0, 0], [x0 + 6, y0 + 4, 0], [x0, y0 + 4, 0], [x0, y0, 0]], float) for x0, y0 in [(0, 3), (10, 3), (20, 3), (30, -8)]]
with open(O + 'handmade_lines.poly', 'w') as f:
    for L in [T] + rects:
        for p in L: f.write(f"{p[0]:.4f} {p[1]:.4f} {p[2]:.4f}\n")
        f.write("\n")
with open(O + 'handmade_lines.sx', 'w') as f:
    f.write("C Generated for PCD Viewer test\n")
    for k, L in enumerate([T] + rects):
        closed = 1 if k else 0
        f.write(f"B S\nCN line{k}\nCP 1 {closed}\nCP 0\n")
        pts = L[:-1] if closed else L
        for p in pts: f.write(f" {p[0]:+.6E} {p[1]:+.6E} {p[2]:+.6E} A\n")
    f.write("\n")

# CloudCompare の .pov（点群ファイルとスキャナーの位置）と .icm（点群ファイル + 画像の目録）
lo, hi = P[:half], P[half:]
for name, part in [('pov_scan0.asc', lo), ('pov_scan1.asc', hi)]:
    np.savetxt(O + name, np.hstack([part, RGB[:len(part)] if name.endswith('0.asc') else RGB[half:]]), fmt='%.6f %.6f %.6f %d %d %d')
with open(O + 'handmade_scans.pov', 'w') as f:
    f.write("#CC_POVS_FILE\nSENSOR_TYPE = YAW_THEN_PITCH\nSENSOR_BASE = 0\nUNITS = IGNORED\n#END_HEADER\n")
    for k, nm in enumerate(['pov_scan0.asc', 'pov_scan1.asc']):
        f.write(f"\n#POV {k}\nF {nm}\nT ASC\nC {k * 10.0:f} 0.000000 1.500000\nX 1.000000 0.000000 0.000000\nY 0.000000 1.000000 0.000000\nZ 0.000000 0.000000 1.000000\nA 0.100000 0.100000\n#END_POV\n")
np.savetxt(O + 'icm_cloud.asc', np.hstack([P, RGB]), fmt='%.6f %.6f %.6f %d %d %d')
with open(O + 'handmade_images.icm', 'w') as f:
    f.write("#CC_ICM_FILE\nFILE_NAME=icm_cloud.asc\nFILE_TYPE=ASC\nIMAGES_DESCRIPTOR=icm_images.wrl\n")
with open(O + 'icm_images.wrl', 'w') as f:
    f.write("#VRML V2.0 utf8\n")

# CSV の高さの表（CloudCompare の CSV matrix）: 地形のような 120 × 80 の格子
gx, gy = np.meshgrid(np.arange(120), np.arange(80))
Z = 3 * np.sin(gx / 15) * np.cos(gy / 11) + 0.02 * gx
np.savetxt(O + 'handmade_matrix.csv', Z, fmt='%.4f', delimiter=',')
print('ok')
