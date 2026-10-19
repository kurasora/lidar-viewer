#!/bin/bash
# recommended + 不具合向けの追加規則。結果: $W/regress/out/eslint_extra.json（誤検出を含むので、報告に書いたものだけが本物）
T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv; W=$T/work/A12
mkdir -p $W/regress/out
cd /home/claude/pcd-viewer
$W/tools/node_modules/.bin/eslint --no-config-lookup -c $W/regress/lint/eslint.extra.config.mjs --format json \
  main.js preload.js build.mjs 'src/**/*.js' > $W/regress/out/eslint_extra.json 2>&1
echo "eslint（追加規則）の終了コード: $?"; 
# 1 行 1 件の読みやすい形にする
node -e '
const r = require(process.argv[1]); const out = [];
for (const f of r) for (const m of f.messages) out.push(`${f.filePath.replace("/home/claude/pcd-viewer/","")}:${m.line}:${m.column} ${m.ruleId} ${m.message}`);
require("fs").writeFileSync(process.argv[2], out.join("\n") + "\n"); console.log(out.length + " 件");
' $W/regress/out/eslint_extra.json $W/regress/out/eslint_extra.txt
