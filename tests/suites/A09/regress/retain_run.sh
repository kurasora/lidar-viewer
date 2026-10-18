#!/bin/bash
# 閉じたあとに画面側に残る ArrayBuffer の保持経路（heavy で流す）
W=$(cd "$(dirname "$0")/.." && pwd); cd "$W/regress"; export TMPDIR=${TMPDIR:-/tmp/a09t}
node retain.js --wait=500 $W/data/10M/c10M_bin.pcd > $W/out/retain_10M_500.json 2>&1
node retain.js --wait=3000 $W/data/10M/c10M.las > $W/out/retain_10M_3000.json 2>&1
