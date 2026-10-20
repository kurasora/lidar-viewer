#!/bin/bash
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
# Chromium の試験（2 組目）
R=$(cd "$(dirname "$0")" && pwd); O=$R/../out; mkdir -p $O
cd $R/..
echo "== messages"; node $R/messages.js > $O/messages.log 2>&1; cat $O/messages.log | head -60
echo "== misc2"; node $R/misc2.js > $O/misc2.log 2>&1; tail -c 2500 $O/misc2.log
echo "== coords_shift"; node $R/coords_shift.js > $O/coords_shift.log 2>&1; tail -c 3000 $O/coords_shift.log
echo "== dual_stuck"; node $R/dual_stuck.js > $O/dual_stuck.log 2>&1; tail -c 2500 $O/dual_stuck.log
