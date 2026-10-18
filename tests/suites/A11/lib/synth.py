# 合成の点群（正解が分かっている形）を作る部品
import numpy as np, struct, json

def rotx(d):
    a = np.radians(d); c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def roty(d):
    a = np.radians(d); c, s = np.cos(a), np.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def rotz(d):
    a = np.radians(d); c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def plane(o, u, v, lu, lv, step, rng=None, jitter=True):
    """o + a*u + b*v（a∈[0,lu), b∈[0,lv)）の格子。jitter で格子を少し崩す"""
    o, u, v = map(np.asarray, (o, u, v))
    a = np.arange(0, lu, step); b = np.arange(0, lv, step)
    A, B = np.meshgrid(a, b)
    A = A.ravel(); B = B.ravel()
    if jitter and rng is not None:
        A = A + rng.uniform(0, step, A.size); B = B + rng.uniform(0, step, B.size)
        keep = (A < lu) & (B < lv); A, B = A[keep], B[keep]
    return o + A[:, None] * u + B[:, None] * v

def room(L=20.0, Wd=3.0, H=2.7, step=0.05, noise=0.003, seed=0, ceiling=True, walls=True, endwalls=True, floor=True):
    """廊下の形: 床 z=0、天井 z=H、横の壁 y=0 / y=Wd、端の壁 x=0 / x=L。x が廊下の向き"""
    rng = np.random.default_rng(seed)
    P = []
    ex, ey, ez = np.eye(3)
    if floor: P.append(plane([0, 0, 0], ex, ey, L, Wd, step, rng))
    if ceiling: P.append(plane([0, 0, H], ex, ey, L, Wd, step, rng))
    if walls:
        P.append(plane([0, 0, 0], ex, ez, L, H, step, rng))
        P.append(plane([0, Wd, 0], ex, ez, L, H, step, rng))
    if endwalls:
        P.append(plane([0, 0, 0], ey, ez, Wd, H, step, rng))
        P.append(plane([L, 0, 0], ey, ez, Wd, H, step, rng))
    pts = np.vstack(P)
    pts += rng.normal(0, noise, pts.shape)
    return pts

def write_pcd(path, pts, fields=None, dtype='F', size=4, ascii=False):
    """fields: {name: (array, type, size)}"""
    pts = np.asarray(pts, dtype=np.float64)
    n = len(pts)
    names = ['x', 'y', 'z']; types = [dtype] * 3; sizes = [size] * 3; cols = [pts[:, 0], pts[:, 1], pts[:, 2]]
    for k, (a, t, s) in (fields or {}).items():
        names.append(k); types.append(t); sizes.append(s); cols.append(np.asarray(a))
    head = (f"# .PCD v0.7\nVERSION 0.7\nFIELDS {' '.join(names)}\nSIZE {' '.join(map(str, sizes))}\nTYPE {' '.join(types)}\n"
            f"COUNT {' '.join(['1'] * len(names))}\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA {'ascii' if ascii else 'binary'}\n")
    if ascii:
        with open(path, 'w') as f:
            f.write(head)
            for i in range(n): f.write(' '.join(repr(float(c[i])) if t == 'F' else str(int(c[i])) for c, t in zip(cols, types)) + '\n')
        return
    dt = np.dtype([(nm, {('F', 4): '<f4', ('F', 8): '<f8', ('U', 1): 'u1', ('U', 2): '<u2', ('U', 4): '<u4', ('I', 4): '<i4'}[(t, s)]) for nm, t, s in zip(names, types, sizes)])
    rec = np.zeros(n, dtype=dt)
    for nm, c in zip(names, cols): rec[nm] = c
    with open(path, 'wb') as f:
        f.write(head.encode()); f.write(rec.tobytes())

def write_txt(path, pts, extra=None, fmt='%.6f', header=None):
    a = np.asarray(pts)
    if extra is not None: a = np.c_[a, extra]
    np.savetxt(path, a, fmt=fmt, header=header or '', comments='')

def nn_median(pts, sample=None, seed=0):
    from scipy.spatial import cKDTree
    t = cKDTree(pts)
    q = pts if sample is None else pts[np.random.default_rng(seed).choice(len(pts), min(sample, len(pts)), replace=False)]
    d, _ = t.query(q, k=2)
    d = d[:, 1]
    d = d[d > 1e-6]
    return float(np.median(d))

def save_json(path, obj):
    with open(path, 'w') as f: json.dump(obj, f, indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
