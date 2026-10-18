#!/bin/bash
# Electron の試験（3 組目）: ライブの知らせ（直した試験）を自分の netns の中で
R=$(cd "$(dirname "$0")" && pwd); O=$R/../out; mkdir -p $O
cd $R/..
echo "== live_msgs"; node $R/live_msgs.js > $O/live_msgs.log 2>&1; tail -c 4000 $O/live_msgs.log
