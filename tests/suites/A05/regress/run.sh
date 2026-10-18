#!/bin/bash
# A05 画面の機能 — 再試験をまとめて流す
#   bash run.sh            … 全部（試験用ファイル → Chromium の試験 → Electron の試験 → NG の一覧）
#   bash run.sh t03 t05    … 名前の先頭が合うものだけ（e01 は Electron）
#   見張り（heavy）の枠を 1 つだけ取り、その中で順に流す（枠の順番待ちを 1 回にするため）。
#   全部で 40〜60 分。時間の上限は TIMEOUT（既定 5400 秒）で変えられる
# 結果: $W/logs/<試験>.log（1 行ずつ OK/NG）と <試験>.json、写真は $W/shots/
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv
W=$T/work/A05
cd $W || exit 1
if [ -z "$A05_INNER" ]; then
  # 外側: 見張り付きで自分をもう一度呼ぶ
  TIMEOUT=${TIMEOUT:-5400} MEM=${MEM:-1800} exec $T/bin/heavy env A05_INNER=1 bash $W/regress/run.sh "$@"
fi
mkdir -p $W/logs $W/shots $W/tmp
export TMPDIR=$W/tmp
# 試験用のファイル（なければ作る）
[ -f $W/data/c_xyzi.pcd ]   || python3 $W/regress/gen_data.py  $W/data
[ -f $W/data/utm_map.pcd ]  || python3 $W/regress/gen_data2.py $W/data
{ [ -f $W/data/two_floors.pcd ] && [ -f $W/data/inj_field.pcd ]; } || python3 $W/regress/gen_data3.py $W/data
# X を外から操作する道具（ネイティブのダイアログを見るため）
[ -d $W/pylib/Xlib ] || pip install --break-system-packages --target $W/pylib python-xlib >/dev/null 2>&1
ALL="t01_popstack t02_tools t03_files t04_color t05_measure t06_level_ceil t07_section_view t08_traj t09_misc t10_picker t11_errors t12_usecases t13_live_demo t14_fieldname_html t15_ceiling_scenes t16_parts t17_utm_coords t18_multi_extent e01_electron"
SEL="$*"
for t in $ALL; do
  if [ -n "$SEL" ]; then m=0; for a in $SEL; do case $t in $a*) m=1;; esac; done; [ $m = 1 ] || continue; fi
  echo "== $t $(date +%H:%M:%S)"
  if [ $t = e01_electron ]; then
    # ライブのカードを開くので自分の netns（a051）の中で。画面は xvfb の 150 番
    ip netns list | grep -q '^a051' || $T/bin/mknet a05 105 3 >/dev/null
    ip netns exec a051 xvfb-run -a -n 150 -s "-screen 0 1600x1000x24" env PYTHONPATH=$W/pylib timeout 900 node $W/regress/$t.js > $W/logs/$t.log 2>&1
    rc=$?
    $T/bin/rmnet a05 3
  else
    timeout 900 node $W/regress/$t.js > $W/logs/$t.log 2>&1; rc=$?
  fi
  echo "   終了 $rc（OK $(grep -c '^OK' $W/logs/$t.log) / NG $(grep -c '^NG' $W/logs/$t.log)）$(grep -q '^FATAL' $W/logs/$t.log && echo ' FATAL あり')"
done
echo; echo "== NG の一覧"; for t in $ALL; do [ -f $W/logs/$t.log ] && grep -h '^NG\|^FATAL' $W/logs/$t.log | sed "s/^/[$t] /" | cut -c1-220; done
