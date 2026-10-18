#!/bin/bash
# bg.sh <名前> <light|heavy|bigmem> <コマンド...>: 見張り付きで裏で走らせ、$W/logs/<名前>.log に書く（終わると <名前>.done）
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A05
name=$1; kind=$2; shift 2
mkdir -p $W/logs; rm -f $W/logs/$name.done
( cd $W && $T/bin/$kind "$@" > $W/logs/$name.log 2>&1; echo "exit $?" > $W/logs/$name.done ) &
echo "started $name pid $!"
