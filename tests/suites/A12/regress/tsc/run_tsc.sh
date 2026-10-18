#!/bin/bash
# tsc --allowJs --checkJs で型の誤りを拾う（元は読むだけ・出力なし）。結果: $W/regress/out/tsc_*.txt
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A12
mkdir -p $W/regress/out; cd $W/regress/tsc
tsc -p tsconfig.main.json --pretty false > $W/regress/out/tsc_main.txt 2>&1; echo "tsc（主プロセス）: $(grep -c 'error TS' $W/regress/out/tsc_main.txt) 件"
tsc -p tsconfig.renderer.json --pretty false > $W/regress/out/tsc_renderer.txt 2>&1; echo "tsc（画面・別スレッド・読み込み部品）: $(grep -c 'error TS' $W/regress/out/tsc_renderer.txt) 件"
