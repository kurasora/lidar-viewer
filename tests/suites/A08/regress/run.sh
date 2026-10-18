#!/bin/bash
# A08 セキュリティ 再試験ランナー（実験室で実機確認後に、この 1 本で全 PoC を流す）
#   使い方: bash regress/run.sh        （$W で実行。netns a08 を自動で作成・削除）
#   各 PoC は見張り（light/heavy）経由で実行する。
set -u
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv
W=$T/work/A08
cd "$W"
pass(){ echo "[PASS] $1"; }; info(){ echo "[... ] $1"; }
mkdir -p evidence tmp

echo "################ A08-001: 悪意 PCV1 で主プロセス相当がクラッシュ ################"
$T/bin/light node poc/poc_a_pcv1_crash.js | tee evidence/A-001_pcv1_crash.txt
grep -q "CRASH CONFIRMED" evidence/A-001_pcv1_crash.txt && pass "A08-001 crash reproduced" || echo "[FAIL] A08-001"

echo "################ A08-002: 項目名の HTML 注入（本番 dist を Chromium で）################"
$T/bin/heavy node poc/poc_c_xss.js poc/mal/xss_fields.pcd | tee evidence/C-xss_info.txt
grep -q '"htmlInjection": true' evidence/C-xss_info.txt && pass "A08-002 HTML injection reproduced" || echo "[FAIL] A08-002"
grep -q '"scriptExecuted_xssFired": false' evidence/C-xss_info.txt && pass "A08-002 script blocked by CSP (as expected)" || echo "[WARN] script may have executed!"

echo "################ A08-003: binary_compressed 解凍爆弾（cap を無視）################"
node poc/gen_lzf_bomb.mjs 1000000000 1000000000 poc/tmp_bomb.pcd >/dev/null 2>&1
GUARD_VERBOSE=1 $T/bin/light node --no-warnings "$T/harness/read.mjs" poc/tmp_bomb.pcd > evidence/B_bomb_run.txt 2>&1
echo "exit=$?" >> evidence/B_bomb_run.txt
rm -f poc/tmp_bomb.pcd
grep -q 137 evidence/B_bomb_run.txt && pass "A08-003 memory guard tripped by small file" || echo "[FAIL] A08-003"

echo "################ A08-007: IPC share step 無検査（encodeBatch 例外）################"
$T/bin/light node poc/poc_d_ipc_args.mjs | tee evidence/D-ipc_args.txt
grep -q "step=0 -> THROW" evidence/D-ipc_args.txt && pass "A08-007 encodeBatch throws on step<=0/NaN" || echo "[FAIL] A08-007"

echo "################ A08-004/005: ネットワーク（netns a08 を作成）################"
$T/bin/rmnet a08 3 2>/dev/null
if $T/bin/mknet a08 108 3 >/dev/null 2>&1; then
  echo "--- A08-004 配信 WS 認証なし ---"
  $T/bin/light bash poc/net/run_share.sh | tee evidence/E-share_noauth.txt
  grep -q '"receivedFrames":[1-9]' evidence/E-share_noauth.txt && pass "A08-004 unauthenticated receive" || echo "[FAIL] A08-004"
  echo "--- A08-005 偽ビーコンなりすまし ---"
  $T/bin/light bash poc/net/run_beacon.sh | tee evidence/F-beacon_spoof.txt
  grep -q 'EVIL-HOST' evidence/F-beacon_spoof.txt && pass "A08-005 spoofed peer appeared" || echo "[FAIL] A08-005"
  $T/bin/rmnet a08 3
else
  info "netns を作成できませんでした（権限？）。A08-004/005 はスキップ。"
fi

echo "################ 参考: 大容量確保は遅延（RSS を増やさない）ことの確認 ################"
MEM=5000 TIMEOUT=120 $T/bin/light node poc/probe_alloc.mjs | tee evidence/probe_alloc.txt
echo "done."
