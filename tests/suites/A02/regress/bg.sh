#!/bin/bash
# 長い試験を裏で動かす: bg.sh <名前> <コマンド...>
#   出力 → $W/regress/out/<名前>.log、終了コード → <名前>.rc（終わるまで .rc はない）
#   コマンドには $T/bin/heavy などの見張り付きの入口を含めること
R=$(cd "$(dirname "$0")" && pwd)
name=$1; shift
mkdir -p "$R/out"
rm -f "$R/out/$name.rc"
nohup bash -c '"$@" > "'"$R/out/$name.log"'" 2>&1; echo $? > "'"$R/out/$name.rc"'"' _ "$@" > /dev/null 2>&1 &
echo "started $name (pid $!)"
