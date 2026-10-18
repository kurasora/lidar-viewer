# pose（回転の四元数 + 平行移動）つきの E57 を pye57 で書き、pye57 自身の変換（transform=True）を正解にする
import numpy as np, pye57, json
from scipy.spatial.transform import Rotation as Rot
rng = np.random.default_rng(70)
e = pye57.E57('pose2.e57', mode='w')
truth = []
for k, (ang, axis, t) in enumerate([(30, [0, 0, 1], [539100.0, 3836050.0, 30.0]), (20, [1, 2, 3], [539000.5, 3836000.25, 30.0])]):
    n = 2000
    xyz = np.c_[rng.uniform(-5, 5, n), rng.uniform(-5, 5, n), rng.uniform(-1, 2, n)]
    q = Rot.from_rotvec(np.radians(ang) * np.array(axis) / np.linalg.norm(axis)).as_quat()  # x y z w
    wxyz = np.array([q[3], q[0], q[1], q[2]])
    e.write_scan_raw({'cartesianX': xyz[:, 0], 'cartesianY': xyz[:, 1], 'cartesianZ': xyz[:, 2]}, name=f'scan{k}', rotation=wxyz, translation=np.array(t))
    truth.append((Rot.from_quat(q).apply(xyz) + t))
e.close()
r = pye57.E57('pose2.e57')
ref = [r.read_scan(i, transform=True, ignore_missing_fields=True) for i in range(r.scan_count)]
ref = np.vstack([np.c_[d['cartesianX'], d['cartesianY'], d['cartesianZ']] for d in ref])
mine = np.vstack(truth)
print('pye57 と scipy の差（最大）', np.abs(ref - mine).max())
np.save('pose2_ref.npy', ref)
