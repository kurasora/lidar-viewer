# 読み込み中に閉じる試験用の大きな PCD（binary、xyz float32）を作る
#   python3 -I gen_big_pcd.py <出力> [点数=8000000]
import sys
import numpy as np
out = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 8_000_000
rng = np.random.default_rng(1)
xyz = (rng.random((n, 3), dtype=np.float32) * np.array([80, 30, 4], dtype=np.float32)).astype('<f4')
hdr = f'# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA binary\n'
with open(out, 'wb') as f:
    f.write(hdr.encode()); f.write(xyz.tobytes())
print('ok', out, n)
