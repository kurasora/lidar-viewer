#!/bin/bash
# A06（見た目・使い勝手・アクセシビリティ・文言）の再試験を全部流す
#   bash run.sh            … 全部（30〜60 分。heavy の枠の空き次第）
#   bash run.sh quick      … 写真の行列を 900x600 と 1280x800 だけにする
#   結果: ../out/*.json *.log、写真: ../shots/、最後に summarize.py が「OK / NG」の一覧を出す
#   別の版（写し）を試すとき: APPDIR=<写しのフォルダ> PAGE=file://<写し>/dist/index.html bash run.sh
set -u
R=$(cd "$(dirname "$0")" && pwd); W=$(cd "$R/.." && pwd)
T=$(cd "$W/../.." && pwd)
O=$W/out; mkdir -p $O $W/shots $W/tmp
export TMPDIR=$W/tmp PYTHONPATH=$W/pylib
cd $W
MODE=${1:-full}
echo "== 試験用ファイル";   $T/bin/light python3 $R/gen_files.py $W/files
echo "== exe のリソース";    MEM=1500 $T/bin/light python3 $R/pe_info.py "/home/claude/pcd-viewer/release/win-unpacked/LiDAR Viewer.exe" $W/shots/icon > $O/pe_info.txt 2>&1; cat $O/pe_info.txt
echo "== 文言の静的点検";    $T/bin/light python3 $R/wording_audit.py "${APPDIR:-/home/claude/pcd-viewer}" > $O/wording_audit.txt 2>&1; head -5 $O/wording_audit.txt
# Chromium（写真の行列 → まとめた組）
if [ "$MODE" = quick ]; then SIZES=900x600,1280x800; else SIZES=900x600,1280x800,1920x1080,3840x2160; fi
echo "== 写真の行列（DPR 1、暗/明）"; TIMEOUT=2400 $T/bin/heavy node $R/matrix_chromium.js $SIZES 1 dark,light > $O/matrix_run1.log 2>&1; cat $O/matrix_run1.log
echo "== 写真の行列（DPR 2）";        TIMEOUT=2400 MEM=2400 $T/bin/heavy node $R/matrix_chromium.js 900x600,1280x800,1920x1080 2 dark > $O/matrix_run2.log 2>&1; cat $O/matrix_run2.log
echo "== キーボード（Chromium）";      $T/bin/heavy node $R/keyboard.js > $O/keyboard_chromium.log 2>&1; tail -c 300 $O/keyboard_chromium.log
echo "== Chromium の組";              TIMEOUT=2400 $T/bin/heavy bash $R/chromium_batch.sh > $O/chromium_batch.log 2>&1; tail -c 2000 $O/chromium_batch.log
# Electron（X が要る）
echo "== Electron の組";              TIMEOUT=1800 $T/bin/heavy xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" bash $R/electron_batch.sh > $O/electron_batch.log 2>&1; tail -c 2000 $O/electron_batch.log
echo "== 吹き出しの陽性対照";          $T/bin/heavy xvfb-run -a -n 160 -s "-screen 0 1280x800x24" node $R/tooltip_control.js > $O/tooltip_control.log 2>&1; grep -c override $O/tooltip_control.log
# ほかの担当とぶつからないよう自分の netns の中で
ip netns list | grep -q '^a061' || $T/bin/mknet a06 106 3
echo "== 吹き出し（本物のマウス・全状態）"; TIMEOUT=2700 MEM=2000 $T/bin/heavy ip netns exec a061 xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" node $R/tooltip_app.js > $O/tooltip_app.log 2>&1; tail -3 $O/tooltip_app.log
echo "== Electron の組 2（開く画面）"; TIMEOUT=1200 $T/bin/heavy ip netns exec a061 xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" bash $R/electron_batch2.sh > $O/electron_batch2.log 2>&1; tail -c 1500 $O/electron_batch2.log
$T/bin/rmnet a06 3
echo "== まとめ"; python3 $R/summarize.py $W | tee $O/summary.txt
