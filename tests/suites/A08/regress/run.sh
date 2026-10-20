#!/bin/bash
# A08 セキュリティ 再試験ランナー（実験室で実機確認後に、この 1 本で全 PoC を流す）
#   使い方: bash regress/run.sh        （$W で実行。netns a08 を自動で作成・削除）
#   各 PoC は見張り（light/heavy）経由で実行する。
set -u
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
W=$T/work/A08
cd "$W"
# 判定: [OK] 直っている（穴を再現できない）／[NG] 再現した（直っていない）。前回（0.3.0）は「再現した」を PASS と書いていた
ok(){ echo "[OK] $1"; }; ng(){ echo "[NG] $1"; }; info(){ echo "[... ] $1"; }
mkdir -p evidence tmp

echo "################ A08-002: 項目名の HTML 注入（本番 dist を Chromium で）################"
$T/bin/heavy node poc/poc_c_xss.js poc/mal/xss_fields.pcd | tee evidence/C-xss_info.txt
grep -q '"htmlInjection": true' evidence/C-xss_info.txt && ng "A08-002 項目名から HTML の要素ができた（直っていない）" || ok "A08-002 項目名は文字として出る（HTML にならない）"
grep -q '"scriptExecuted_xssFired": false' evidence/C-xss_info.txt && ok "A08-002 スクリプトは動かない" || ng "A08-002 スクリプトが動いた可能性"

echo "################ A08-003: binary_compressed 解凍爆弾（cap を無視）################"
node poc/gen_lzf_bomb.mjs 1000000000 1000000000 poc/tmp_bomb.pcd >/dev/null 2>&1
GUARD_VERBOSE=1 $T/bin/light node --no-warnings "$T/harness/read.mjs" poc/tmp_bomb.pcd > evidence/B_bomb_run.txt 2>&1
echo "exit=$?" >> evidence/B_bomb_run.txt
rm -f poc/tmp_bomb.pcd
grep -q 137 evidence/B_bomb_run.txt && ng "A08-003 小さなファイルでメモリの上限を超えた（直っていない）" || ok "A08-003 解凍爆弾はすぐ断る（$(grep -o '"error":"[^"]*"' evidence/B_bomb_run.txt | head -1)）"

echo "################ 参考: 大容量確保は遅延（RSS を増やさない）ことの確認 ################"
MEM=5000 TIMEOUT=120 $T/bin/light node poc/probe_alloc.mjs | tee evidence/probe_alloc.txt
echo "done."
