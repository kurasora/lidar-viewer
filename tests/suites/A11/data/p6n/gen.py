# 床の下の面の広さを変える（床の 2.5〜40%）
import sys; sys.path.insert(0, sys.argv[1])
from synth import *
rng = np.random.default_rng(40)
base = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.003, seed=24)
for frac in [0.025, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4]:
    lx = 20 * frac
    low = plane([2, 0, -3.0], [1, 0, 0], [0, 1, 0], lx, 3, 0.05, rng)
    write_pcd(f'below_{int(frac*1000):03d}.pcd', np.vstack([base, low]))
# 天井だけ斜め（床は水平、天井は 5/10/15/20°）
for deg in [5, 10, 15, 20]:
    B = [plane([0, 0, 0], [1, 0, 0], [0, 1, 0], 20, 6, 0.05, rng)]
    c = plane([0, 0, 0], [1, 0, 0], [0, 1, 0], 20, 6, 0.05, rng); c[:, 2] = 2.4 + c[:, 1] * np.tan(np.radians(deg)); B.append(c)
    for y in [0, 6]: B.append(plane([0, y, 0], [1, 0, 0], [0, 0, 1], 20, 2.4 + y * np.tan(np.radians(deg)), 0.05, rng))
    P = np.vstack(B); P += rng.normal(0, 0.003, P.shape)
    write_pcd(f'slopeceil_{deg:02d}.pcd', P)
