#!/bin/bash
# Electron の試験（2 組目）: 自分の netns の中で流す
#   heavy ip netns exec a061 xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" bash electron_batch2.sh
R=$(cd "$(dirname "$0")" && pwd); O=$R/../out; mkdir -p $O
cd $R/..
echo "== live_msgs"; node $R/live_msgs.js > $O/live_msgs.log 2>&1; tail -c 3500 $O/live_msgs.log
echo "== open_dialog_types"; node $R/open_dialog_types.js > $O/open_dialog_types.log 2>&1; tail -c 1500 $O/open_dialog_types.log
