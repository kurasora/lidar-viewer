# LIO-SAM と livox_ros_driver2 の出力に似せたファイルを作る
#   python3 gen_liosam_livox.py <FAST-LIO 風の出力フォルダ（scans.pcd, odom_tum.txt）> <出力フォルダ>
#   → liosam/GlobalMap.pcd（PointXYZI binary、5 cm 間引き）, liosam/trajectory.pcd（PointXYZI: intensity = 番号）,
#     liosam/transformations.pcd（PointXYZIRPYT: x y z intensity roll pitch yaw time(double)）,
#     livox/livox_frame.pcd（PointXYZRTLT: x y z intensity tag line timestamp(double ns)、26 バイト/点、binary）,
#     livox/livox_frame_ascii.pcd（同じ内容の ascii。PCL の既定の精度 8 桁で timestamp を書く）
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from world import robot_path, sensor_pose_B, scan
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out + '/liosam', exist_ok=True); os.makedirs(out + '/livox', exist_ok=True)
raw = open(os.path.join(src, 'scans.pcd'), 'rb').read(); off = raw.index(b'DATA binary\n') + 12
a = np.frombuffer(raw[off:], dtype='<f4').reshape(-1, 8)
P, I = a[:, :3], a[:, 3]

def pcd(path, names, types, sizes, rec, n, data='binary'):
    h = (f"# .PCD v0.7 - Point Cloud Data file format\nVERSION 0.7\nFIELDS {' '.join(names)}\nSIZE {' '.join(map(str, sizes))}\n"
         f"TYPE {' '.join(types)}\nCOUNT {' '.join('1' for _ in names)}\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA {data}\n")
    with open(path, 'wb') as f: f.write(h.encode()); f.write(rec)

# GlobalMap.pcd: 5 cm の格子で間引いた PointXYZI
key = np.floor(P / 0.05).astype(np.int64)
_, idx = np.unique(key[:, 0] * 73856093 ^ key[:, 1] * 19349663 ^ key[:, 2] * 83492791, return_index=True)
G = np.zeros(len(idx), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('intensity', '<f4')])
G['x'], G['y'], G['z'] = P[idx, 0], P[idx, 1], P[idx, 2]; G['intensity'] = I[idx]
pcd(out + '/liosam/GlobalMap.pcd', ['x', 'y', 'z', 'intensity'], ['F'] * 4, [4] * 4, G.tobytes(), len(G))

# 鍵となる姿勢（1 m ごと）
rows = np.array([[float(v) for v in l.split()] for l in open(os.path.join(src, 'odom_tum.txt')) if l.strip()])
keep = [0]
for i in range(1, len(rows)):
    if np.linalg.norm(rows[i, 1:4] - rows[keep[-1], 1:4]) >= 1.0: keep.append(i)
K = rows[keep]
TP = np.zeros(len(K), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('intensity', '<f4')])
TP['x'], TP['y'], TP['z'] = K[:, 1], K[:, 2], K[:, 3]; TP['intensity'] = np.arange(len(K))
pcd(out + '/liosam/trajectory.pcd', ['x', 'y', 'z', 'intensity'], ['F'] * 4, [4] * 4, TP.tobytes(), len(TP))
def q2rpy(q):
    x, y, z, w = q
    return (np.arctan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)), np.arcsin(np.clip(2 * (w * y - z * x), -1, 1)), np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))
T6 = np.zeros(len(K), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('intensity', '<f4'), ('roll', '<f4'), ('pitch', '<f4'), ('yaw', '<f4'), ('time', '<f8')])
T6['x'], T6['y'], T6['z'] = K[:, 1], K[:, 2], K[:, 3]; T6['intensity'] = np.arange(len(K))
rpy = np.array([q2rpy(r[4:8]) for r in K]); T6['roll'], T6['pitch'], T6['yaw'] = rpy[:, 0], rpy[:, 1], rpy[:, 2]
T6['time'] = K[:, 0]
pcd(out + '/liosam/transformations.pcd', ['x', 'y', 'z', 'intensity', 'roll', 'pitch', 'yaw', 'time'], ['F'] * 8, [4] * 7 + [8], T6.tobytes(), len(T6))
np.save(out + '/liosam/key_times.npy', K[:, 0])

# livox: 1 秒ぶん（20 万点）を、センサー座標で。PointXYZRTLT（#pragma pack(1)、26 バイト）
rs = np.random.default_rng(5)
path = robot_path()
t, x, y, yaw = path[300]
Rb, tb = sensor_pose_B(x, y, yaw)
pts, refl, dl, rng_ = [], [], [], []
p, r, d_, rr = scan(Rb, tb, 240000, rs)
loc = (p - tb) @ Rb  # センサー座標
n = len(loc)
T0 = 1791886746_000000000  # ns
ts = T0 + np.sort(rs.integers(0, 1_000_000_000, n)).astype(np.int64)
L = np.zeros(n, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('intensity', '<f4'), ('tag', 'u1'), ('line', 'u1'), ('timestamp', '<f8')])
L['x'], L['y'], L['z'] = loc[:, 0], loc[:, 1], loc[:, 2]; L['intensity'] = r
L['tag'] = rs.choice([0, 16, 32, 48], n, p=[0.85, 0.07, 0.05, 0.03]); L['line'] = rs.integers(0, 4, n)
L['timestamp'] = ts.astype(np.float64)
assert L.itemsize == 26
pcd(out + '/livox/livox_frame.pcd', ['x', 'y', 'z', 'intensity', 'tag', 'line', 'timestamp'], ['F', 'F', 'F', 'F', 'U', 'U', 'F'], [4, 4, 4, 4, 1, 1, 8], L.tobytes(), n)
# ascii（PCL の savePCDFileASCII は既定で 8 桁）
with open(out + '/livox/livox_frame_ascii.pcd', 'w') as f:
    f.write(f"# .PCD v0.7 - Point Cloud Data file format\nVERSION 0.7\nFIELDS x y z intensity tag line timestamp\nSIZE 4 4 4 4 1 1 8\nTYPE F F F F U U F\nCOUNT 1 1 1 1 1 1 1\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA ascii\n")
    for i in range(n): f.write(f"{L['x'][i]:.8g} {L['y'][i]:.8g} {L['z'][i]:.8g} {L['intensity'][i]:.8g} {L['tag'][i]} {L['line'][i]} {L['timestamp'][i]:.8g}\n")
np.save(out + '/livox/ts_ns.npy', ts)
print('GlobalMap', len(G), 'keyposes', len(K), 'livox', n, 'ts range s', (ts.max() - ts.min()) / 1e9)
