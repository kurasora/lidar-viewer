import sys; sys.path.insert(0, sys.argv[1])
from synth import *
pts = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.002, seed=1)
inten = (np.arange(len(pts)) % 200).astype(np.float32)
write_pcd('room.pcd', pts, {'intensity': (inten, 'F', 4)})
print(len(pts), pts.min(0), pts.max(0))
