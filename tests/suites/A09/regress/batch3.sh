#!/bin/bash
# 3,000 万点の各形式: 作る → 測る（Chromium・Electron）→ プロファイル → 上限 1,000 万での間引き → 消す
#   $T/bin/bigmem bash batch3.sh   （TIMEOUT=6000 MEM=6000 くらい）
W=$(cd "$(dirname "$0")/.." && pwd)
cd "$W/regress"
export TMPDIR=${TMPDIR:-/tmp/a09t}
OUT=$W/out/b3.jsonl
D=$W/data/30M
mkdir -p $D
log() { echo "== $* $(date +%T)"; }
# 前の段の大きなファイルを片付ける（10M は las / pcd / laz だけ残す）
rm -f $W/data/10M/c10M.xyz $W/data/10M/c10M_ascii.pcd $W/data/10M/c10M.ply $W/data/10M/c10M.e57 $W/data/10M/c10M_bc.pcd
# 疎で広い点群 + 小さなファイル 2 つを同時に選ぶ（読み込みが 2 本並行になって名前を取り違えるか）
if [ -f $W/data/sparse/sparse_25M.las ]; then
  log sparse+AB; node during_queue.js --shot=$W/shots/sparse_queue.png --out=$OUT $W/data/sparse/sparse_25M.las $W/data/small/c200k_bin.pcd $W/data/bnd/seq_2000.pcd > /dev/null 2>&1
  rm -f $W/data/sparse/sparse_25M.las
fi
if [ ! -f $D/c30M.e57 ]; then
  log gen30M
  python3 gen_big.py --n 30000000 --out $D --formats pcd_bin,pcd_ascii,las,laz,ply,e57 --name c30M > $W/out/gen30M.log 2>&1
  ./pcdbc $D/c30M_bin.pcd $D/c30M_bc.pcd >> $W/out/gen30M.log 2>&1
fi
ls -la $D; df -h / | tail -1
for f in c30M_bin.pcd c30M_bc.pcd c30M_ascii.pcd c30M.las c30M.laz c30M.ply c30M.e57; do log perf $f; node perf_load.js --close --out=$OUT $D/$f > /dev/null 2>&1; done
log electron las; xvfb-run -a -n 190 node perf_load.js --electron --close --out=$OUT $D/c30M.las > /dev/null 2>&1
log electron pcd; xvfb-run -a -n 190 node perf_load.js --electron --close --out=$OUT $D/c30M_bin.pcd > /dev/null 2>&1
log prof las; PAGE=file://$W/proj/dist/index.html node prof_load.js --save=$W/out/prof_c30M_las $D/c30M.las > $W/out/prof_c30M_las.json 2>&1
log prof electron; APPDIR=$W/proj xvfb-run -a -n 190 node prof_load.js --electron --save=$W/out/prof_c30M_las_el $D/c30M.las > $W/out/prof_c30M_las_el.json 2>&1
log cap10M; node perf_load.js --cap=10000000 --stats --out=$OUT $D/c30M.las > /dev/null 2>&1
log full-stats; node perf_load.js --stats --out=$OUT $D/c30M.las > /dev/null 2>&1
log lod30; node lod.js --out=$OUT $D/c30M.las > /dev/null 2>&1
log pick30; node scenarios.js pick --k=10 --out=$OUT $D/c30M.las > /dev/null 2>&1
log startup; node startup.js --k=3 --out=$OUT > /dev/null 2>&1; xvfb-run -a -n 190 node startup.js --electron --k=3 --out=$OUT > /dev/null 2>&1
rm -f $D/c30M_ascii.pcd $D/c30M.ply $D/c30M.e57 $D/c30M_bc.pcd
log done
