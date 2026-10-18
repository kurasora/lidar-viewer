#!/bin/bash
# bg.sh <名前> <heavy|light|bigmem> <コマンド...>: 見張り付きでバックグラウンド実行し、$W/out/<名前>.log に書く
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A14
name=$1; kind=$2; shift 2
cd $W
( echo "[start $(date +%T)] $*"; "$T/bin/$kind" "$@"; echo "[end $(date +%T) rc=$?]" ) > $W/out/$name.log 2>&1 &
echo $! > $W/out/$name.pid
echo "started $name pid $(cat $W/out/$name.pid)"
