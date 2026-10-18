#!/bin/bash
# Electron の試験をまとめて 1 つの X の中で流す（heavy の枠を 1 回だけ使う）
#   heavy xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" bash electron_batch.sh
R=$(cd "$(dirname "$0")" && pwd); O=$R/../out; mkdir -p $O
cd $R/..
echo "== electron_misc"; node $R/electron_misc.js > $O/electron_misc.log 2>&1; tail -c 400 $O/electron_misc.log
echo "== keyboard (electron)"; ELECTRON=1 node $R/keyboard.js > $O/keyboard_electron.log 2>&1; tail -c 300 $O/keyboard_electron.log
echo "== tooltip_colorpicker"; node $R/tooltip_colorpicker.js > $O/tooltip_colorpicker.log 2>&1; tail -c 1500 $O/tooltip_colorpicker.log
echo "== theme_electron"; node $R/theme_electron.js > $O/theme_electron.log 2>&1; tail -c 800 $O/theme_electron.log
echo "== scroll_slider d1"; node $R/scroll_slider.js 1 > $O/scroll_slider_d1.log 2>&1; tail -c 1500 $O/scroll_slider_d1.log
echo "== scroll_slider d2"; node $R/scroll_slider.js 2 > $O/scroll_slider_d2.log 2>&1; tail -c 600 $O/scroll_slider_d2.log
