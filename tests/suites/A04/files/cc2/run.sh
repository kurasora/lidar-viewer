#!/bin/bash
cd /tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A04/files/cc2
export QT_QPA_PLATFORM=offscreen
for fmt in SBF BIN; do
  timeout 120 xvfb-run -a -n 140 CloudCompare -SILENT -NO_TIMESTAMP -O -GLOBAL_SHIFT AUTO utm.asc -C_EXPORT_FMT $fmt -SAVE_CLOUDS > cc_$fmt.log 2>&1; echo "$fmt rc=$?"
done
timeout 120 xvfb-run -a -n 140 CloudCompare -SILENT -NO_TIMESTAMP -O -GLOBAL_SHIFT AUTO utm.asc -C_EXPORT_FMT PLY -PLY_EXPORT_FMT BINARY_LE -SAVE_CLOUDS > cc_PLY.log 2>&1; echo "PLY rc=$?"
ls -la
