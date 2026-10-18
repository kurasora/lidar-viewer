#!/bin/bash
# C9 ライブと ROS2 ドライバ（の代わり）の同時使用（netns a14: .1=にせ LiDAR、.2=ロボットの PC、.3=別の PC）
#   実行: $T/bin/light bash c9_coexist.sh   （root。netns を作って最後に消す）
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A14; D=$W/regress/live; O=$W/out/live; mkdir -p $O
$T/bin/rmnet a14 3; $T/bin/mknet a14 114 3 >/dev/null
ip netns exec a141 node /home/claude/pcd-viewer/tools/fake_mid360.js 10.114.0.1 > $O/fake.log 2>&1 & FAKE=$!
sleep 1.5
echo "== 1: 別の PC（.3）の LiDAR Viewer が、ロボット（.2）の ROS ドライバが受けている LiDAR につなぐ"
ip netns exec a142 node $D/ros_standin.js 10.114.0.2 10.114.0.1 1 11 > $O/s1_ros.log & R=$!
sleep 2
ip netns exec a143 node $D/viewer_node.js 8 3 > $O/s1_viewer.log
wait $R
paste -d' ' <(grep -h '"t"' $O/s1_ros.log | head -11) /dev/null | cut -c1-80
grep -h 'started\|error\|log' $O/s1_viewer.log $O/s1_ros.log | cut -c1-200
grep -h '"t"' $O/s1_viewer.log | cut -c1-120
echo "== 2: 同じ PC（.2）で ROS ドライバ（SO_REUSEADDR あり）が動いているところで LiDAR Viewer のライブを開く"
ip netns exec a142 node $D/ros_standin.js 10.114.0.2 10.114.0.1 1 11 > $O/s2_ros.log & R=$!
sleep 2
ip netns exec a142 node $D/viewer_node.js 8 3 > $O/s2_viewer.log
wait $R
grep -h '"t"' $O/s2_ros.log | cut -c1-80
grep -h 'openErrors\|started\|error\|log' $O/s2_viewer.log | cut -c1-250
grep -h '"t"' $O/s2_viewer.log | cut -c1-120
echo "== 3: 同じ PC（.2）で ROS ドライバ（SO_REUSEADDR なし）が動いているところで LiDAR Viewer のライブを開く"
ip netns exec a142 node $D/ros_standin.js 10.114.0.2 10.114.0.1 0 11 > $O/s3_ros.log & R=$!
sleep 2
ip netns exec a142 node $D/viewer_node.js 8 3 > $O/s3_viewer.log
wait $R
grep -h '"t"' $O/s3_ros.log | cut -c1-80
grep -h 'openErrors\|started\|error\|log' $O/s3_viewer.log | cut -c1-250
grep -h '"t"' $O/s3_viewer.log | cut -c1-120
echo "== 4: 先に LiDAR Viewer（.2）が開いていて、あとから ROS ドライバ（SO_REUSEADDR なし）を起動"
ip netns exec a142 node $D/viewer_node.js 10 2 > $O/s4_viewer.log & V=$!
sleep 4
ip netns exec a142 node $D/ros_standin.js 10.114.0.2 10.114.0.1 0 5 > $O/s4_ros.log
wait $V
cat $O/s4_ros.log | cut -c1-120
grep -h '"t"' $O/s4_viewer.log | cut -c1-120
kill $FAKE; sleep 0.5
grep -h '送り先' $O/fake.log
$T/bin/rmnet a14 3
