#!/bin/bash
# A04（ホワイトボックス・単体試験・網羅率）の再試験を 1 本で流す
#   使い方: regress/run.sh [--no-cov] [--only <正規表現>] [--samples-only]
#   環境変数:
#     PCDV_ROOT  対象のプロジェクト（既定 /home/claude/pcd-viewer）。直したあとの写しや tests/ に入れたときに変える
#     T          試験環境（見張り付きの入口 $T/bin/light を使う。なければそのまま node で動かす）
#     OUT        結果の置き場所（既定 regress/../out/regress-<日時>）
#   中身:
#     1) samples_run.mjs … sample/formats の全ファイルを Node の読み込み部品で読み、期待値（out_expected.json）と比べる
#     2) run_all.mjs     … 単体試験（t_*.mjs と iso/*.mjs）。FAIL の番号 = まだ直っていない報告の番号
#     3) c8              … 1) + 2) の命令・分岐網羅率（src/ ごと）
#   結果: $OUT/samples.txt・$OUT/unit.txt・$OUT/coverage.txt
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
export PCDV_ROOT=${PCDV_ROOT:-/home/claude/pcd-viewer}
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
OUT=${OUT:-$HERE/../out/regress-$(date +%Y%m%d-%H%M%S)}
mkdir -p "$OUT"
export TMPDIR=${TMPDIR:-$HERE/../tmp}; mkdir -p "$TMPDIR"
COV=1; ONLY=(); SAMPLES_ONLY=0; ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    --no-cov) COV=0 ;;
    --only) ONLY=(--only "$2"); shift ;;
    --samples-only) SAMPLES_ONLY=1 ;;
  esac; shift
done
C8=$HERE/../tools/node_modules/.bin/c8
[ -x "$C8" ] || C8=$(command -v c8 || true)
[ -n "$C8" ] || COV=0
# 見張り付きの入口（試験環境の決まり）。順番待ちを 1 回にするため、全体を 1 つの light の中で動かす
if [ -x "$T/bin/light" ] && [ -z "${A04_INNER:-}" ]; then
  echo "見張り付き（light）で動かします。順番待ちがあることがあります…"
  exec env MEM=${MEM:-2500} TIMEOUT=${TIMEOUT:-1800} "$T/bin/light" env A04_INNER=1 OUT="$OUT" bash "$0" "${ARGS[@]}"
fi
L() { "$@"; }
RAW="$OUT/cov-raw"; rm -rf "$RAW"; mkdir -p "$RAW"
envcov=(); [ $COV = 1 ] && envcov=(env NODE_V8_COVERAGE="$RAW")
echo "対象: $PCDV_ROOT / 結果: $OUT"
echo "== 1) サンプル（sample/formats）"
L "${envcov[@]}" node --no-warnings "$HERE/samples_run.mjs" > "$OUT/samples.txt" 2>&1
tail -1 "$OUT/samples.txt"
if [ $SAMPLES_ONLY = 0 ]; then
  echo "== 2) 単体試験"
  L "${envcov[@]}" node --no-warnings "$HERE/run_all.mjs" "${ONLY[@]}" > "$OUT/unit.txt" 2>&1
  tail -4 "$OUT/unit.txt"
fi
if [ $COV = 1 ]; then
  echo "== 3) 網羅率"
  (cd "$PCDV_ROOT" && L "$C8" report --temp-directory "$RAW" --reports-dir "$OUT/coverage" --reporter=text --reporter=json-summary --allowExternal --include '**/src/**' --exclude '**/vendor/**' --exclude '**/node_modules/**' > "$OUT/coverage.txt" 2>&1)
  grep -E "^ *(All files|[a-z0-9_]+\.js) " "$OUT/coverage.txt" | head -40
fi
echo "結果のファイル: $OUT"
