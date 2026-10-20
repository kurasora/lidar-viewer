#!/bin/bash
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
# A13 試作ページ（アーティファクト version）の再試験をまとめて流す
#   使い方: bash run.sh [quick|all|<試験の名前>...]
#     quick … files size startup iframe offset xss worker_fail（20〜30 分）
#     all   … quick ＋ mobile ＋ アプリ version の基準（baseline）＋ サンプル 73 個を 3 通り（chips_claude_withmap / chips_claude_clean / chips_top_withmap）
#             ＋ wasm 禁止（chips_nowasm）・blob 画像禁止（chips_noblobimg）（合計 2〜3 時間。このマシンでは順番待ちが長い）
#     名前を並べると、その試験だけ（例: bash run.sh offset xss）
#   heavy の枠を 1 つだけ取り、その中で試験を順に動かす（試験ごとに順番待ちしないように）。上限: MEM（既定 2800 MB）・TIMEOUT（既定 10800 秒）
#   環境変数: ART=試作ページのパス、APP=アプリ version のページ（URL）
#   結果: ../out/*.json・画面写真、../logs/*.log、判定の表 ../out/eval_*.md
#   メモ: Chromium は長い TMPDIR だと起動できない（プロファイルの UNIX ソケットのパスが長すぎる）ので /tmp/a13t（$W/tmp への記号リンク）を使う
#         http サーバーは各試験の中で 8830（親・claude.ai 役）と 8831（子・アーティファクト役）に立てて、最後に止める
cd "$(dirname "$0")"
export T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
export W=${W:-$T/work/A13}
mkdir -p ../out ../logs ../files $W/tmp
ln -sfn $W/tmp /tmp/a13t
MEM=${MEM:-2800} TIMEOUT=${TIMEOUT:-10800} GUARD_VERBOSE=1 exec $T/bin/heavy bash run_inner.sh "$@"
