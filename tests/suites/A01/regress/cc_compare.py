# CloudCompare（cc_oracle.sh の ASC）とアプリ（out/node、なければ out/browser）の読み方を比べる（参考の比較。どちらが正しいかは報告で判断する）
import os, json, base64, glob, re
import numpy as np
from scipy.spatial import cKDTree
R = os.path.dirname(os.path.abspath(__file__))
man = json.load(open(os.path.join(R, 'data/manifest.json')))
byfile = {}
for c in man: byfile.setdefault(c['files'][0], c['id'])
dec = lambda s, dt: np.frombuffer(base64.b64decode(s), dt) if s else None


def read_cc(rel):
    out = []
    for f in sorted(glob.glob(os.path.join(R, 'out/cc_oracle', rel + '.*.asc'))):
        lines = open(f, encoding='utf-8', errors='replace').read().splitlines()
        head = lines[0].lstrip('/').split(' ') if lines and lines[0].startswith('//') else None
        rows = [l.split(' ') for l in lines[1 if head else 0:] if l.strip()]
        out.append((head, rows))
    return out


for rel in open(os.path.join(R, 'cc_oracle.list')).read().split():
    got = read_cc(rel)
    log = os.path.join(R, 'out/cc_oracle', rel + '.log')
    err = ''
    if os.path.exists(log):
        L = open(log, errors='replace').read()
        m = re.findall(r'(?:ERR|Error|error|Warning|WARNING)[^\n]*', L)
        err = ' / '.join(m[:2])
    cid = byfile.get(rel)
    app = None
    for d in ('out/node', 'out/browser'):
        fn = os.path.join(R, d, (cid or '') + '.json')
        if cid and os.path.exists(fn): app = json.load(open(fn)); break
    if not got:
        print(f"[CC] {rel}: CloudCompare は開けなかった（{err[:150]}）｜アプリ: {'開けた ' + str(app.get('n')) + ' 点' if app and app.get('ok') else (app or {}).get('error')}")
        continue
    head = got[0][0]
    rows = [r for g in got for r in g[1]]
    P = np.array([[float(v) for v in r[:3]] for r in rows])
    names = head[3:] if head else []
    hasC = names[:3] == ['R', 'G', 'B']
    s = f"[CC] {rel}: CloudCompare {len(P)} 点・欄 {names}"
    if app and app.get('ok'):
        A = dec(app['P'], '<f8').reshape(-1, 3)
        d, i = cKDTree(P).query(A)
        s += f" ｜ アプリ {app['n']} 点・欄 {app.get('fields')}・色 {app.get('rgb')}・座標の最大差 {np.abs(A - P[i]).max():.3g}"
        if hasC and app.get('C'):
            Cc = np.array([[int(float(v)) for v in r[3:6]] for r in rows]); Ca = dec(app['C'], 'u1').reshape(-1, 3)
            s += f"・色の違う点 {int((np.abs(Ca.astype(int) - Cc[i]).max(1) > 1).sum())}"
        elif hasC: s += '・アプリは色なし（CloudCompare は色あり）'
        elif app.get('rgb'): s += '・アプリは色あり（CloudCompare は色なし）'
    else:
        s += f" ｜ アプリ: 開けない（{(app or {}).get('error')}）"
    if err: s += f" ｜ CC の警告: {err[:120]}"
    print(s)
