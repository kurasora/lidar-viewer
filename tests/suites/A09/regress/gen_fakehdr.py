#!/usr/bin/env python3
# 頭書きの点数が実際より多い LAS（記録が途中で切れた・頭書きを直し忘れた LAS のまね）
#   python3 gen_fakehdr.py SRC.las OUT.las [頭書きに書く点数=100000000]
import sys, struct, shutil
src, out = sys.argv[1], sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv) > 3 else 100_000_000
shutil.copyfile(src, out)
with open(out, 'r+b') as f:
    f.seek(107); f.write(struct.pack('<I', min(n, 0xffffffff)))
print(out, n)
