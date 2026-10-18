#!/bin/bash
# 頭書きの点数が 10 億の LAS（中身は 20 万点）を、上限 10 億・3,000 万で読む（Node で読み込み部品を直接）
W=$(cd "$(dirname "$0")/.." && pwd); T=$(cd "$W/../.." && pwd)
for cap in 1000000000 300000000 30000000; do echo "cap=$cap"; node --no-warnings $T/harness/read.mjs $W/data/fakehdr/c200k_hdr1G.las --cap=$cap | cut -c1-400; done
