import json, sys, numpy as np
from scipy.spatial import cKDTree
for line in open(sys.argv[1]):
    d = json.loads(line); P = np.fromfile(d['file'] + '.pos.bin', dtype='<f4').reshape(-1, 3).astype(np.float64)
    t = cKDTree(P); q = P[:min(len(P), 3000)]   # アプリと同じ標本（混ぜたあとの先頭 3000 点）
    dist, _ = t.query(q, k=8)
    nn = np.array([next((x for x in row[1:] if x > 1e-6), np.nan) for row in dist])
    ref = float(np.nanmedian(nn))
    app = d['spacing']
    print(f"{d['file']:18s} n={d['n']:8d} app={app if app is None else round(app, 4)!s:>8s} scipy={ref:.4f}  差={'—' if app is None else f'{(app - ref) / ref * 100:+.1f}%'}")
