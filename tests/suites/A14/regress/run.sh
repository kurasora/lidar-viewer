#!/bin/bash
# A14（探索的試験）の再現スクリプトをまとめて流す
#   使い方: bash run.sh [all|gen|node|app] [--appdir <アプリのフォルダ>]
#     gen  … 試験用ファイルを作る（約 700 MB。files/ がなければ自動で作る）
#     node … Node だけで動くもの（読み込み部品・軌跡・判定）: light で流す
#     app  … アプリ version（Electron）で画面ごと動かすもの: heavy で流す
#   結果: out/run_<日時>/ にログ、最後に「判定」の一覧（OK = 直っている／NG = まだ再現する）
#   環境変数 APPDIR を付けると、写し（mkcopy して直したもの）を試せる: APPDIR=$W/proj bash run.sh app
set -u
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
W=$T/work/A14; R=$W/regress; F=$W/files
what=${1:-all}
export APPDIR=${APPDIR:-/home/claude/pcd-viewer}
O=$W/out/run_$(date +%m%d_%H%M); mkdir -p $O; export OUT=$O
echo "出力: $O  （APPDIR=$APPDIR）"
judge() { echo "$1 $2" | tee -a $O/judge.txt; }

gen() {
  [ -f $F/fastlio/scans.pcd ] || MEM=2500 TIMEOUT=900 $T/bin/light python3 $R/gen/gen_fastlio.py $F/fastlio 2700
  for h in 0.3 0.55 0.8 1.2; do [ -f $F/floor_h$h/scans.pcd ] || NOBAG=1 SENSOR_H=$h MEM=2000 $T/bin/light python3 $R/gen/gen_fastlio.py $F/floor_h$h 900; done
  [ -f $F/shift/map_utm.las ] || MEM=2500 $T/bin/light python3 $R/gen/gen_shift.py $F/floor_h0.3 $F/shift
  [ -f $F/livox/livox_frame.pcd ] || MEM=2500 $T/bin/light python3 $R/gen/gen_liosam_livox.py $F/fastlio $F
  [ -f $F/outdoor/scans.pcd ] || MEM=2500 TIMEOUT=900 $T/bin/light python3 $R/gen/gen_outdoor.py $F/outdoor
  [ -f $F/wrong/huge_16000.png ] || { mkdir -p $F/wrong; for e in pcd las laz txt mcap e57 ply bin; do : > $F/wrong/empty.$e; done; MEM=1500 $T/bin/light python3 $R/gen/gen_wrong.py $F/wrong; }
  [ -f $F/cc/livox_frame.txt ] || MEM=2500 $T/bin/heavy bash $R/c4_cc_convert.sh > $O/cc_convert.log 2>&1
}

node_tests() {
  # A14-005 double の欄の丸め
  MEM=1500 $T/bin/light node --no-warnings $R/field_precision.mjs $F/liosam/transformations.pcd $F/livox/livox_frame.pcd > $O/field_precision.log 2>&1
  grep -q '"time":{[^}]*"uniq":55' $O/field_precision.log && judge OK A14-005 || judge NG A14-005
  # A14-006 ドラッグ時の軌跡の判定
  MEM=800 $T/bin/light node --no-warnings $R/c4_is_traj.mjs > $O/is_traj.log 2>&1
  grep -q '"ok":false' $O/is_traj.log && judge NG A14-006 || judge OK A14-006
  # A14-007 軌跡でないものを軌跡に
  MEM=1500 $T/bin/light node --no-warnings $R/c7_traj_parse.mjs > $O/traj_parse.log 2>&1
  grep -q 'KITTI[^}]*"ok":true[^}]*"timeGoesBack":[1-9]' $O/traj_parse.log && judge NG A14-007 || judge OK A14-007
}

app_tests() {
  # A14-001 床の検出（Chromium、X 不要）
  PAGE=http://127.0.0.1:8740/abs$APPDIR/dist/index.html MEM=2500 TIMEOUT=900 $T/bin/heavy node $R/level_check.js $F/floor_h0.3 $F/floor_h0.55 $F/floor_h0.8 $F/floor_h1.2 > $O/level_check.log 2>&1
  grep -q '"floorOK":false' $O/level_check.log && judge NG A14-001 || judge OK A14-001
  # A14-002 隠した天井の点が選ばれる（アプリ version）
  MEM=3000 TIMEOUT=900 $T/bin/heavy xvfb-run -a -n 240 node $R/c1_pick_hidden.js > $O/pick_hidden.log 2>&1
  grep -q 'boxTop_hidden' $O/pick_hidden.log && echo "（pick_hidden.log の boxTop_hidden の Z が 0.8 前後なら直っている）" >> $O/judge.txt
  # その他の画面の確かめ（ログを見て判定）
  MEM=3000 TIMEOUT=900 $T/bin/heavy xvfb-run -a -n 241 node $R/c5_shift.js > $O/c5_shift.log 2>&1
  MEM=3000 TIMEOUT=900 $T/bin/heavy xvfb-run -a -n 244 node $R/c5b_coords.js > $O/c5b_coords.log 2>&1
  MEM=3000 TIMEOUT=900 $T/bin/heavy xvfb-run -a -n 248 node $R/c10_sights.js > $O/c10_sights.log 2>&1
  # 巨大な画像（16000×16000）と 8000×6000 の写真は 3,000 万点として開くので、アプリ全体で 4 GB を少し超える（2026-10-20 に 6 GB に）
  MEM=6000 TIMEOUT=900 $T/bin/heavy xvfb-run -a -n 249 node $R/c7_wrong.js > $O/c7_wrong.log 2>&1
  MEM=3500 TIMEOUT=900 $T/bin/heavy xvfb-run -a -n 242 node $R/c6_bad.js > $O/c6_bad.log 2>&1
  CYCLES=${CYCLES:-30} MEM=3000 TIMEOUT=1500 $T/bin/heavy xvfb-run -a -n 245 node $R/c8_night.js > $O/c8_night.log 2>&1
}

case $what in
  gen) gen ;;
  node) node_tests ;;
  app) app_tests ;;
  all) gen; node_tests; app_tests ;;
esac
echo "== 判定"; cat $O/judge.txt 2>/dev/null
