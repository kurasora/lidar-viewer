# bartifact.js の結果を判定する: python3 art_check.py <出力フォルダ>
#   正解 = 同じサンプルを Node で単独に読んだ結果（out/node/sample/<名前>.json。自分のシフトで読むので精度が落ちない）
import sys, os, json, base64
import numpy as np
from scipy.spatial import cKDTree
OUT = sys.argv[1]
R = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(OUT, 'artifact.json')))
dec = lambda s: np.frombuffer(base64.b64decode(s), '<f8').reshape(-1, 3)
print(f"[試作] 最初に開いたもの {r['first']['files']}・S.offset {r['first']['offset']}・ページのエラー {r['errors'][:2]}")
for x in r['results']:
    fn = os.path.join(R, 'out/node/sample', x['name'] + '.json')
    if not os.path.exists(fn):
        print(f"[試作] -- {x['label']}（{x['name']}）: 正解（Node の結果）がない。n={x['n']} S.offset={x['offset']} 知らせ {x['msgs']}"); continue
    t = json.load(open(fn))
    E = dec(t['P']); A = dec(x['P'])
    d, i = cKDTree(E).query(A)
    e = float(np.abs(A - E[i]).max())
    print(f"[試作] {'OK' if e <= 1e-3 else 'NG'} {x['label']}（{x['name']}）: 単独で読んだときとの最大差 {e*1000:.1f} mm（n={x['n']}、共有の S.offset={x['offset']}、単独のシフト={t.get('offset')}）知らせ {x['msgs']}")
