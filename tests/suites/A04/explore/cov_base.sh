#!/bin/bash
W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A04
cd /home/claude/pcd-viewer && $W/tools/node_modules/.bin/c8 report --temp-directory $W/cov/samples/raw --reports-dir $W/cov/samples/report --reporter=text --reporter=json-summary --allowExternal --include '**/src/**' --exclude '**/vendor/**' --exclude '**/node_modules/**'
