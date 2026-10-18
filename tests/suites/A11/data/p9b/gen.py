# double の値の欄（時刻）: Livox の ROS ドライバの点（PointXYZRTLT）のように timestamp を F8 で持つ PCD
import sys; sys.path.insert(0, sys.argv[1])
from synth import *
rng = np.random.default_rng(95)
n = 20000
P = np.c_[rng.uniform(0, 10, n), rng.uniform(0, 10, n), rng.uniform(0, 3, n)]
ts = 1791886716.0 + np.arange(n) * 5e-4      # 10 秒間に 2 万点
write_pcd('ts_f8.pcd', P, {'intensity': (rng.uniform(0, 255, n), 'F', 4), 'timestamp': (ts, 'F', 8)})
np.save('ts.npy', ts)
