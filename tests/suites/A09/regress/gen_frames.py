#!/usr/bin/env python3
# たくさんの小さな点群（LiDAR の 1 フレームごとの PCD のような物）を作る
#   python3 gen_frames.py --count 200 --n 20000 --out DIR [--fmt pcd|las]
#   廊下の地図（sample/map.json）の中を、軌跡に沿って進むセンサーから半径 30 m 以内の点を n 点ずつ取る（フレームごとに位置が進む）
import argparse, json, base64, os
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--count', type=int, default=200)
ap.add_argument('--n', type=int, default=20000)
ap.add_argument('--out', required=True)
ap.add_argument('--fmt', default='pcd')
ap.add_argument('--prefix', default='frame')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
d = json.load(open('/home/claude/pcd-viewer/sample/map.json'))
n0 = d['n']
q = np.frombuffer(base64.b64decode(d['b64']), dtype='<u2').reshape(n0, 3).astype(np.float64)
P0 = q * np.array(d['sc']) + np.array(d['lo'])
I0 = np.frombuffer(base64.b64decode(d['b64i']), dtype=np.uint8).astype(np.float32)
traj = np.loadtxt('/home/claude/pcd-viewer/sample/trajectory.txt')[:, 1:4]
rng = np.random.default_rng(5)
for k in range(a.count):
    c = traj[int(k / max(1, a.count - 1) * (len(traj) - 1))]
    near = np.nonzero(np.sum((P0[:, :2] - c[:2]) ** 2, 1) < 900)[0]
    if len(near) == 0: near = np.arange(n0)
    idx = near[rng.integers(0, len(near), a.n)]
    P = P0[idx] + rng.normal(0, 0.01, (a.n, 3))
    I = I0[idx]
    name = os.path.join(a.out, f'{a.prefix}_{k:04d}.pcd')
    with open(name, 'wb') as f:
        f.write(f"# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH {a.n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {a.n}\nDATA binary\n".encode())
        rec = np.empty(a.n, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('i', '<f4')])
        rec['x'], rec['y'], rec['z'] = P.T; rec['i'] = I
        f.write(rec.tobytes())
print(json.dumps({'count': a.count, 'n': a.n, 'out': a.out}))
