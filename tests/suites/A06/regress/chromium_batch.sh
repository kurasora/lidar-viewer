#!/bin/bash
# Chromium の試験をまとめて流す（heavy の枠を 1 回だけ使う）
#   heavy bash chromium_batch.sh
R=$(cd "$(dirname "$0")" && pwd); O=$R/../out; mkdir -p $O
cd $R/..
echo "== messages"; node $R/messages.js > $O/messages.log 2>&1; cat $O/messages.log | head -60
echo "== longnames 1280x800"; node $R/longnames.js 1280x800 > $O/longnames_1280.log 2>&1; tail -c 2500 $O/longnames_1280.log
echo "== longnames 900x600"; node $R/longnames.js 900x600 > $O/longnames_900.log 2>&1; tail -c 1500 $O/longnames_900.log
echo "== contrast"; node $R/contrast.js 0,14,30,50 > $O/contrast.log 2>&1; cat $O/contrast.log | head -80
echo "== misc_chromium"; node $R/misc_chromium.js > $O/misc_chromium.log 2>&1; tail -c 2500 $O/misc_chromium.log
echo "== coords_shift"; node $R/coords_shift.js > $O/coords_shift.log 2>&1; tail -c 3000 $O/coords_shift.log
echo "== dual_stuck"; node $R/dual_stuck.js > $O/dual_stuck.log 2>&1; tail -c 2500 $O/dual_stuck.log
echo "== a11y_tree"; node $R/a11y_tree.js > $O/a11y_tree.log 2>&1; tail -c 6000 $O/a11y_tree.log
echo "== backspace"; node $R/backspace.js > $O/backspace.log 2>&1; tail -c 600 $O/backspace.log
