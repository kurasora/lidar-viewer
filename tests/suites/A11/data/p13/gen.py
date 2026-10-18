import sys; sys.path.insert(0, sys.argv[1])
from synth import *
pts = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.002, seed=31)
write_pcd('room_far.pcd', np.vstack([pts, [[1e6, 1e6, 1e6]]]), dtype='F', size=8)
write_pcd('room_far5k.pcd', np.vstack([pts, [[5000, 5000, 100]]]), dtype='F', size=8)
write_pcd('room_ok.pcd', pts)
