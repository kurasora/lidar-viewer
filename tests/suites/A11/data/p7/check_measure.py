# 距離の表示（表の「長さ」、mm まで）を、元のファイルの座標（double）での距離と比べる
import json, numpy as np, re, sys, laspy
from scipy.spatial import cKDTree
W = sys.argv[1]; src_jsonl = sys.argv[2]
las = laspy.read(W + '/data/p3/utm_room.las'); L = np.c_[las.x, las.y, las.z]
b = open(W + '/data/p3/utm_room_f8.pcd', 'rb').read(); i = b.index(b'DATA binary\n') + 12
r = np.frombuffer(b[i:], dtype=np.dtype([('x', '<f8'), ('y', '<f8'), ('z', '<f8'), ('i', '<f4')])); Pd = np.c_[r['x'], r['y'], r['z']]
worst = 0
for line in open(src_jsonl):
    d = json.loads(line)
    if not d['label'].startswith('measure'): continue
    src = L if 'las' in d['label'] else Pd; t = cKDTree(src)
    for k, m in enumerate(d['result']['res']):
        a = np.array(m['a']); bb = np.array(m['b'])
        da, ia = t.query(a); A = src[ia]
        if m['shift']: B = bb; db = 0.0   # Shift（水平）は 2 点目が合成の点
        else: db, ib = t.query(bb); B = src[ib]
        true_len = np.linalg.norm(B - A)
        row = m['row'][len(str(k + 1)):]
        shown = float(re.match(r'(\d+\.\d{3})', row).group(1))
        worst = max(worst, abs(shown - true_len))
        print(f"{d['label']:26s} {'水平' if m['shift'] else '    '} 表示 {shown:.3f} m / 元の座標で {true_len:.5f} m（差 {(shown - true_len) * 1000:+.2f} mm、端点の照合 {da * 1000:.3f}/{db * 1000:.3f} mm）")
print(f'最大の差 {worst * 1000:.2f} mm（表示は mm まで丸め）')
