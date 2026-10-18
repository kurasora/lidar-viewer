import sys; sys.path.insert(0, sys.argv[1])
from synth import *
pts = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.002, seed=3, ceiling=False)
# 先頭に 1 点だけ遠くの外れ値（センサーの誤りなど）
Q = np.vstack([[2e7, 0, 0], pts])
write_pcd('room_outlier_first.pcd', Q, dtype='F', size=8)
write_pcd('room_outlier_last.pcd', np.vstack([pts, [2e7, 0, 0]]), dtype='F', size=8)
