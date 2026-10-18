#!/bin/bash
# bg.sh <名前> <light|heavy|bigmem> <コマンド...> : 見張り付きで裏で動かし、$W/out/<名前>.log に書く
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A04
name=$1; kind=$2; shift 2
cd $W
( echo "[start $(date +%T)]"; GUARD_VERBOSE=1 TMPDIR=$W/tmp $T/bin/$kind "$@"; echo "[end $(date +%T) rc=$?]" ) > $W/out/$name.log 2>&1 &
echo "bg $name pid $!"
