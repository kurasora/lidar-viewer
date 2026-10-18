import sys, os; sys.path.insert(0, sys.argv[1])
from synth import *
out = sys.argv[2]; os.makedirs(out, exist_ok=True)
base = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.003, seed=11)
cases = {}
for d in [37, 38, 39, 40, 41, 42, 43, 44, 50, 55]:
    R = rotz(25) @ rotx(d); Q = base @ R.T
    write_pcd(f'{out}/sw{d:02d}.pcd', Q); cases[f'sw{d:02d}'] = {'R': R, 't': [0, 0, 0], 'note': f'傾き {d}°', 'n': len(Q), 'floor_file': (base[np.abs(base[:, 2]) < 0.02] @ R.T)[:2000]}
# 斜めの軸（x と y の間）のまわりに 40°
ax = np.array([1, 1, 0]) / np.sqrt(2); a = np.radians(40)
K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]]); R = np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * K @ K
write_pcd(f'{out}/diag40.pcd', base @ R.T); cases['diag40'] = {'R': R, 't': [0, 0, 0], 'note': '斜めの軸で 40°', 'n': len(base), 'floor_file': (base[np.abs(base[:, 2]) < 0.02] @ R.T)[:2000]}
save_json(f'{out}/truth.json', cases)
