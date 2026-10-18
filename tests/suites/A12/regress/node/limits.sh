#!/bin/bash
# A12: 小さな壊れたファイルで「終わらない」「大きなメモリを確保する」ことを、見張り（guard）の止め方で確かめる
#   終了コード 124 = 時間切れ（終わらない）、137 = メモリ上限を超えた
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A12; D=$W/regress/data
run() { # run <ID> <説明> <MEM> <TIMEOUT> <ファイル...>
  local id=$1 what=$2 mem=$3 to=$4; shift 4
  local t0=$(date +%s.%N)
  out=$(MEM=$mem TIMEOUT=$to $T/bin/light node --no-warnings $T/harness/read.mjs "$@" 2>&1); rc=$?
  local dt=$(echo "$(date +%s.%N) - $t0" | bc)
  local size=$(stat -c %s "$1")
  case $rc in 124) v="[再現] 時間切れ（${to} 秒で終わらない）";; 137) v="[再現] メモリ上限 ${mem} MB を超えた";; *) v="[再現せず] 終了コード $rc";; esac
  echo "$v $id $what（入力 ${size} バイト、$(printf %.1f $dt) 秒）: $(echo "$out" | tail -1 | cut -c1-200)"
}
run A12-shp-loop "図形の長さが負のシェープファイル" 1500 40 $D/shp_badlen.shp $D/shp_badlen.dbf $D/shp_badlen.shx
run A12-pgm-bomb "縦横 20000×20000 と書いただけの 35 バイトの PGM" 800 120 $D/pgm_bomb.pgm
run A12-psz-bomb "中に 1 GB のゼロを持つ 1 MB の PSZ（zip）" 800 120 $D/psz_bomb.psz
