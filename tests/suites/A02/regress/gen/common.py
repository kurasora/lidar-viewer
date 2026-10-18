# 試験用ファイルと期待値を作るための共通部品
#   case(...) で 1 件の試験を登録し、最後に save() で data/cases.json に書く
import json, os, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, '..', 'data'))
os.makedirs(DATA, exist_ok=True)
CASES = []
TARGET = 1_000_000  # addMesh が面の上に散らす点の数（頂点を含めて）


def path(*p):
    q = os.path.join(DATA, *p)
    os.makedirs(os.path.dirname(q), exist_ok=True)
    return q


def case(cid, files, expect, where=('node', 'browser'), desc='', drop=False, cap=None):
    """files: data/ からの相対パスの並び（同時に選ぶ組）。where: node / browser / electron / artifact"""
    CASES.append({'id': cid, 'files': list(files), 'expect': expect, 'where': list(where), 'desc': desc, 'drop': drop, **({'cap': cap} if cap else {})})


def save():
    ids = [c['id'] for c in CASES]
    dup = {i for i in ids if ids.count(i) > 1}
    assert not dup, dup
    with open(os.path.join(DATA, 'cases.json'), 'w') as f:
        json.dump(CASES, f, ensure_ascii=False, indent=1)
    print(f'{len(CASES)} cases -> {DATA}/cases.json')


# ---------------------------------------------------------------- 形
def box(x0, y0, z0, x1, y1, z1):
    V = np.array([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], float)
    T = np.array([[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]], int)
    return V, T


def quad(p0, p1, p2, p3):
    V = np.array([p0, p1, p2, p3], float)
    T = np.array([[0, 1, 2], [0, 2, 3]], int)
    return V, T


def merge(parts):
    """parts: [(V, T, color or None, name)] → V, T, C(頂点色 or None), part_of_tri"""
    Vs, Ts, Cs, pid = [], [], [], []
    o = 0
    anyc = any(p[2] is not None for p in parts)
    for k, (V, T, c, name) in enumerate(parts):
        Vs.append(V); Ts.append(T + o); o += len(V)
        if anyc: Cs.append(np.tile(np.array(c if c is not None else [200, 200, 200], float), (len(V), 1)))
        pid += [k] * len(T)
    return np.vstack(Vs), np.vstack(Ts), (np.vstack(Cs) if anyc else None), np.array(pid)


def tri_areas(V, T):
    a, b, c = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
    return 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)


def mesh_expect(parts, target=TARGET, eps=None, ctol=4, extra=None, color_override=None, vertex_count=None):
    """parts: [(V, T, color, name)]（世界座標）。addMesh の期待値（範囲・平均・部品ごとの割合と色・はぐれ点）
    vertex_count: 形式によって頂点の数が変わる（STL は三角形ごとに 3 頂点）ときに指定"""
    V, T, C, pid = merge(parts)
    A = tri_areas(V, T)
    tot = A.sum()
    nv = len(V) if vertex_count is None else vertex_count
    K = max(0, int(target - nv))
    lo, hi = V.min(0), V.max(0)
    ext = float(np.max(hi - lo)) or 1.0
    eps = eps if eps is not None else max(1e-6, 1e-4 * ext)
    cen = (V[T[:, 0]] + V[T[:, 1]] + V[T[:, 2]]) / 3
    # 頂点（nv 点）＋ 面積に比例した K 点
    vsum = V.sum(0) * (nv / len(V))
    mean = (vsum + K * (A[:, None] * cen).sum(0) / tot) / (nv + K)
    eparts = []
    for k, (Vp, Tp, c, name) in enumerate(parts):
        ak = A[pid == k].sum() / tot
        f = (K * ak + len(Vp) * nv / len(V)) / (nv + K)
        b = np.concatenate([Vp.min(0) - eps, Vp.max(0) + eps]).tolist()
        p = {'name': name, 'box': b, 'frac': [max(0, f - 0.01), f + 0.01]}
        if color_override is not None: c = color_override[k]
        if c is not None: p['color'] = list(map(float, c)); p['ctol'] = ctol
        eparts.append(p)
    e = {'n': [nv + K - 2, nv + K + 1], 'bbox': [lo.tolist(), hi.tolist()], 'tol': max(1e-4, 1e-5 * ext), 'mean': mean.tolist(), 'mtol': max(0.002, 0.003 * ext),
         'parts': eparts, 'strayMax': 0.0, 'note': '面の上に点を散らして'}
    if extra: e.update(extra)
    return e


def two_boxes(red=(255, 0, 0), blue=(0, 0, 255)):
    a = box(0, 0, 0, 1, 1, 1)
    b = box(3, 0, 0, 5, 2, 1)
    return [(a[0], a[1], red, 'A'), (b[0], b[1], blue, 'B')]


def parts_spec(e):
    return {'parts': [{'name': p['name'], 'box': p['box']} for p in e.get('parts', [])]}


def fmtnum(x):
    s = repr(float(x))
    return s[:-2] if s.endswith('.0') else s
