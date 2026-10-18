#!/bin/bash
# 上限の境界（上限ちょうど・上限＋1・上限−1）: Node で読み込み部品を直接動かす（light で流す）
W=$(cd "$(dirname "$0")/.." && pwd); T=$(cd "$W/../.." && pwd)
for n in 999 1000 1001 2000; do node --no-warnings $T/harness/read.mjs $W/data/bnd/seq_$n.pcd --cap=1000; done
