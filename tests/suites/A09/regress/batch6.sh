#!/bin/bash
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
# 小さめの確認をまとめて（heavy が混んでいるので bigmem で一度に）: 閉じたあとの描き直し・色のモードと閉じたあとの知らせ・頭書きの点数が多すぎる LAS・100 個のファイル
W=$(cd "$(dirname "$0")/.." && pwd)
cd "$W/regress"
export TMPDIR=${TMPDIR:-/tmp/a09t}
OUT=$W/out/b6.jsonl
log() { echo "== $* $(date +%T)"; }
log probe; node probe_render.js $W/data/2M/c2M_bin.pcd > $W/out/probe_render.log 2>&1
log field; node field_close.js --out=$OUT $W/data/small/c200k.las > $W/out/field_close.log 2>&1
log fakehdr; node perf_load.js --level=0 --close --out=$OUT $W/data/fakehdr/c2M_hdr100M.las > /dev/null 2>&1; node perf_load.js --level=0 --close --out=$OUT $W/data/2M/c2M.las > /dev/null 2>&1
log many100; node many_files.js --limit=900 --out=$W/out/b5.jsonl $W/data/frames200 100 > $W/out/many100.log 2>&1
log idle; node idle.js --out=$OUT $W/data/10M/c10M_bin.pcd > /dev/null 2>&1
log done
