#!/bin/bash
# C4: CloudCompare で書き出したファイルを作る（この環境の CloudCompare は PCD・LAS を開けないので、PLY に直してから）
#   heavy bash c4_cc_convert.sh
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A14; C=$W/files/cc
python3 $W/regress/gen/gen_ply_for_cc.py $W/files
cd $C
export QT_QPA_PLATFORM=offscreen
CCX="xvfb-run -a -n 243 CloudCompare -SILENT -NO_TIMESTAMP -AUTO_SAVE OFF"
# 1) livox の点群 → ASCII（見出し付き・カンマ区切り）、拡張子 .txt と .csv
$CCX -O livox_frame.ply -C_EXPORT_FMT ASC -SEP COMMA -ADD_HEADER -EXT txt -SAVE_CLOUDS > cc1.log 2>&1
$CCX -O livox_frame.ply -C_EXPORT_FMT ASC -SEP COMMA -ADD_HEADER -EXT csv -SAVE_CLOUDS > cc2.log 2>&1
# 2) GlobalMap → BIN
$CCX -O GlobalMap.ply -C_EXPORT_FMT BIN -SAVE_CLOUDS > cc3.log 2>&1
# 2b) gps_time（double）を持つ点群 → BIN（CloudCompare は大きな値の欄をオフセット付きで持つ）
$CCX -O map_gpstime.ply -C_EXPORT_FMT BIN -SAVE_CLOUDS > cc6.log 2>&1
# 3) 2 つを重ねて 1 つにまとめる（Original cloud index の欄ができる）→ ASCII
$CCX -O GlobalMap.ply -O livox_frame.ply -MERGE_CLOUDS -C_EXPORT_FMT ASC -SEP COMMA -ADD_HEADER -EXT csv -SAVE_CLOUDS > cc5.log 2>&1
ls -la $C
for f in $C/*.txt $C/*.csv; do echo "== $f"; head -2 "$f"; done
grep -h "SF\|shift\|Shift" $C/cc6.log | head
