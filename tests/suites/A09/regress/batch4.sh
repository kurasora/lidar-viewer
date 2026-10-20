#!/bin/bash
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
# 5,000 万点（上限より多い）と、メモリの足りない状況（故障注入）
#   $T/bin/bigmem bash batch4.sh   （TIMEOUT=6000 MEM=6000 くらい）
#   ※ 上限 1 億で 5,000 万点を制限なしに読む試験は、guard に全体を止められるおそれがあるので batch5.sh に分けた
W=$(cd "$(dirname "$0")/.." && pwd)
cd "$W/regress"
export TMPDIR=${TMPDIR:-/tmp/a09t}
OUT=$W/out/b4.jsonl
D=$W/data/50M
mkdir -p $D $W/data/sweep
log() { echo "== $* $(date +%T)"; }
# 30M は las だけ残す
rm -f $W/data/30M/c30M_bin.pcd $W/data/30M/c30M.laz $W/data/30M/c30M_ascii.pcd $W/data/30M/c30M.ply $W/data/30M/c30M.e57 $W/data/30M/c30M_bc.pcd
if [ ! -f $D/c50M.laz ]; then log gen50M; python3 gen_big.py --n 50000000 --out $D --formats pcd_bin,las,laz --name c50M > $W/out/gen50M.log 2>&1; fi
if [ ! -f $W/data/sweep/sweep_50M_bin.pcd ]; then log gensweep; python3 gen_big.py --n 50000000 --kind sweep --out $W/data/sweep --formats pcd_bin --name sweep_50M > $W/out/gensweep.log 2>&1; fi
ls -la $D $W/data/sweep; df -h / | tail -1
log perf50-las; node perf_load.js --stats --close --out=$OUT $D/c50M.las > /dev/null 2>&1
log perf50-pcd; node perf_load.js --close --out=$OUT $D/c50M_bin.pcd > /dev/null 2>&1
log perf50-laz; node perf_load.js --close --out=$OUT $D/c50M.laz > /dev/null 2>&1
log sweep-cap10M; node perf_load.js --cap=10000000 --stats --level=0 --out=$OUT $W/data/sweep/sweep_50M_bin.pcd > /dev/null 2>&1
log sweep-cap30M; node perf_load.js --stats --level=0 --out=$OUT $W/data/sweep/sweep_50M_bin.pcd > /dev/null 2>&1
# 故障注入: 画面のプロセスの RLIMIT_DATA を「今 + headroom」に絞る
log oom-a; node oom_inject.js --target=renderer --headroom=2500 --cap=100000000 --shot=$W/shots/oom_a.png --after=$W/data/small/c200k_bin.pcd --out=$OUT $D/c50M.las > /dev/null 2>&1
log oom-b; node oom_inject.js --target=renderer --headroom=1200 --shot=$W/shots/oom_b.png --after=$W/data/small/c200k_bin.pcd --out=$OUT $W/data/30M/c30M.las > /dev/null 2>&1
log oom-c; node oom_inject.js --target=renderer --headroom=500 --shot=$W/shots/oom_c.png --after=$W/data/small/c200k_bin.pcd --out=$OUT $W/data/10M/c10M.las > /dev/null 2>&1
log oom-d; node oom_inject.js --target=gpu --headroom=150 --shot=$W/shots/oom_d.png --after=$W/data/small/c200k_bin.pcd --out=$OUT $W/data/10M/c10M.las > /dev/null 2>&1
log oom-e; node oom_inject.js --target=renderer --headroom=900 --cap=1000000000 --shot=$W/shots/oom_e.png --after=$W/data/small/c200k_bin.pcd --out=$OUT $W/data/10M/c10M_bin.pcd $W/data/10M/c10M.las $W/data/10M/c10M.laz > /dev/null 2>&1
log kill-el; xvfb-run -a -n 190 node oom_inject.js --electron --kill --kill-after=3 --shot=$W/shots/oom_kill_electron.png --out=$OUT $W/data/10M/c10M.las > /dev/null 2>&1
# 点数の見込み（hint）が外れる文字の点群: 別スレッドに余分な入れ物が残るか（H3）
if [ ! -f $W/data/hint/long_first.xyz ]; then log genhint; python3 gen_hint.py $W/data/hint 5000000 > $W/out/genhint.log 2>&1; fi
for f in normal short_first long_first; do log hint-$f; node perf_load.js --level=0 --out=$OUT $W/data/hint/$f.xyz > /dev/null 2>&1; done
rm -rf $W/data/hint
log done
