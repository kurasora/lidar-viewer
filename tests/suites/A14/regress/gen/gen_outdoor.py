# 屋外（キャンパス）を走った FAST-LIO 風の地図: 地面・建物（高さ 12 m）・木（幹と、高さ 4.5〜6 m の葉の層）
#   python3 gen_outdoor.py <出力フォルダ>
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import world
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
rs = np.random.default_rng(3)
RECTS = []
def R(ax, v, a, b, refl): RECTS.append((ax, v, a, b, refl))
R(2, 0.0, (-60, 60), (-60, 60), 40)                       # 地面
for (x0, x1, y0, y1) in [(-40, -10, 15, 35), (10, 45, 15, 30), (-35, 0, -40, -15)]:   # 建物 3 棟（高さ 12 m）
    R(1, y0, (x0, x1), (0, 12), 90); R(1, y1, (x0, x1), (0, 12), 90); R(0, x0, (y0, y1), (0, 12), 90); R(0, x1, (y0, y1), (0, 12), 90)
    R(2, 12, (x0, x1), (y0, y1), 90)
TREES = []
for i in range(40):                                        # 並木（道の両側）
    x = -45 + i * 2.4 if i < 40 else 0; y = 7.0 if i % 2 else -7.0
    h = rs.uniform(4.5, 6.0); r = rs.uniform(1.5, 2.2)
    TREES.append((x, y, h, r))
    R(2, h, (x - r, x + r), (y - r, y + r), 60)            # 葉の層の下面
    R(2, h + 1.0, (x - r, x + r), (y - r, y + r), 60)      # 葉の層の上面
    R(0, x - 0.15, (y - 0.15, y + 0.15), (0, h), 70); R(0, x + 0.15, (y - 0.15, y + 0.15), (0, h), 70)
    R(1, y - 0.15, (x - 0.15, x + 0.15), (0, h), 70); R(1, y + 0.15, (x - 0.15, x + 0.15), (0, h), 70)
world.RECTS[:] = RECTS
# 道（y = 0）を西から東へ 90 m
path = []; t = 0.0
for x in np.arange(-45, 45, 0.05):
    path.append((t, x, 0.0, 0.0)); t += 0.1
path = np.array(path)
R0, t0 = world.sensor_pose_B(path[0][1], path[0][2], path[0][3])
P, I = [], []
for (tt, x, y, yaw) in path:
    Rb, tb = world.sensor_pose_B(x, y, yaw)
    p, refl, _, _ = world.scan(Rb, tb, 1200, rs)
    P.append(world.B_to_M(p, R0, t0)); I.append(refl)
P = np.concatenate(P).astype(np.float32); I = np.concatenate(I).astype(np.float32)
n = len(P)
rec = np.zeros(n, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('intensity', '<f4')])
rec['x'], rec['y'], rec['z'] = P[:, 0], P[:, 1], P[:, 2]; rec['intensity'] = I
head = (f"# .PCD v0.7 - Point Cloud Data file format\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA binary\n")
with open(os.path.join(out, 'scans.pcd'), 'wb') as f: f.write(head.encode()); f.write(rec.tobytes())
Bz = (P.astype(np.float64) @ R0.T + t0)[:, 2]
json.dump({'n': n, 'R0': R0.tolist(), 't0': t0.tolist(), 'building_top': 12.0, 'canopy': [4.5, 7.0],
           'share_above_4m': float((Bz > 4.0).mean()), 'share_above_8m': float((Bz > 8.0).mean()),
           'floor_point_M': world.B_to_M(np.array([0.0, 0.0, 0.0]), R0, t0).tolist(), 'ceiling_point_M': world.B_to_M(np.array([0.0, 0.0, 12.0]), R0, t0).tolist()},
          open(os.path.join(out, 'truth.json'), 'w'), indent=1)
print('n', n, 'share above 4 m', (Bz > 4.0).mean())
