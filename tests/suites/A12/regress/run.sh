#!/bin/bash
# A12 コードレビュー（静的解析）の再試験を一括で流す。実機確認のあと、同じ点検をもう一度行うために使う。
#   使い方: bash $W/regress/run.sh
#   前提: eslint/tsc/型定義は $W/tools に入れてある（この環境の作りに依存）。netns a12* は $T/bin/mknet a12 112 3 で作る
set +e
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A12
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
export NODE_PATH=$W/tools/node_modules
echo "========== 0) 再現用の入力を作る"
TIMEOUT=200 $T/bin/light python3 $W/regress/gen_data.py $W/regress/data
echo "========== 1) eslint（recommended）"
$T/bin/light bash $W/regress/lint/run_eslint.sh
echo "========== 2) eslint（不具合向けの追加規則・誤検出を含む）"
$T/bin/light bash $W/regress/lint/run_eslint_extra.sh
echo "========== 3) tsc --allowJs --checkJs"
MEM=1500 $T/bin/light bash $W/regress/tsc/run_tsc.sh
echo "========== 4) 読み込み部品（Node）の不具合の再現"
$T/bin/light node --no-warnings $W/regress/node/readers.mjs $W/regress/data
echo "========== 5) 分類の色（点 vs 凡例）の食い違い"
$T/bin/light node --no-warnings $W/regress/node/catcolor.mjs $W/regress/data/labels_far.pcd
echo "========== 6) 小さな壊れた入力で終わらない/過大なメモリ"
bash $W/regress/node/limits.sh
echo "========== 8) 画面（Chromium）での確認（heavy スロットが要る。混んでいれば飛ばしてよい）"
echo "  手動: TIMEOUT=240 MEM=1600 $T/bin/heavy node $W/regress/browser/render_checks.js $W/regress/data"
echo "========== 完了"
