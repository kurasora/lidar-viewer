# グローバルシフトの試験用: 同じ地図を「ローカル座標の PCD」と「UTM 風の大きな座標の LAS」、軌跡を UTM 風の TUM で書く
#   python3 gen_shift.py <元のフォルダ（scans.pcd, odom_tum.txt）> <出力フォルダ>
import sys, os
import numpy as np, laspy
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
SH = np.array([539000.0, 3836000.0, 30.0])   # UTM 54N 風
JGD = np.array([-38000.0, -12000.0, 30.0])    # 平面直角座標風（負の大きな値）
raw = open(os.path.join(src, 'scans.pcd'), 'rb').read(); off = raw.index(b'DATA binary\n') + 12
a = np.frombuffer(raw[off:], dtype='<f4').reshape(-1, 8)
P = a[:, :3].astype(np.float64); I = a[:, 3]
def write_las(name, P, I, shift, hoff=None, sc=0.001):
    h = laspy.LasHeader(point_format=1, version='1.2'); h.offsets = shift if hoff is None else hoff; h.scales = [sc, sc, sc]
    l = laspy.LasData(h); l.x = P[:, 0] + shift[0]; l.y = P[:, 1] + shift[1]; l.z = P[:, 2] + shift[2]
    l.intensity = I.astype(np.uint16); l.gps_time = np.linspace(1.3e9, 1.3e9 + 120, len(P)); l.write(os.path.join(out, name))
write_las('map_utm.las', P, I, SH)
write_las('map_jgd.las', P, I, JGD)
# ローカル座標の LAS（同じ点）
write_las('map_local.las', P, I, np.zeros(3))
# 1 点目だけ原点（0,0,0）にある UTM のファイル（よくある「ゴミの 1 点目」）
P2 = P.copy(); write_las('map_utm_zero_first.las', np.vstack([-SH[None, :], P2]), np.concatenate([[0], I]), SH, hoff=np.zeros(3), sc=0.01)
# 軌跡（UTM）
rows = [l.split() for l in open(os.path.join(src, 'odom_tum.txt')) if l.strip()]
with open(os.path.join(out, 'traj_utm.tum'), 'w') as f:
    for r in rows:
        t, x, y, z = map(float, r[:4]); f.write(f"{t:.6f} {x + SH[0]:.4f} {y + SH[1]:.4f} {z + SH[2]:.4f} {' '.join(r[4:8])}\n")
np.save(os.path.join(out, 'P_local.npy'), P.astype(np.float32))
print('ok', len(P))
