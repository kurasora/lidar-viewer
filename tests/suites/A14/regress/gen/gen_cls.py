# 分類つきの LAS（ASPRS の分類 1 未分類・2 地面・6 建物・18 ノイズ）: 種類の色分けの試験用
import sys, os, json
import numpy as np, laspy
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
raw = open(os.path.join(src, 'scans.pcd'), 'rb').read(); off = raw.index(b'DATA binary\n') + 12
a = np.frombuffer(raw[off:], dtype='<f4').reshape(-1, 8)[:300000]
t = json.load(open(os.path.join(src, 'truth.json'))); R0 = np.array(t['R0']); t0 = np.array(t['t0'])
B = a[:, :3].astype(np.float64) @ R0.T + t0
cls = np.ones(len(a), np.uint8)
cls[np.abs(B[:, 2]) < 0.05] = 2
cls[(np.abs(np.abs(B[:, 1]) - 1.2) < 0.05)] = 6
cls[np.random.default_rng(0).random(len(a)) < 0.01] = 18
h = laspy.LasHeader(point_format=1, version='1.2'); h.offsets = [0, 0, 0]; h.scales = [0.001] * 3
l = laspy.LasData(h); l.x, l.y, l.z = a[:, 0], a[:, 1], a[:, 2]; l.intensity = a[:, 3].astype(np.uint16); l.classification = cls
l.write(os.path.join(out, 'classified.las')); print({int(c): int((cls == c).sum()) for c in np.unique(cls)})
