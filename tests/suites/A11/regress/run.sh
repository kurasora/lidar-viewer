#!/bin/bash
# A11（計算と数値の正しさ）の再試験を 1 本で流す
#   使い方:  bash $W/regress/run.sh            … 全部（試験用ファイルの作成 → Node の試験 → 画面の試験 → 判定）
#            SKIP_GEN=1 bash run.sh             … ファイルを作り直さない
#            BIG=1 bash run.sh                  … 大きな画像（1,764 万点、約 2 GB）の試験も bigmem で流す
#            ONLY=ceil bash run.sh              … 画面の試験をラベルの正規表現で絞る
#   結果: $W/regress/out/（Node の結果・browser.jsonl・写真）、最後に check.py の判定表を出す
#   ※ 試験はすべて見張り付きの入口（light / heavy / bigmem）から動かす。アプリは /home/claude/pcd-viewer/dist（PAGE で写しも可）
set -u
R=$(cd "$(dirname "$0")" && pwd); W=$(cd "$R/.." && pwd); T=$(cd "$W/../.." && pwd)
O=$R/out; mkdir -p $O
export TMPDIR=$W/tmp
if [ -z "${SKIP_GEN:-}" ]; then
  echo "[1/4] 試験用ファイルを作る"; MEM=1500 TIMEOUT=1800 $T/bin/light bash $R/gen_all.sh || echo "gen_all に失敗"
fi
echo "[2/4] Node の試験（worker.js・Sink・読み込み部品・live.js）"
MEM=1500 TIMEOUT=1800 $T/bin/light bash $R/node_all.sh || echo "node_all に失敗"
if [ -n "${BIG:-}" ]; then
  echo "[2b] 大きな画像（bigmem）"
  (cd $W/data/p13 && python3 -c "
import numpy as np
w = h = 4200; img = (np.add.outer(np.arange(h), np.arange(w)) % 251).astype(np.uint8)
open('big4200.pgm', 'wb').write(f'P5\n{w} {h}\n255\n'.encode() + img.tobytes())" && \
   MEM=4000 TIMEOUT=1200 $T/bin/bigmem node --no-warnings --max-old-space-size=3500 t_bigimg.mjs big4200.pgm > $O/bigimg.txt 2>&1)
fi
echo "[3/4] 画面の試験（Chromium・dist/index.html）"
rm -f $O/browser.jsonl
TIMEOUT=2400 $T/bin/heavy node $W/lib/batch.js $R/tasks_all.json $O/browser.jsonl
echo "[4/4] 判定"
python3 $R/check.py $O
