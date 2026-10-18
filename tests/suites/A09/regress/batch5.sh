#!/bin/bash
# 上限 1 億点で 5,000 万点の LAS を制限なしに開く（このマシン 8 GB に収まるか）。guard に止められたらそれが結果
#   MEM=7000 TIMEOUT=2400 $T/bin/bigmem bash batch5.sh
W=$(cd "$(dirname "$0")/.." && pwd)
cd "$W/regress"
export TMPDIR=${TMPDIR:-/tmp/a09t}
OUT=$W/out/b4.jsonl
# 故障注入のやり直し（途中経過つき）: 上限 1 億 + 画面 +2.5 GB で 5,000 万点、+1.2 GB で 3,000 万点（失敗後に別スレッドに残る量も）
echo "== oom-a2 $(date +%T)"; node oom_inject.js --target=renderer --headroom=2500 --cap=100000000 --out=$OUT $W/data/50M/c50M.las > /dev/null 2>&1
echo "== oom-b2 $(date +%T)"; node oom_inject.js --target=renderer --headroom=1200 --shot=$W/shots/oom_b2.png --after=$W/data/small/c200k_bin.pcd --out=$OUT $W/data/30M/c30M.las > /dev/null 2>&1
echo "== cap1e8-las $(date +%T)"
node perf_load.js --cap=100000000 --close --label=cap1e8_c50M_las --live=$W/out/live_cap1e8.json --out=$OUT $W/data/50M/c50M.las > /dev/null 2>&1
echo "== done $(date +%T) rc=$?"
