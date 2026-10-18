#!/bin/bash
# ライブ中の寿命の試験をまとめて動かす（root で、heavy の中から）
#   MEM=3000 TIMEOUT=900 heavy bash live_lifecycle.sh [APPBIN]
# netns a101（にせ MID-360 10.110.0.1）・a102（配信する側 10.110.0.2）・a103（見る側 10.110.0.3）
set -u
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv
W=${W:-$T/work/A10}
APPBIN=${1:-${APPBIN:-/home/claude/pcd-viewer/release/linux-unpacked/lidar-viewer}}
FAKE_JS=${FAKE_JS:-/home/claude/pcd-viewer/tools/fake_mid360.js}
RUN=$W/run/live; rm -rf "$RUN"; mkdir -p "$RUN"
export W RUN APPBIN
$T/bin/rmnet a10 3 >/dev/null 2>&1
$T/bin/mknet a10 110 3
ip netns exec a101 node "$FAKE_JS" 10.110.0.1 > "$RUN/fake.log" 2>&1 &
FAKE=$!
sleep 2
ip netns exec a103 xvfb-run -a -n 201 -s "-screen 0 1280x800x24" node "$W/regress/live_lifecycle.js" viewer > "$RUN/viewer.jsonl" 2> "$RUN/viewer.err" &
VIEW=$!
sleep 4
ip netns exec a102 xvfb-run -a -n 205 -s "-screen 0 1280x800x24" node "$W/regress/live_lifecycle.js" host > "$RUN/host.jsonl" 2> "$RUN/host.err"
wait $VIEW
kill $FAKE 2>/dev/null; wait $FAKE 2>/dev/null
# 残ったプロセスがないか（netns の中のソケット）
for n in a102 a103; do echo "$n 残ったソケット: $(ip netns exec $n ss -uanpH | grep -c -E 'lidar-viewer|electron')"; done | tee "$RUN/leftover.txt"
$T/bin/rmnet a10 3
cat "$RUN/host.jsonl" "$RUN/viewer.jsonl"
