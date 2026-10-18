#!/bin/bash
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; D=$T/work/A14/regress/live
$T/bin/rmnet a14h 1; $T/bin/mknet a14h 114 1 >/dev/null
ip netns exec a14h1 node $D/c9_badpeer.js; echo "rc=$?"
$T/bin/rmnet a14h 1
