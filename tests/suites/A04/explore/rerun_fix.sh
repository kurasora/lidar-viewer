#!/bin/bash
W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A04
cd $W
echo "== 網羅率の表（サンプルだけ → サンプル + 単体試験）"
node --no-warnings regress/cov_table.mjs cov/samples/report/coverage-summary.json out/regress-1/coverage/coverage-summary.json
echo "== 直した試験だけ流し直し"
A04_INNER=1 node --no-warnings regress/run_all.mjs --only 'OK-U12|OK-F02|OK-A05|OK-W06|A04-001|A04-039|A04-037|A04-047' 2>&1 | grep -v "^PASS" | head -60
