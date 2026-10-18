#!/bin/bash
# share.sh … 配信の試験（LiDAR=a07u1 → 配信元アプリ=a07u2 → 見る側アプリ a07u3(v1)・a07u5(v2)）。全体を heavy で:  MEM=3500 TIMEOUT=900 heavy bash t/share.sh
W=$(cd "$(dirname "$0")/.." && pwd); cd $W
export NSP=${NSP:-a07u} NET=${NET:-10.117.0}
rm -rf tmp/sync; mkdir -p tmp/sync
ip netns exec ${NSP}2 xvfb-run -a -n 170 node t/share_host.js > logs/share_host.txt 2>&1 &
H=$!
sleep 2
ip netns exec ${NSP}3 xvfb-run -a -n 170 node t/share_view.js v1 > logs/share_v1.txt 2>&1 &
sleep 2
ip netns exec ${NSP}5 xvfb-run -a -n 170 node t/share_view.js v2 > logs/share_v2.txt 2>&1 &
wait
# 念のため元に戻す
ip netns exec ${NSP}sw tc qdisc del dev ${NSP}h3 root 2>/dev/null
ip netns exec ${NSP}sw ip link set ${NSP}h2 up
echo done
