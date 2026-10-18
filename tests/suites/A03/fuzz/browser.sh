#!/bin/bash
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A03; C=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A03/crashers
GOOD=/home/claude/pcd-viewer/sample/formats/pcl_ascii.pcd
cd $W
WAIT=90000 SHOT=$W/out/shots node $T/harness/browser_read.js \
  $GOOD -- $C/float32_overflow.xyz -- $C/vtk_points_1e9.vtk -- $C/dxf_self_insert.dxf -- $C/dxf_mutual_insert.dxf -- $C/off_truncated.off -- $C/ply_binary_truncated.ply -- $C/pdms_deep_new.pdms -- $GOOD > $W/out/browser.jsonl 2> $W/logs/browser.err
echo BROWSERDONE > $W/logs/browser.done
