#!/bin/bash
W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A04
python3 $W/regress/gen_tif.py $W/files/tif && node --no-warnings $W/explore/e_tif.mjs $W/files/tif
