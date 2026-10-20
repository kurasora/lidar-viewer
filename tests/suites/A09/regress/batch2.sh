#!/bin/bash
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
# 1,000 万点の各形式: 作る → 測る（Chromium・Electron）→ 繰り返し（リーク）→ LOD → 読み込み中の操作 → 疎で広い点群（Map の上限）
#   $T/bin/bigmem bash batch2.sh   （TIMEOUT=3600 くらい）
W=$(cd "$(dirname "$0")/.." && pwd)
cd "$W/regress"
export TMPDIR=${TMPDIR:-/tmp/a09t}
OUT=$W/out/b2.jsonl
D=$W/data/10M
mkdir -p $D
log() { echo "== $* $(date +%T)"; }
if [ ! -f $D/c10M.e57 ]; then
  log gen10M
  python3 gen_big.py --n 10000000 --out $D --formats pcd_bin,pcd_ascii,las,laz,ply,xyz,e57 --name c10M > $W/out/gen10M.log 2>&1
  ./pcdbc $D/c10M_bin.pcd $D/c10M_bc.pcd >> $W/out/gen10M.log 2>&1
fi
ls -la $D
for f in c10M_bin.pcd c10M_bc.pcd c10M_ascii.pcd c10M.las c10M.laz c10M.ply c10M.xyz c10M.e57; do log perf $f; node perf_load.js --close --out=$OUT $D/$f > /dev/null 2>&1; done
log electron las; xvfb-run -a -n 190 node perf_load.js --electron --close --out=$OUT $D/c10M.las > /dev/null 2>&1
log electron pcd; xvfb-run -a -n 190 node perf_load.js --electron --close --out=$OUT $D/c10M_bin.pcd > /dev/null 2>&1
log reopen; node scenarios.js reopen --k=20 --out=$OUT $D/c10M_bin.pcd > /dev/null 2>&1
log reopen-laz; node scenarios.js reopen --k=5 --out=$OUT $D/c10M.laz > /dev/null 2>&1
log color; node scenarios.js color --k=8 --out=$OUT $D/c10M.las > /dev/null 2>&1
log lod; node lod.js --out=$OUT $D/c10M.las > /dev/null 2>&1
log during; node during_load.js --out=$OUT $D/c10M.xyz $W/data/small/c200k_bin.pcd $W/data/bnd/seq_2000.pcd > /dev/null 2>&1
# 疎で広い点群（2,500 万点、15 km 四方）: 点の間隔の索引の Map が 2^24 件を超えるはず。後ろに小さなファイル 2 つを並べて、読み込みが 2 本並行にならないか
if [ ! -f $W/data/sparse/sparse_25M.las ]; then log gensparse; python3 gen_big.py --n 25000000 --kind sparse --out $W/data/sparse --formats las --name sparse_25M > $W/out/gensparse.log 2>&1; fi
log sparse; node perf_load.js --stats --out=$OUT $W/data/sparse/sparse_25M.las > /dev/null 2>&1
log sparse+AB; node during_queue.js --out=$OUT $W/data/sparse/sparse_25M.las $W/data/small/c200k_bin.pcd $W/data/bnd/seq_2000.pcd > /dev/null 2>&1
log done
