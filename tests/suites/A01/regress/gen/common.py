# 試験用ファイルの生成の共通部品
#   ・元の点群: 廊下の 5,000 点（tests/sample-generators/samples/src の写し P.npy I.npy RGB.npy。作り物の廊下）
#   ・各試験（case）は data/<id>.<拡張子> と、正解 data/<id>.expect.npz（P: float64 の座標、C: uint8 の色、F_<名前>: 欄の値）
#   ・一覧は data/manifest.json（gen_all.py が書く）
import os, json, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.dirname(HERE)
DATA = os.path.join(REG, 'data')
# 元の点群はリポジトリの作り物の廊下（tests/sample-generators/samples/src）を直接読む（本物の地図から作った前の写しは消した）
SRCDIR = os.path.normpath(os.path.join(HERE, '../../../../sample-generators/samples/src'))
if not os.path.isdir(SRCDIR): SRCDIR = os.environ.get('PCDV_ROOT', '/home/claude/pcd-viewer') + '/tests/sample-generators/samples/src'  # 試験の場所に写したとき
P0 = np.load(os.path.join(SRCDIR, 'P.npy'))
I0 = np.load(os.path.join(SRCDIR, 'I.npy')).astype(np.float64)
RGB0 = np.load(os.path.join(SRCDIR, 'RGB.npy'))
N0 = len(P0)
UTM = np.array([539000.0, 3836000.0, 30.0])

CASES = []


def path(rel):
    p = os.path.join(DATA, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def case(cid, files, desc, *, kind='cloud', node=True, n=None, total=None, skipped=None, P=None, C=None, F=None,
         tol=None, rgb=None, fields=None, error=None, cap=None, group=None, extra=None, mm=None, poses=None, nocheck_points=False):
    """1 つの試験を登録する。
    files: data からの相対パス（先頭が主のファイル、残りは一緒に選ぶ付属ファイル）
    P/C/F: 正解（点の並びは問わない。最近傍で対応づけて比べる）
    tol: 座標の許容誤差（m）。None なら float32 の丸め（|x-シフト|×2^-23 程度）+ 1e-6
    mm: True なら「1 mm 以内」の判定も出す
    """
    e = {'id': cid, 'files': files, 'desc': desc, 'kind': kind, 'node': node, 'n': n, 'total': total, 'skipped': skipped,
         'rgb': rgb, 'fields': fields, 'error': error, 'cap': cap, 'tol': tol, 'mm': mm, 'extra': extra or {}, 'nocheck_points': nocheck_points}
    if P is not None or poses is not None:
        arrs = {}
        if P is not None: arrs['P'] = np.asarray(P, np.float64)
        if C is not None: arrs['C'] = np.asarray(C, np.uint8)
        for k, v in (F or {}).items(): arrs['F_' + k] = np.asarray(v, np.float64)
        if poses is not None: arrs['poses'] = np.asarray(poses, np.float64)
        np.savez(path(cid + '.expect.npz'), **arrs)
        e['expect'] = cid + '.expect.npz'
    if n is None and P is not None and error is None and cap is None and not nocheck_points: e['n'] = int(len(P))
    if total is None and P is not None and error is None and not nocheck_points: e['total'] = int(len(P)) if cap is None else None
    CASES.append(e)
    return e


def write_manifest():
    with open(os.path.join(DATA, 'manifest.json'), 'w') as f:
        json.dump(CASES, f, ensure_ascii=False, indent=1)
    print(f'{len(CASES)} 件の試験を書きました: {DATA}/manifest.json')


def f32(a):
    return np.asarray(a, np.float32).astype(np.float64)


def fmt_rows(cols, fmts, sep=' '):
    """cols: 列の配列のリスト、fmts: 各列の書式 → 行の文字列のリスト"""
    out = []
    n = len(cols[0])
    for i in range(n):
        out.append(sep.join(f % c[i] for f, c in zip(fmts, cols)))
    return out


def reparse(rows, sep=None, idx=(0, 1, 2)):
    """書いた文字列から正解の値を作る（10 進の丸めも含めて正解にする）"""
    vals = []
    for r in rows:
        w = r.split(sep) if sep else r.split()
        vals.append([float(w[i]) for i in idx])
    return np.array(vals, np.float64)
