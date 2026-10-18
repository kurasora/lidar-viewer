#!/bin/bash
# C9b: アプリ版のライブ（netns a14e: .1 = にせ MID-360、.2 = LiDAR の PC、.3 = 受ける PC）
#   heavy（MEM=3500）で実行。netns a14e は mknet a14e 114 3 で作っておく
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A14; D=$W/regress/live; O=$W/out/live
mkdir -p $O; rm -f $O/mark_*
ip netns list | grep -q a14e1 || $T/bin/mknet a14e 114 3
ip netns exec a14e1 node /home/claude/pcd-viewer/tools/fake_mid360.js 10.114.0.1 > $O/el_fake.log 2>&1 & FAKE=$!
ip netns exec a14e2 xvfb-run -a -n 246 node $D/c9_host.js > $O/el_host.log 2>&1 & H=$!
ip netns exec a14e3 xvfb-run -a -n 247 node $D/c9_recv.js > $O/el_recv.log 2>&1 & V=$!
while [ ! -e $O/mark_power_off ]; do sleep 0.3; kill -0 $H 2>/dev/null || break; done
kill $FAKE; echo "fake off $(date +%T)" >> $O/el_fake.log
while [ ! -e $O/mark_power_on ]; do sleep 0.3; kill -0 $H 2>/dev/null || break; done
ip netns exec a14e1 node /home/claude/pcd-viewer/tools/fake_mid360.js 10.114.0.1 >> $O/el_fake.log 2>&1 & FAKE=$!
sleep 1; touch $O/mark_fake_restarted
wait $H; wait $V
kill $FAKE 2>/dev/null
echo "== host"; cat $O/el_host.log | cut -c1-400
echo "== recv"; cat $O/el_recv.log | cut -c1-300
echo "== fake"; cat $O/el_fake.log
