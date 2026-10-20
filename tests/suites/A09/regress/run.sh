#!/bin/bash
# A09 性能・メモリ・負荷: 再試験を 1 本で流す（この試験環境用。見張り付きの入口 light / heavy / bigmem を通す）
#   bash run.sh            … 全部（作る → 測る → 表 → 大きなファイルを消す）。2 CPU・7 GB で 2〜3 時間
#   bash run.sh quick      … 小さい物だけ（2 万点 × 50 個・200 万点・リーク 5 回など。約 15 分）
#   bash run.sh table      … 結果の表だけ作り直す
# 結果: ../out/*.jsonl（1 行 1 試験）、../out/summary.md（表）
# 大きなファイルは ../data/ に作り、最後に消す（作り方はこのフォルダのスクリプトに残っている）
set -u
R=$(cd "$(dirname "$0")" && pwd)
W=$(cd "$R/.." && pwd)
T=$(cd "$W/../.." && pwd)
"$T/bin/servedist" || true   # Chromium で開くページの配り口（file:// では別スレッドが動かない）
export TMPDIR=/tmp/a09t
ln -sfn "$W/tmp" /tmp/a09t   # Chromium の一時ソケットのパスが長すぎると起動できないので、短い名前で $W/tmp を指す
mkdir -p "$W/out" "$W/data" "$W/tmp"
cd "$R"
mode=${1:-all}

prep() {
  [ -x "$R/pcdbc" ] || gcc -O2 -o "$R/pcdbc" "$R/pcdbc.c"
  # 計測用に、縮めない（minify しない）写しを作る（関数名の入ったプロファイル用）
  if [ ! -f "$W/proj/dist/app.js" ]; then
    "$T/bin/mkcopy" "$W/proj" >/dev/null && sed -i 's/minify: true/minify: false/g' "$W/proj/build.mjs" && (cd "$W/proj" && "$T/bin/light" node build.mjs)
  fi
  [ -f "$W/data/small/c200k.e57" ] || "$T/bin/light" python3 gen_big.py --n 200000 --out "$W/data/small" --formats pcd_bin,pcd_ascii,las,laz,ply,xyz,e57 --name c200k
  [ -f "$W/data/small/c200k_bc.pcd" ] || ./pcdbc "$W/data/small/c200k_bin.pcd" "$W/data/small/c200k_bc.pcd"
  [ -f "$W/data/2M/c2M.laz" ] || "$T/bin/light" python3 gen_big.py --n 2000000 --out "$W/data/2M" --formats pcd_bin,las,laz --name c2M
  [ -f "$W/data/2M/c2M_bc.pcd" ] || ./pcdbc "$W/data/2M/c2M_bin.pcd" "$W/data/2M/c2M_bc.pcd"
  [ -d "$W/data/frames200" ] || "$T/bin/light" python3 gen_frames.py --count 200 --n 20000 --out "$W/data/frames200"
  if [ ! -f "$W/data/bnd/seq_2000.pcd" ]; then
    mkdir -p "$W/data/bnd"
    "$T/bin/light" python3 -c "
import numpy as np
for n in (999, 1000, 1001, 2000):
    P = np.zeros((n, 4), np.float32); P[:, 0] = np.arange(n); P[:, 3] = np.arange(n) % 7
    with open('$W/data/bnd/seq_%d.pcd' % n, 'wb') as f:
        f.write(('VERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH %d\nHEIGHT 1\nPOINTS %d\nDATA binary\n' % (n, n)).encode()); f.write(P.tobytes())
"
  fi
}

table() {
  python3 summarize.py "$W"/out/b*.jsonl > "$W/out/summary.md" 2>/dev/null
  echo "表: $W/out/summary.md"
}

case "$mode" in
  quick)
    prep
    TIMEOUT=2400 MEM=5000 "$T/bin/bigmem" bash batch1.sh
    table ;;
  table) table ;;
  all)
    prep
    TIMEOUT=2400 MEM=5000 "$T/bin/bigmem" bash batch1.sh
    TIMEOUT=4800 MEM=5500 "$T/bin/bigmem" bash batch2.sh
    TIMEOUT=6000 MEM=6000 "$T/bin/bigmem" bash batch3.sh
    TIMEOUT=6000 MEM=6500 "$T/bin/bigmem" bash batch4.sh
    TIMEOUT=2400 "$T/bin/heavy" node many_files.js --limit=1500 --out="$W/out/b5.jsonl" "$W/data/frames200" 200
    table
    rm -rf "$W/data/10M" "$W/data/30M" "$W/data/50M" "$W/data/sparse" "$W/data/sweep"
    echo "大きなファイルを消しました" ;;
esac
