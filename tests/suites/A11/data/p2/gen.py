import sys; sys.path.insert(0, sys.argv[1])
from synth import *
rng = np.random.default_rng(5)
# 200 万点の平らな箱（0〜10 × 0〜10 × 0〜3）と、遠くの 10 点（x = 50）
n = 2_000_000
P = np.c_[rng.uniform(0, 10, n), rng.uniform(0, 10, n), rng.uniform(0, 3, n)]
far = np.c_[np.full(10, 50.0), rng.uniform(0, 10, 10), rng.uniform(0, 3, 10)]
Q = np.vstack([P, far])
write_pcd('box_far.pcd', Q)
save_json('truth_box_far.json', {'min': Q.min(0), 'max': Q.max(0), 'n': len(Q)})
print(Q.min(0), Q.max(0))
