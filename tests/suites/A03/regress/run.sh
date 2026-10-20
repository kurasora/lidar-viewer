#!/bin/bash
# A03 ファジングの再試験。実験室で実機確認が終わったあと、これ 1 本で全部流す。
#   使い方: $T/bin/light bash run.sh            （既定: 代表ケース + 全キャンペーン）
#           QUICK=1 $T/bin/light bash run.sh    （代表ケースと縮小キャンペーンだけ・数分）
# 出力: $W/out/*.jsonl（1 行 1 件の JSON）と、最後に各キャンペーンのまとめ
set -e
T=${T:-/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv}
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
W=$T/work/A03
F=$W/fuzz G=$W/gen OUT=$W/out
mkdir -p $OUT
cd $F

echo "###############################################################"
echo "# 0) 基準: 82→Node で読める 55 種の種ファイルをそのまま読む"
echo "###############################################################"
node gen_baseline.mjs $G/jobs_base.jsonl
node runner.mjs $G/jobs_base.jsonl $OUT/base.jsonl --timeout=30000 --mem=600 --quiet | sed -n '/== まとめ ==/,$p'

echo "###############################################################"
echo "# 1) 構造を意識した改ざん（頭書きの数・再帰・過大確保 など）"
echo "###############################################################"
node $G/struct.mjs
MEM_GUARD=3000 node runner.mjs $G/jobs_struct.jsonl $OUT/struct.jsonl --timeout=20000 --mem=450 --quiet | sed -n '/== まとめ ==/,$p'

echo "###############################################################"
echo "# 2) 現実的な途中切れ（ROS 記録停止・コピー途中切れ）: 全種子 × 多数の切り位置"
echo "###############################################################"
node campaign.mjs trunc $G/jobs_trunc.jsonl
node runner.mjs $G/jobs_trunc.jsonl $OUT/trunc.jsonl --timeout=20000 --mem=450 --quiet | sed -n '/== まとめ ==/,$p'

if [ -z "$QUICK" ]; then
echo "###############################################################"
echo "# 3) 変異ファジング（ビット反転・置換・切詰・繰返・挿入・削除）"
echo "###############################################################"
for k in havoc head; do
  node campaign.mjs $k $G/jobs_$k.jsonl
  node runner.mjs $G/jobs_$k.jsonl $OUT/$k.jsonl --timeout=15000 --mem=450 --quiet | sed -n '/== まとめ ==/,$p'
done
fi

echo "###############################################################"
echo "# 4) 改行・文字コード（CRLF / CR / 混在 / BOM / UTF-16）と数の病的値"
echo "###############################################################"
for k in nl token; do
  node campaign.mjs $k $G/jobs_$k.jsonl
  node runner.mjs $G/jobs_$k.jsonl $OUT/$k.jsonl --timeout=15000 --mem=450 --quiet | sed -n '/== まとめ ==/,$p'
done

echo "###############################################################"
echo "# 5) 既知の再現（crashers/）を個別に確認"
echo "###############################################################"
bash $W/regress/checks.sh

echo "###############################################################"
echo "# 6) 集計（英語例外の漏れ箇所・HANG・MEM・CRASH・非有限座標）"
echo "###############################################################"
node $W/regress/summarize.mjs

echo
echo "完了。ブラウザ version での確認（任意、heavy・SwiftShader）:"
echo "  WAIT=90000 SHOT=$OUT/shots \$T/bin/heavy node \$T/harness/browser_read.js \\"
echo "    $W/crashers/float32_overflow.xyz -- $W/crashers/off_truncated.off -- $W/crashers/dxf_self_insert.dxf -- <良いファイル>"
