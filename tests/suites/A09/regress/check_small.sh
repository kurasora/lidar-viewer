#!/bin/bash
# 試験スクリプトの動作確認（小さなファイルで。heavy で流す）
W=$(cd "$(dirname "$0")/.." && pwd)
cd "$W/regress"
export TMPDIR=${TMPDIR:-/tmp/a09t}
OUT=$W/out/check.jsonl
S=$W/data/small
node scenarios.js measure --k=2 --out=$OUT $W/data/2M/c2M_bin.pcd > /dev/null 2>&1; echo measure $?
node scenarios.js pick --k=5 --out=$OUT $W/data/2M/c2M_bin.pcd > /dev/null 2>&1; echo pick $?
node lod.js --out=$OUT $W/data/2M/c2M.las > /dev/null 2>&1; echo lod $?
node during_load.js --out=$OUT $W/data/2M/c2M.laz $S/c200k_bin.pcd $W/data/bnd/seq_2000.pcd > /dev/null 2>&1; echo during $?
node during_queue.js --out=$OUT $S/c200k.las $S/c200k_bin.pcd $W/data/bnd/seq_2000.pcd > /dev/null 2>&1; echo queue $?
