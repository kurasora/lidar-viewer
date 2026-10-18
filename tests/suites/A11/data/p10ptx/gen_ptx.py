# 変換行列つきの PTX（2 スキャン）。仕様どおり「行ベクトル × 行列（最後の行が平行移動）」での正解も書く
import sys; sys.path.insert(0, sys.argv[1])
from synth import *
rng = np.random.default_rng(80)
scans = [(rotz(30), np.array([10.0, 20.0, 1.0])), (rotx(10) @ rotz(-50), np.array([100.0, 200.0, 3.0]))]
lines, expect = [], []
for R, t in scans:
    cols, rows = 6, 5
    P = np.c_[rng.uniform(1, 8, cols * rows), rng.uniform(-3, 3, cols * rows), rng.uniform(-1, 2, cols * rows)]
    P[7] = 0  # 測れなかったマス
    lines += [str(cols), str(rows), '0 0 0', '1 0 0', '0 1 0', '0 0 1']
    M = R.T  # 行ベクトルの形: p' = p · Rᵀ + t
    for i in range(3): lines.append(f'{M[i,0]:.10f} {M[i,1]:.10f} {M[i,2]:.10f} 0')
    lines.append(f'{t[0]:.10f} {t[1]:.10f} {t[2]:.10f} 1')
    for i, p in enumerate(P): lines.append(f'{p[0]:.6f} {p[1]:.6f} {p[2]:.6f} 0.5')
    expect += [(R @ p + t).tolist() for i, p in enumerate(P) if i != 7]
open('mat2.ptx', 'w').write('\n'.join(lines) + '\n')
np.save('mat2_expect.npy', np.array(expect))
print(len(expect), 'points')
