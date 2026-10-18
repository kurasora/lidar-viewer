# 点の大きさ（実際の大きさ）と選択: 上の層は 1 m 間隔のまばらな点、5 m 下に密な床
import sys; sys.path.insert(0, sys.argv[1])
from synth import *
rng = np.random.default_rng(150)
g = np.arange(0, 10.01, 1.0); X, Y = np.meshgrid(g, g); top = np.c_[X.ravel(), Y.ravel(), np.zeros(X.size)]
low = plane([0, 0, -5], [1, 0, 0], [0, 1, 0], 10, 10, 0.02, rng)
write_pcd('sizes.pcd', np.vstack([top, low]))
