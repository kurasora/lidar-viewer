#!/bin/bash
# CloudCompare 2.11.3 に試験のファイルを読ませ、見出しつきの ASC に書き出す（読み方の正解の参考にする）
#   使い方: $T/bin/heavy bash cc_oracle.sh <data からの相対パス>...
#   出力: out/cc_oracle/<相対パス>.asc（点群が複数なら _1 _2 …）と .log
set -u
R=$(cd "$(dirname "$0")" && pwd); D=$R/data; O=$R/out/cc_oracle
export QT_QPA_PLATFORM=offscreen
for rel in "$@"; do
  w=$(mktemp -d -p $R/out ccor.XXXX)
  b=$(basename "$rel")
  # 入力が .asc だと出力（同じ名前の .asc）で上書きされるので、.txt にして読ませる（読み方は同じ ASCII）
  case "$b" in *.asc) b="${b%.asc}.txt";; esac
  cp "$D/$rel" "$w/$b"
  [ -f "$D/$rel.data" ] && cp "$D/$rel.data" "$w/$b.data"
  (cd $w && timeout 120 xvfb-run -a -n 110 CloudCompare -SILENT -NO_TIMESTAMP -O "$b" -C_EXPORT_FMT ASC -ADD_HEADER -PREC 9 -SAVE_CLOUDS > cc.log 2>&1)
  mkdir -p "$O/$(dirname "$rel")"
  cp $w/cc.log "$O/$rel.log"
  i=0
  for f in $(ls $w/*.asc 2>/dev/null | grep -v "^$w/$b$"); do cp "$f" "$O/$rel.$i.asc"; i=$((i+1)); done
  echo "$rel: ASC $i 個（$(grep -c -i -E "error|failed" $w/cc.log) 行のエラー）"
  rm -rf $w
done
