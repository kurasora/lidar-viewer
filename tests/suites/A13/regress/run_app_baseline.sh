#!/bin/bash
# アプリ版（dist/index.html、Chromium）で、試作ページのボタンと同じファイルの組を開いた結果（比較の基準）
#   出力: out/app_baseline.jsonl
cd "$(dirname "$0")"
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
mapfile -t ARGS < <(node chip_groups.mjs)
TMPDIR=/tmp/a13t WAIT=150000 node $T/harness/browser_read.js "${ARGS[@]}" > ../out/app_baseline.jsonl
