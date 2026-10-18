import sys; sys.path.insert(0, sys.argv[1])
from synth import *
write_pcd('room_noceil.pcd', room(L=20, Wd=3, H=2.7, step=0.05, noise=0.002, seed=71, ceiling=False))
rng = np.random.default_rng(72)
c = plane([0, 0, 2.7], [1, 0, 0], [0, 1, 0], 20, 3, 0.05, rng); c += rng.normal(0, 0.002, c.shape)
write_pcd('ceil_only.pcd', c)
