#!/bin/bash
# run.sh から heavy の枠を 1 つ取って呼ばれる本体（試験を順に直接動かす）。単独で呼ばないこと
#   使い方: bash run.sh [all|quick|<試験の名前>...]
#     quick … 大きさ・起動・枠の中の機能・UTM・injection・故障注入（30 分ほど）
#     all   … quick ＋ サンプル 73 個を 4 通り（枠＋CSP 地図あり／きれい、file 直接、wasm 禁止）＋ アプリ版の基準 ＋ スマートフォン
#   環境変数: ART=試作ページのパス（既定 /home/claude/pcd-viewer/dist-artifact/pcd-viewer.html）
#            APP=アプリ版のページ（既定 file:///home/claude/pcd-viewer/dist/index.html）
#   結果: ../out/*.json と画面写真、../logs/*.log。判定の表は ../out/eval_*.md
#   メモ: Chromium は長い TMPDIR だと起動できない（プロファイルの UNIX ソケットのパスが長すぎる）ので /tmp/a13t（$W/tmp への記号リンク）を使う
#         http サーバーは各試験の中で 8830（親・claude.ai 役）と 8831（子・アーティファクト役）に立てて、最後に止める
set -u
cd "$(dirname "$0")"
export T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
export W=${W:-$T/work/A13}
mkdir -p ../out ../logs ../files $W/tmp
ln -sfn $W/tmp /tmp/a13t
export TMPDIR=/tmp/a13t
run() { # run <名前> <light|heavy> <MB> <秒> <コマンド…>（種類・MB は目安。枠全体の上限は run.sh で決める。秒はこの試験だけの時間切れ）
  local name=$1 kind=$2 mem=$3 to=$4; shift 4
  echo "=== $name（$(date +%H:%M:%S)）"
  timeout -k 10 $to "$@" > ../logs/$name.log 2>&1
  echo "    終了 $?（../logs/$name.log）"; tail -2 ../logs/$name.log | cut -c1-300
}
want() { [ "$SEL" = all ] && return 0; [ "$SEL" = quick ] && [[ " $QUICK " == *" $1 "* ]] && return 0; [[ " $ARGS " == *" $1 "* ]]; }
SEL=${1:-quick}; ARGS="$*"
# ../logs/ALL_IN_ONE があれば、渡された試験に加えて残りの試験もこの枠の中で続けて流す（順番待ちを 1 回で済ませるため）
[ -e ../logs/ALL_IN_ONE ] && ARGS="$ARGS b64 mobile baseline chips_claude_withmap chips_claude_clean chips_top_withmap chips_nowasm chips_noblobimg"
QUICK="files size b64 startup iframe offset xss worker_fail"
want files       && run files light 400 120 python3 -I make_files.py ../files
want size        && run size light 600 120 node size_breakdown.mjs "${ART:-/home/claude/pcd-viewer/dist-artifact/pcd-viewer.html}"
want b64         && run b64 light 800 300 node b64_bench.mjs "${ART:-/home/claude/pcd-viewer/dist-artifact/pcd-viewer.html}"
want startup     && run startup heavy 2500 900 node t_startup.js
want iframe      && run iframe heavy 2500 900 node t_iframe.js
want offset      && run offset heavy 2500 900 node t_offset.js
want xss         && run xss heavy 2500 600 node t_xss.js
want worker_fail && run worker_fail heavy 2500 600 node t_worker_fail.js
want mobile      && run mobile heavy 2500 900 node t_mobile.js
want baseline    && run baseline heavy 2500 1800 bash run_app_baseline.sh
if want chips_claude_withmap; then export SHOTS=1; run chips_claude_withmap heavy 2500 3600 node t_chips.js claude withmap; unset SHOTS; fi
want chips_claude_clean   && run chips_claude_clean heavy 2500 3600 node t_chips.js claude clean
want chips_top_withmap    && run chips_top_withmap heavy 2500 3600 node t_chips.js top withmap
if want chips_nowasm; then export ONLY='^\.(laz|drc 点群|drc メッシュ|ifc|step)$'; run chips_nowasm heavy 2500 1800 node t_chips.js nowasm clean; unset ONLY; fi
if want chips_noblobimg; then export ONLY='^\.(svg|dae|fbx 文字|fbx バイナリ|png)$'; run chips_noblobimg heavy 2500 1800 node t_chips.js claude_noblobimg clean; unset ONLY; fi
for f in ../out/chips_*.json; do [ -e "$f" ] || continue; n=$(basename $f .json); node eval_chips.mjs $f ../out/app_baseline.jsonl > ../out/eval_$n.md 2>&1; echo "表: ../out/eval_$n.md（$(tail -1 ../out/eval_$n.md)）"; done
echo "おわり $(date +%H:%M:%S)"
