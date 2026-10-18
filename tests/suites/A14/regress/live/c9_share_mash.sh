#!/bin/bash
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; D=$T/work/A14/regress/live
$T/bin/rmnet a14i 2; $T/bin/mknet a14i 114 2 >/dev/null
ip netns exec a14i1 node /home/claude/pcd-viewer/tools/fake_mid360.js 10.114.0.1 > /dev/null 2>&1 & F=$!
sleep 1
ip netns exec a14i2 node $D/c9_share_mash.js; echo "rc=$?"
kill $F; sleep 0.3; $T/bin/rmnet a14i 2
