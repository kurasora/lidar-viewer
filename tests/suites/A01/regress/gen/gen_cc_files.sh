#!/bin/bash
# CloudCompare 2.11.3 で BIN / SBF / ASC などを書く（heavy の中で動かす: $T/bin/heavy bash gen_cc_files.sh）
#   入力: ../data/cc_src/*.ply（gen_cc.py の prepare() が作る）
#   出力: ../data/cc/ に CloudCompare が書いたファイル
set -u
G=$(cd "$(dirname "$0")" && pwd); D=$G/../data; S=$D/cc_src; O=$D/cc
mkdir -p $O; export QT_QPA_PLATFORM=offscreen
cc() { timeout 120 xvfb-run -a -n 110 CloudCompare -SILENT -NO_TIMESTAMP "$@" > /dev/null 2>&1; }
work=$(mktemp -d -p $G/../out ccwork.XXXX)
run() { # run <出力名> <拡張子> <CloudCompare の引数...>（作業フォルダで実行し、できたファイルを O に移す）
  local name=$1 ext=$2; shift 2
  rm -rf $work/*; cp $S/*.ply $work/
  (cd $work && cc "$@")
  local got=$(ls -t $work/*.$ext 2>/dev/null | head -1)
  if [ -n "$got" ]; then cp "$got" $O/$name.$ext; [ -f "$got.data" ] && cp "$got.data" $O/$name.$ext.data; echo "ok $name.$ext"; else echo "NG $name.$ext"; fi
}
# BIN: 色 + 値の欄（Intensity）
run bin_basic bin -O basic.ply -C_EXPORT_FMT BIN -SAVE_CLOUDS
# BIN: UTM（グローバルシフトを自動で）
run bin_utm_shift bin -O -GLOBAL_SHIFT AUTO utm.ply -C_EXPORT_FMT BIN -SAVE_CLOUDS
# BIN: 2 つの点群（ALL_AT_ONCE で 1 ファイル）
run bin_two bin -O basic.ply -O second.ply -C_EXPORT_FMT BIN -SAVE_CLOUDS ALL_AT_ONCE
# BIN: 原点の大きく違う 2 つの点群（ローカル + UTM、シフトは UTM 側だけ）
run bin_local_utm bin -O basic.ply -O -GLOBAL_SHIFT AUTO utm.ply -C_EXPORT_FMT BIN -SAVE_CLOUDS ALL_AT_ONCE
# SBF: 色なし・値の欄 1 つ / UTM（グローバルシフト）
run sbf_basic sbf -O basic.ply -C_EXPORT_FMT SBF -SAVE_CLOUDS
run sbf_utm_shift sbf -O -GLOBAL_SHIFT AUTO utm.ply -C_EXPORT_FMT SBF -SAVE_CLOUDS
run sbf_two_sf sbf -O twosf.ply -C_EXPORT_FMT SBF -SAVE_CLOUDS
# ASC（見出しつき・値の欄の名前に空白）
run asc_sfspace asc -O sfspace.ply -C_EXPORT_FMT ASC -ADD_HEADER -SAVE_CLOUDS
# PLY（CloudCompare が書く ascii / binary。グローバルシフトつきの UTM）
run ply_utm_shift ply -O -GLOBAL_SHIFT AUTO utm.ply -C_EXPORT_FMT PLY -SAVE_CLOUDS
run ply_cc_ascii ply -O basic.ply -C_EXPORT_FMT PLY -PLY_EXPORT_FMT ASCII -SAVE_CLOUDS
# 値の欄だけの BIN（色なし）・値の欄 2 つ
run bin_two_sf bin -O twosf.ply -C_EXPORT_FMT BIN -SAVE_CLOUDS
rm -rf $work
