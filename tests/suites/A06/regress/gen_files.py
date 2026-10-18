# A06 の試験用ファイルを作る: python3 gen_files.py <出力フォルダ>
#  元: サンプルの廊下の点群 5,000 点（pcl_ascii.pcd）
import sys, os, numpy as np
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
src = '/home/claude/pcd-viewer/sample/formats/pcl_ascii.pcd'
lines = open(src).read().split('\n')
i = lines.index('DATA ascii')
P = np.array([[float(v) for v in l.split()[:3]] for l in lines[i + 1:] if l.strip()], dtype=np.float64)
n = len(P)
rng = np.random.default_rng(1)
inten = np.clip(40 + 60 * (P[:, 2] - P[:, 2].min()) / np.ptp(P[:, 2]) + rng.normal(0, 15, n), 0, 255).astype(np.float32)
label = (np.floor((P[:, 0] - P[:, 0].min()) / 20)).astype(np.float32)

def write_pcd(path, cols, names, types, sizes):
    hdr = ('# .PCD v0.7\nVERSION 0.7\nFIELDS %s\nSIZE %s\nTYPE %s\nCOUNT %s\nWIDTH %d\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS %d\nDATA binary\n'
           % (' '.join(names), ' '.join(map(str, sizes)), ' '.join(types), ' '.join(['1'] * len(names)), n, n))
    dt = np.dtype([(nm, ('<f8' if s == 8 else '<f4')) for nm, s in zip(names, sizes)])
    a = np.zeros(n, dtype=dt)
    for nm, c in zip(names, cols): a[nm] = c
    with open(path, 'wb') as f: f.write(hdr.encode()); f.write(a.tobytes())

# 1) 反射（intensity）だけ
write_pcd(f'{out}/corr_intensity.pcd', [P[:, 0], P[:, 1], P[:, 2], inten], ['x', 'y', 'z', 'intensity'], ['F'] * 4, [4] * 4)
# 2) 反射とラベル（label）
write_pcd(f'{out}/corr_int_label.pcd', [P[:, 0], P[:, 1], P[:, 2], inten, label], ['x', 'y', 'z', 'intensity', 'label'], ['F'] * 5, [4] * 5)
# 3) 項目なし（xyz だけ）
write_pcd(f'{out}/corr_xyz.pcd', [P[:, 0], P[:, 1], P[:, 2]], ['x', 'y', 'z'], ['F'] * 3, [4] * 3)
# 4) 座標 1e7（float64）
write_pcd(f'{out}/corr_1e7.pcd', [P[:, 0] + 1.2e7, P[:, 1] - 3.4e7, P[:, 2] + 1000.0, inten], ['x', 'y', 'z', 'intensity'], ['F'] * 4, [8, 8, 8, 4])
# 5) 壊れた PCD（頭書きだけで点がない・数が合わない）
open(f'{out}/broken_header.pcd', 'w').write('# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 100\nHEIGHT 1\nPOINTS 100\nDATA binary\n' + 'x' * 10)
# 6) 開けない形式（RIEGL）
open(f'{out}/scan.rdb', 'wb').write(b'\0' * 64)
# 7) 知らない拡張子
open(f'{out}/notes.abc', 'w').write('hello')
print('wrote', sorted(os.listdir(out)))
