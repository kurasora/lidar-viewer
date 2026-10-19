#!/bin/bash
# A10（配布物・クロスプラットフォーム・起動と終了）の再試験をまとめて流す
#   bash run.sh [release フォルダ] [--old <前の版の release>] [--static-only | --runtime-only] [--parts "lifecycle sandbox"]
# 例: bash run.sh /home/claude/pcd-viewer/release --old /home/claude/release-archive/release-0.2.0
# 前提: root で実行（netns・SUID の試験のため）。2 CPU・7 GB の共有マシンなので、重い部分は heavy、静的な部分は light を通す
# 出力: $W/regress/out/<日時>/static/summary.md（静的な点検）と heavy の出力（runtime_summary.md）
set -u
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv
W=${W:-$T/work/A10}
REL=/home/claude/pcd-viewer/release; OLD=""; MODE=all; PARTS="lifecycle sandbox"
while [ $# -gt 0 ]; do
  case $1 in
    --old) OLD=$2; shift 2 ;;
    --static-only) MODE=static; shift ;;
    --runtime-only) MODE=runtime; shift ;;
    --parts) PARTS=$2; shift 2 ;;
    *) REL=$1; shift ;;
  esac
done
export W TMPDIR=$W/tmp PYTHONPATH=$W/pylib
OUT=$W/regress/out/$(date +%m%d_%H%M%S); mkdir -p "$OUT"
echo "release=$REL old=${OLD:-なし} mode=$MODE out=$OUT"
# 道具の用意（なければ入れる。全体の環境は変えない）
[ -e "$W/pylib/pefile.py" ] || $T/bin/light pip install --break-system-packages --target "$W/pylib" pefile python-xlib >/dev/null
[ -x "$W/bin/nouserns" ] || { mkdir -p "$W/bin"; gcc -O2 -o "$W/bin/nouserns" "$W/regress/nouserns.c"; }
[ -e "$W/data/big8m.pcd" ] || MEM=1200 $T/bin/light python3 -I "$W/regress/gen_big_pcd.py" "$W/data/big8m.pcd" 8000000
[ -e "$W/data/fc/nocjk.conf" ] || { mkdir -p "$W/data/fc" "$W/tmp/fccache"; printf '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><dir>/usr/share/fonts/truetype/dejavu</dir><cachedir>%s</cachedir></fontconfig>\n' "$W/tmp/fccache" > "$W/data/fc/nocjk.conf"; }

if [ $MODE != runtime ]; then
  echo "== 静的な点検（light）"
  MEM=1500 TIMEOUT=1500 $T/bin/light python3 -I "$W/regress/static_checks.py" "$REL" ${OLD:+--old "$OLD"} --out "$OUT/static"
fi
if [ $MODE != static ]; then
  echo "== 起動と終了・サンドボックス（heavy）"
  MEM=3000 TIMEOUT=2400 $T/bin/heavy bash "$W/regress/heavy_all.sh" "$REL" $PARTS
  H=$(readlink -f "$W/run/heavy_latest")
  python3 -I "$W/regress/summarize_runtime.py" "$H"
  cp "$H/runtime_summary.md" "$OUT/" 2>/dev/null
fi
rm -f /tmp/a10t   # heavy_all.sh が作る短い TMPDIR の記号リンク
echo "== 結果: $OUT"
ls "$OUT"
