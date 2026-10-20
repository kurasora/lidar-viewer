#!/bin/bash
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
# Chromium の試験をまとめて流す（heavy の枠を 1 回だけ使う）
#   heavy bash chromium_batch.sh
R=$(cd "$(dirname "$0")" && pwd); O=$R/../out; mkdir -p $O
cd $R/..
# 1 つの試験が固まっても残りを流せるよう、試験ごとに 15 分で打ち切る
echo "== messages"; timeout -k 10 900 node $R/messages.js > $O/messages.log 2>&1; cat $O/messages.log | head -60
echo "== longnames 1280x800"; timeout -k 10 900 node $R/longnames.js 1280x800 > $O/longnames_1280.log 2>&1; tail -c 2500 $O/longnames_1280.log
echo "== longnames 900x600"; timeout -k 10 900 node $R/longnames.js 900x600 > $O/longnames_900.log 2>&1; tail -c 1500 $O/longnames_900.log
echo "== contrast"; timeout -k 10 900 node $R/contrast.js 0,14,30,50 > $O/contrast.log 2>&1; cat $O/contrast.log | head -80
echo "== misc_chromium"; timeout -k 10 900 node $R/misc_chromium.js > $O/misc_chromium.log 2>&1; tail -c 2500 $O/misc_chromium.log
echo "== coords_shift"; timeout -k 10 900 node $R/coords_shift.js > $O/coords_shift.log 2>&1; tail -c 3000 $O/coords_shift.log
echo "== dual_stuck"; timeout -k 10 900 node $R/dual_stuck.js > $O/dual_stuck.log 2>&1; tail -c 2500 $O/dual_stuck.log
echo "== a11y_tree"; timeout -k 10 900 node $R/a11y_tree.js > $O/a11y_tree.log 2>&1; tail -c 6000 $O/a11y_tree.log
echo "== backspace"; timeout -k 10 900 node $R/backspace.js > $O/backspace.log 2>&1; tail -c 600 $O/backspace.log
