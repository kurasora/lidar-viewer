#!/bin/bash
# bg.sh <ログ名> <コマンド...> : バックグラウンドで実行し、終わったら <ログ>.done を作る
W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A01
log=$W/logs/$1; shift
mkdir -p $W/logs; rm -f $log.done
( "$@" > $log 2>&1; echo "rc=$?" > $log.done ) &
echo "started $log"
