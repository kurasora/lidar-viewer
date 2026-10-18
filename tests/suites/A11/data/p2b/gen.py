import sys; sys.path.insert(0, sys.argv[1])
from synth import *
rng = np.random.default_rng(5)
n = 2_000_010
P = np.c_[rng.uniform(0, 10, n), rng.uniform(0, 10, n), rng.uniform(0, 3, n)]
P[1999991] = [50.0, 5.0, 1.5]       # worker の混ぜ方で 450,461 番目に移る（画面の標本 40 万点の外）
write_pcd('box_far1.pcd', P)
