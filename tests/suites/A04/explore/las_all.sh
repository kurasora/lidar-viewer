#!/bin/bash
W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A04
python3 $W/regress/gen_las.py $W/files/las && node --no-warnings $W/explore/e_las.mjs $W/files/las
