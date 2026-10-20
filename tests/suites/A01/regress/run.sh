#!/bin/bash
# A01（点群の形式）の再試験を 1 本で流す
#   使い方: bash run.sh [段階...]
#     段階: gen（試験用ファイルを作る）cc（CloudCompare で BIN/SBF などを作る）node（Node で読む）browser（Chromium で読む）
#           scen（複数ファイルなどの場面）artifact（試作ページのサンプル）oracle（CloudCompare の読み方と比べる）
#     省略時は gen cc node browser scen artifact をすべて
#   結果: out/RESULT.txt（NG の一覧）、out/node/summary.json、out/browser/summary.json、out/scen/summary.json
#   必要なもの: Python（numpy scipy laspy lazrs pye57）、pylib/（mcap、無ければ pip install --target ../pylib mcap zstandard lz4）、PCL の道具、CloudCompare
#   実行はすべて見張り付きの入口（light / heavy）を通す
set -u
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
R=$(cd "$(dirname "$0")" && pwd)
export PYTHONPATH=$R/../pylib${PYTHONPATH:+:$PYTHONPATH}
# Chromium は長い TMPDIR だと起動できない（プロファイルのソケットのパスが 107 文字まで）ので、短い記号リンクを使う（中身は ../tmp）
mkdir -p $R/../tmp; ln -sfn $R/../tmp /tmp/a01t; export TMPDIR=/tmp/a01t
cd $R
mkdir -p out
steps=${*:-gen cc node browser scen artifact}
has() { [[ " $steps " == *" $1 "* ]]; }

if has gen; then
  echo "== 試験用ファイルを作る"
  MEM=2000 TIMEOUT=1200 $T/bin/light python3 gen/gen_all.py | tail -15
fi
if has cc; then
  if [ ! -f data/cc/bin_basic.bin ] || [ "${CC_REGEN:-}" = 1 ]; then
    echo "== CloudCompare で BIN・SBF などを作る"
    TIMEOUT=1200 $T/bin/heavy bash gen/gen_cc_files.sh
    MEM=2000 TIMEOUT=1200 $T/bin/light python3 gen/gen_all.py | tail -3
  fi
fi
if has node; then
  echo "== Node（src/io を直接）"
  rm -rf out/node
  MEM=2500 TIMEOUT=1200 $T/bin/light node --no-warnings node_check.mjs data/manifest.json out/node
  MEM=2000 TIMEOUT=900 $T/bin/light python3 compare.py data/manifest.json out/node node > out/node.txt; tail -1 out/node.txt
fi
if has browser; then
  echo "== Chromium（dist/index.html、本番と同じ道筋）"
  rm -rf out/browser
  MEM=2500 TIMEOUT=3600 $T/bin/heavy node bcheck.js data/manifest.json out/browser > out/bcheck.log 2>&1; tail -2 out/bcheck.log
  MEM=2000 TIMEOUT=900 $T/bin/light python3 compare.py data/manifest.json out/browser browser > out/browser.txt; tail -1 out/browser.txt
fi
if has scen; then
  echo "== 場面（複数ファイル・順序・軌跡・知らせ）"
  rm -rf out/scen
  MEM=2500 TIMEOUT=1800 $T/bin/heavy node bscenario.js data out/scen > out/scen.log 2>&1; tail -3 out/scen.log
  MEM=1500 $T/bin/light python3 scen_check.py data out/scen > out/scen.txt; cat out/scen.txt
fi
if has artifact; then
  echo "== 試作ページ（最初に開く地図 + 形式ごとのサンプル）"
  MEM=3000 TIMEOUT=1800 $T/bin/heavy node bartifact.js out/artifact > out/artifact.log 2>&1; tail -8 out/artifact.log
  MEM=1500 $T/bin/light python3 art_check.py out/artifact > out/artifact.txt; cat out/artifact.txt
fi
if has oracle; then
  echo "== CloudCompare の読み方と比べる（参考）"
  TIMEOUT=1800 $T/bin/heavy bash cc_oracle.sh $(cat cc_oracle.list) > out/cc_oracle.log 2>&1; tail -5 out/cc_oracle.log
  MEM=1500 $T/bin/light python3 cc_compare.py > out/cc_compare.txt; cat out/cc_compare.txt
fi
{
  echo "# A01 再試験の結果 $(date '+%F %T')（「既知」は known.tsv にある直さないもの・仕様のもの）"
  for f in out/node.txt out/browser.txt out/scen.txt out/artifact.txt out/cc_compare.txt; do [ -f $f ] && { echo "## $f"; grep -E " NG |合計|\] NG|NG " $f; }; done
} | python3 -c '
import sys, re
known = dict(l.rstrip("\n").split("\t", 1) for l in open("known.tsv", encoding="utf-8") if l.strip() and not l.startswith("#"))
for line in sys.stdin:
    m = re.search(r"NG +(\S.*?)[:：（(]", line)
    k = next((k for k in known if m and (m.group(1).strip() == k or m.group(1).strip().startswith(k + "（"))), None)
    print(line.rstrip("\n") + (f"  ← 既知: {known[k]}" if k else ""))
' > out/RESULT.txt
echo "== まとめ: $R/out/RESULT.txt"; cat out/RESULT.txt | head -80
