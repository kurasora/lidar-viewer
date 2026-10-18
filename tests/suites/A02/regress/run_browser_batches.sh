#!/bin/bash
# Chromium での試験を形式のまとまりごとに順番に流す（heavy の枠を 1 つずつ使う）
#   使い方: run_browser_batches.sh [接頭辞]   出力: out/<接頭辞>_b<番号>.jsonl
R=$(cd "$(dirname "$0")" && pwd); T=$(cd "$R/../../.." && pwd)
pre=${1:-br}
i=0
for f in '^(obj|stl|off|vtk)' '^(gltf|glb|drc|ifc|step|psz)' '^(dxf|shp|pdms|vendor|combo|sec)' '^(png|jpg|bmp|gif|webp|tga|ppm|pgm|pbm|ico|xbm|xpm|wbmp|svg)' '^(tif|fbx|dae)'; do
  i=$((i+1))
  TMPDIR=/tmp/a02tmp SHOT=$R/out/shots TIMEOUT=1800 MEM=2000 $T/bin/heavy node $R/browser_probe.js "$f" > $R/out/${pre}_b$i.jsonl 2>&1
  echo "batch $i rc=$?"
done
