import sys; sys.path.insert(0, sys.argv[1])
from synth import *
import laspy
rng = np.random.default_rng(60)
write_pcd('sp_room.pcd', room(L=20, Wd=3, H=2.7, step=0.05, noise=0.002, seed=61))
# サンプルの地図（map.laz、36 万点）を PCD に
f = laspy.read('/home/claude/pcd-viewer/sample/map.laz'); write_pcd('sp_map.pcd', np.c_[f.x, f.y, f.z])
# 同じ点が 2 回ずつ（重複）
r = room(L=10, Wd=3, H=2.7, step=0.05, noise=0.002, seed=62); write_pcd('sp_dup.pcd', np.vstack([r, r]))
# まばら: 1 km 四方に 5000 点
write_pcd('sp_sparse1km.pcd', np.c_[rng.uniform(0, 1000, 5000), rng.uniform(0, 1000, 5000), rng.uniform(0, 10, 5000)])
# DEM 風: 30 m 間隔の格子 200×200（高さは起伏）
g = np.arange(200) * 30.0; X, Y = np.meshgrid(g, g); Z = 100 + 50 * np.sin(X / 900) * np.cos(Y / 700)
write_pcd('sp_dem30.pcd', np.c_[X.ravel(), Y.ravel(), Z.ravel()])
# 2 つの密度: 密な床 1 cm 間隔 + まばらな 1 m 間隔の点
a = plane([0, 0, 0], [1, 0, 0], [0, 1, 0], 2, 2, 0.01, rng); b = np.c_[rng.uniform(0, 100, 40000), rng.uniform(0, 100, 40000), rng.uniform(0, 5, 40000)]
write_pcd('sp_mixed.pcd', np.vstack([a, b]))
