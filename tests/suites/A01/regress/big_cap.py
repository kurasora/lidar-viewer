# 点数の上限の境界（本物の最小の選択肢 1,000 万点）: 10,000,001 点の PCD（binary、x y z intensity）を作る
#   python3 big_cap.py <出力フォルダ>  → big10m1.pcd（約 160 MB）
import sys, os, numpy as np
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
m = 10_000_001
fn = os.path.join(out, 'big10m1.pcd')
hdr = f'VERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH {m}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {m}\nDATA binary\n'
rng = np.random.default_rng(1)
with open(fn, 'wb') as f:
    f.write(hdr.encode())
    step = 1_000_000
    for s in range(0, m, step):
        k = min(step, m - s)
        a = np.empty((k, 4), '<f4')
        i = np.arange(s, s + k)
        a[:, 0] = (i % 10000) * 0.01; a[:, 1] = (i // 10000) * 0.01; a[:, 2] = rng.uniform(0, 3, k); a[:, 3] = i % 256
        f.write(a.tobytes())
print(fn, os.path.getsize(fn))
