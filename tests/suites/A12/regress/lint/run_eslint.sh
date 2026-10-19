#!/bin/bash
# eslint（recommended）で全ソースを点検する。結果: $W/regress/out/eslint.txt
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A12
mkdir -p $W/regress/out
cd /home/claude/pcd-viewer
$W/tools/node_modules/.bin/eslint --no-config-lookup -c $W/regress/lint/eslint.config.mjs --format stylish \
  main.js preload.js build.mjs 'src/**/*.js' > $W/regress/out/eslint.txt 2>&1
echo "eslint の終了コード: $?"; tail -3 $W/regress/out/eslint.txt
