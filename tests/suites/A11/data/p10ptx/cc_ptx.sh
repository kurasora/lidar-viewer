set -e
cd /tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A11/data/p10ptx
rm -rf cc && mkdir cc && cp mat2.ptx cc/
QT_QPA_PLATFORM=offscreen xvfb-run -a -n 210 CloudCompare -SILENT -NO_TIMESTAMP -O cc/mat2.ptx -MERGE_CLOUDS -C_EXPORT_FMT ASC -PREC 6 -SAVE_CLOUDS > cc/log.txt 2>&1 || true
ls cc
