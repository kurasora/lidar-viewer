import sys; sys.path.insert(0, sys.argv[1])
from synth import *
import laspy
rng = np.random.default_rng(90)
# 分類が {1, 2, 6, 64, 65} の 5 つの区画（上から見て横に並ぶ 4×4 m の平面）。LAS 1.4 点の形式 6
cls = [1, 2, 6, 64, 65]; P, C = [], []
for k, c in enumerate(cls):
    q = plane([k * 6.0, 0, 0], [1, 0, 0], [0, 1, 0], 4, 4, 0.05, rng); P.append(q); C.append(np.full(len(q), c))
P = np.vstack(P); C = np.concatenate(C)
h = laspy.LasHeader(point_format=6, version='1.4'); h.scales = [0.001] * 3; h.offsets = [0, 0, 0]
las = laspy.LasData(h); las.x, las.y, las.z = P.T; las.classification = C.astype(np.uint8); las.intensity = (C * 100).astype(np.uint16); las.write('cls64.las')
# 強度に Inf が 1 点だけある PCD（ほかは 0〜255）
pts = room(L=10, Wd=3, H=2.7, step=0.08, noise=0.002, seed=91)
inten = rng.uniform(0, 255, len(pts)).astype(np.float32); inten[123] = np.inf
write_pcd('inten_inf.pcd', pts, {'intensity': (inten, 'F', 4)})
inten2 = inten.copy(); inten2[123] = np.nan
write_pcd('inten_nan.pcd', pts, {'intensity': (inten2, 'F', 4)})
