# 色の試験: LAS の 16 bit 判定、PLY の ushort / float 色、PTS の列の判定
import sys; sys.path.insert(0, sys.argv[1])
from synth import *
import laspy
rng = np.random.default_rng(50)
n = 50000
P = np.c_[rng.uniform(0, 10, n), rng.uniform(0, 10, n), rng.uniform(0, 3, n)]
# 16 bit の色。先頭 20000 点は暗い（色のない点 0,0,0 のような）値、あとは明るい 16 bit
RGB16 = np.zeros((n, 3), np.uint16); RGB16[20000:] = rng.integers(0, 65536, (n - 20000, 3))
h = laspy.LasHeader(point_format=2, version='1.2'); h.scales = [0.001] * 3; h.offsets = [0, 0, 0]
las = laspy.LasData(h); las.x, las.y, las.z = P.T; las.red, las.green, las.blue = RGB16.T; las.write('las16_dark_first.las')
# 先頭も含めて明るい（ふつうの 16 bit）
RGBn = rng.integers(0, 65536, (n, 3)).astype(np.uint16)
las = laspy.LasData(h); las.x, las.y, las.z = P.T; las.red, las.green, las.blue = RGBn.T; las.write('las16_normal.las')
np.save('rgb16_dark_first.npy', RGB16); np.save('rgb16_normal.npy', RGBn)
# PLY の ushort の色（PDAL が LAS から書く形）
with open('ply_ushort.ply', 'wb') as f:
    f.write(f"ply\nformat binary_little_endian 1.0\nelement vertex {n}\nproperty double x\nproperty double y\nproperty double z\nproperty ushort red\nproperty ushort green\nproperty ushort blue\nend_header\n".encode())
    rec = np.zeros(n, dtype=[('x', '<f8'), ('y', '<f8'), ('z', '<f8'), ('r', '<u2'), ('g', '<u2'), ('b', '<u2')]); rec['x'], rec['y'], rec['z'] = P.T; rec['r'], rec['g'], rec['b'] = RGBn.T
    f.write(rec.tobytes())
# PLY の float の色（0〜255 を float で書いたもの）
RGB8 = rng.integers(0, 256, (n, 3))
with open('ply_float255.ply', 'wb') as f:
    f.write(f"ply\nformat binary_little_endian 1.0\nelement vertex {n}\nproperty float x\nproperty float y\nproperty float z\nproperty float red\nproperty float green\nproperty float blue\nend_header\n".encode())
    rec = np.zeros(n, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('r', '<f4'), ('g', '<f4'), ('b', '<f4')]); rec['x'], rec['y'], rec['z'] = P.T; rec['r'], rec['g'], rec['b'] = RGB8.T
    f.write(rec.tobytes())
np.save('rgb8.npy', RGB8)
# PTS（x y z 強度 r g b）で強度が 0〜255 の整数
I8 = rng.integers(0, 256, n)
with open('pts_int255.pts', 'w') as f:
    f.write(f'{n}\n')
    for i in range(n): f.write(f'{P[i,0]:.4f} {P[i,1]:.4f} {P[i,2]:.4f} {I8[i]} {RGB8[i,0]} {RGB8[i,1]} {RGB8[i,2]}\n')
# 同じ PTS で強度が Leica 風（-2048〜2047）
I12 = rng.integers(-2048, 2048, n)
with open('pts_leica.pts', 'w') as f:
    f.write(f'{n}\n')
    for i in range(n): f.write(f'{P[i,0]:.4f} {P[i,1]:.4f} {P[i,2]:.4f} {I12[i]} {RGB8[i,0]} {RGB8[i,1]} {RGB8[i,2]}\n')
np.save('P.npy', P)
