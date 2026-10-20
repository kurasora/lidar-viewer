#!/bin/bash
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
# Electron の試験をまとめて 1 つの X の中で流す（heavy の枠を 1 回だけ使う）
#   heavy xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" bash electron_batch.sh
R=$(cd "$(dirname "$0")" && pwd); O=$R/../out; mkdir -p $O
cd $R/..
# 1 つの試験が固まっても残りを流せるよう、試験ごとに 15 分で打ち切る
echo "== electron_misc"; timeout -k 10 900 node $R/electron_misc.js > $O/electron_misc.log 2>&1; tail -c 400 $O/electron_misc.log
echo "== keyboard (electron)"; ELECTRON=1 timeout -k 10 900 node $R/keyboard.js > $O/keyboard_electron.log 2>&1; tail -c 300 $O/keyboard_electron.log
echo "== tooltip_colorpicker"; timeout -k 10 900 node $R/tooltip_colorpicker.js > $O/tooltip_colorpicker.log 2>&1; tail -c 1500 $O/tooltip_colorpicker.log
echo "== theme_electron"; timeout -k 10 900 node $R/theme_electron.js > $O/theme_electron.log 2>&1; tail -c 800 $O/theme_electron.log
echo "== scroll_slider d1"; timeout -k 10 900 node $R/scroll_slider.js 1 > $O/scroll_slider_d1.log 2>&1; tail -c 1500 $O/scroll_slider_d1.log
echo "== scroll_slider d2"; timeout -k 10 900 node $R/scroll_slider.js 2 > $O/scroll_slider_d2.log 2>&1; tail -c 600 $O/scroll_slider_d2.log
