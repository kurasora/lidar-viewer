#!/bin/bash
# CloudCompare で各ファイルを開き、見出し付きの ASC に書き出す（列の判定の正解として使う）
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A04
cd $W/files/cc
export QT_QPA_PLATFORM=offscreen TMPDIR=$W/tmp
for f in "$@"; do
  s=$(date +%s)
  timeout 150 xvfb-run -a -n 140 CloudCompare -SILENT -NO_TIMESTAMP -O "$f" -C_EXPORT_FMT ASC -ADD_HEADER -SAVE_CLOUDS > "$W/tmp/cc_$f.log" 2>&1
  echo "== $f rc=$? $(( $(date +%s) - s ))s"
done
