#!/bin/bash
# loadab.sh … 受信バッファ（SO_RCVBUF）を大きくした live.js（projfix）と元の live.js で、取りこぼしを交互に比べる（a072 の中で）
W=$(cd "$(dirname "$0")/.." && pwd); cd $W
for k in 1 2; do
  echo "--- 元 ($k)"; APPDIR=/home/claude/pcd-viewer timeout 120 lib/enode t/load.js | grep -E "E2-load-(500000|1000000)" | cut -c1-200
  echo "--- 受信バッファ 4 MB ($k)"; APPDIR=$W/projfix timeout 120 lib/enode t/load.js | grep -E "E2-load-(500000|1000000)" | cut -c1-200
done
