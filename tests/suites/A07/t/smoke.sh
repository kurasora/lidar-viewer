#!/bin/bash
# smoke: fake (a071) + live_test.js (a072)
ip netns exec a071 node /home/claude/pcd-viewer/tools/fake_mid360.js 10.107.0.1 > logs/smoke_fake.log 2>&1 &
FP=$!
sleep 1
ip netns exec a072 node /tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/live_test.js
echo "rc=$?"
kill $FP; wait $FP 2>/dev/null
cat logs/smoke_fake.log
