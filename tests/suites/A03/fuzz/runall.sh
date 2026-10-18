#!/bin/bash
set -e
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A03
cd $W/fuzz
for k in havoc head nl token; do
  node runner.mjs $W/gen/jobs_$k.jsonl $W/out/$k.jsonl --timeout=15000 --mem=450 --quiet > $W/logs/$k.log 2>&1
done
echo ALLDONE > $W/logs/campaign.done
