#!/bin/bash
# A12-live-decode: 配信を受ける側（startPeer）に、点数 n だけ巨大で中身が短い PCV1 を送ると
#   decodeBatch が RangeError を投げ、ws の message ハンドラに try/catch がなく、主プロセスに
#   uncaughtException ハンドラもないため、主プロセス（Node/Electron）が落ちることを確かめる
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A12
D=$W/regress/live; OUT=$W/regress/out; mkdir -p $OUT
ip netns exec a122 node $D/badpeer.js wsserver > $OUT/badpeer.log 2>&1 &
BP=$!
sleep 2
# 受け手を立ち上げ、最初に見つけた配信を受ける。落ちたら終了コードが 0 以外になる
RUN_MS=8000 ip netns exec a121 node $D/victim.js peer > $OUT/victim.log 2>&1
RC=$?
kill $BP 2>/dev/null; wait $BP 2>/dev/null
echo "被害側（受け手）の終了コード: $RC（0 以外 = 落ちた）"
echo "---- victim.log"; cat $OUT/victim.log
echo "---- badpeer.log"; cat $OUT/badpeer.log
