#!/usr/bin/env python3
# 点数の見込み（hint）が外れる文字の点群を作る（H3 の確認用）
#   python3 gen_hint.py OUTDIR [n=5000000]
#   short_first.xyz … 先頭 4,000 行だけ短い（"0 0 0 0 0 0 0"）、あとは普通の長さ → 点数を多めに見積もる
#   long_first.xyz  … 先頭 4,000 行だけ長い（小数 9 けた）、あとは短め → 点数を少なめに見積もる（倍々で確保し直す）
#   normal.xyz      … 比べる用（全部同じ長さ）
import sys, os
import numpy as np
out = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 5_000_000
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(3)
def body(f, m, fmt):
    for s in range(0, m, 1_000_000):
        k = min(1_000_000, m - s)
        P = rng.uniform(0, 50, (k, 3)); C = rng.integers(0, 256, (k, 3)); I = rng.integers(0, 256, k)
        np.savetxt(f, np.column_stack([P, C, I]), fmt=fmt)
with open(os.path.join(out, 'normal.xyz'), 'wb') as f: body(f, n, '%.4f %.4f %.4f %d %d %d %d')
with open(os.path.join(out, 'short_first.xyz'), 'wb') as f:
    f.write(b'0 0 0 0 0 0 0\n' * 4000); body(f, n - 4000, '%.4f %.4f %.4f %d %d %d %d')
with open(os.path.join(out, 'long_first.xyz'), 'wb') as f:
    body(f, 4000, '%.9f %.9f %.9f %d %d %d %d'); body(f, n - 4000, '%.2f %.2f %.2f %d %d %d %d')
for k in ('normal', 'short_first', 'long_first'):
    print(k, os.path.getsize(os.path.join(out, k + '.xyz')))
