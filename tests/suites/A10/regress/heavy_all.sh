#!/bin/bash
# 起動と終了・サンドボックスの試験を、1 回の heavy でまとめて流す（root で）
#   MEM=3000 TIMEOUT=1800 heavy bash heavy_all.sh [release フォルダ] [部分...]
#   部分: lifecycle sandbox（省くと lifecycle）。lifecycle の場面は LIFE_SCENES="basic second ..." で絞れる
# 出力: $W/run/heavy_<日時>/（lifecycle.jsonl・sbx/）
set -u
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv
W=${W:-$T/work/A10}
REL=${1:-/home/claude/pcd-viewer/release}; shift || true
PARTS=${*:-lifecycle}
export W APPBIN="$REL/linux-unpacked/$(ls "$REL/linux-unpacked" | grep -E '^(lidar-viewer|pcd-viewer)$' | head -1)"
# Chromium の二重起動防止のソケットは $TMPDIR の下に作られ、パスが 107 文字を超えると作れない → 短い記号リンクを使う（中身は $W/tmp/e）
mkdir -p "$W/tmp/e"; ln -sfn "$W/tmp/e" /tmp/a10t; export TMPDIR=/tmp/a10t
OUT=$W/run/heavy_$(date +%m%d_%H%M%S); mkdir -p "$OUT"; ln -sfn "$OUT" "$W/run/heavy_latest"
echo "APPBIN=$APPBIN OUT=$OUT PARTS=$PARTS"
for part in $PARTS; do
  case $part in
    lifecycle)
      echo "== lifecycle $(date +%T)"
      (cd "$OUT" && xvfb-run -a -n 200 -s "-screen 0 1600x1000x24" node "$W/regress/lifecycle.js" ${LIFE_SCENES:-} > "$OUT/lifecycle.jsonl" 2> "$OUT/lifecycle.err")
      cp -r "$W/run/lifecycle/." "$OUT/lifecycle_files/" 2>/dev/null
      cut -c1-300 "$OUT/lifecycle.jsonl" ;;
    sandbox)
      echo "== sandbox $(date +%T)"
      xvfb-run -a -n 200 -s "-ac -screen 0 1280x800x24" bash "$W/regress/linux_sandbox_test.sh" "$REL/linux-unpacked" "$OUT/sbx" "${APPIMG_ROOT:-}"
      rm -rf "$OUT/sbx/sbx" ;;
  esac
done
echo "== done $(date +%T)"
