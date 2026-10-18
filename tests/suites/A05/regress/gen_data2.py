#!/usr/bin/env python3
# 追加の試験用ファイル（gen_data.py のあとに）: python3 gen_data2.py <フォルダ>
#  ・UTM 風の大きな座標の地図と軌跡（地図と軌跡が重なるかを見る）
import sys, numpy as np
out = sys.argv[1]
OFF = np.array([539000.0, 3836000.0, 30.0])
def read_pcd(path):
    b = open(path, 'rb').read(); i = b.index(b'DATA binary\n') + len(b'DATA binary\n')
    head = b[:i].decode(); names = head.split('FIELDS ')[1].split('\n')[0].split()
    a = np.frombuffer(b[i:], np.float32).reshape(-1, len(names)); return names, a
names, a = read_pcd(f'{out}/c_xyzi.pcd')
n = len(a)
P = a[:, :3].astype(np.float64) + OFF
with open(f'{out}/utm_map.pcd', 'wb') as f:
    f.write(('# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 8 8 8 4\nTYPE F F F F\nCOUNT 1 1 1 1\n'
             f'WIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA binary\n').encode())
    rec = np.zeros(n, dtype=[('x', '<f8'), ('y', '<f8'), ('z', '<f8'), ('i', '<f4')])
    rec['x'], rec['y'], rec['z'], rec['i'] = P[:, 0], P[:, 1], P[:, 2], a[:, 3]
    f.write(rec.tobytes())
with open(f'{out}/utm_traj.txt', 'w') as f:
    f.write('# t x y z\n')
    for line in open(f'{out}/c_trajectory.txt'):
        if line.startswith('#'): continue
        t, x, y, z = map(float, line.split())
        f.write(f'{t:.3f} {x + OFF[0]:.4f} {y + OFF[1]:.4f} {z + OFF[2]:.4f}\n')
print('ok utm')
