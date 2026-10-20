#!/bin/bash
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
# 中くらい（200 万点）のファイルで、計測の仕掛けの確認と、リーク・多数ファイルの試験（bigmem の中で流す）
#   $T/bin/bigmem bash batch1.sh
W=$(cd "$(dirname "$0")/.." && pwd)
cd "$W/regress"
export TMPDIR=${TMPDIR:-/tmp/a09t}
OUT=$W/out/b1.jsonl
D=$W/data/2M
echo "== prof $(date +%T)"
PAGE=http://127.0.0.1:8740/abs$W/proj/dist/index.html node prof_load.js --save=$W/out/prof_c2M_las $D/c2M.las > $W/out/prof_c2M_las.json 2>&1
for f in c2M_bin.pcd c2M_bc.pcd c2M.las c2M.laz; do echo "== perf $f $(date +%T)"; node perf_load.js --close --out=$OUT $D/$f > /dev/null 2>&1; done
echo "== many 50 $(date +%T)"; node many_files.js --limit=600 --out=$OUT $W/data/frames200 50 > /dev/null 2>&1
for s in reopen:5 color:4 cmap:10 measure:3 level:4 pick:10; do echo "== scen $s $(date +%T)"; node scenarios.js ${s%%:*} --k=${s##*:} --out=$OUT $D/c2M.las > /dev/null 2>&1; done
echo "== done $(date +%T)"
