#!/bin/bash
# A11 の試験用ファイルをすべて作り直す（乱数の種は固定なので毎回同じものができる）。light の中で動かす
#   使い方: $T/bin/light bash $W/regress/gen_all.sh
set -e
W=$(cd "$(dirname "$0")/.." && pwd); L=$W/lib
cd $W/data/p1 && python3 gen.py $L                      # 部屋（天井あり）
cd $W/data/p2 && python3 gen.py $L                      # 200 万点の箱＋遠い 10 点
cd $W/data/p3 && python3 gen.py $L                      # UTM・傾き・向きつきの部屋（PCD double / LAS / 局所）
cd $W/data/p4 && python3 gen.py $L                      # 先頭に外れ値のある部屋
cd $W/data/p5 && python3 gen_level.py $L $W/data/p5/cases && python3 gen_sweep.py $L $W/data/p5/sweep   # 水平補正
cd $W/data/p6 && python3 gen_ceil.py $L                 # 天井（2 階建て・吹き抜け・斜め・屋外・床下・梁）
cd $W/data/p6n && python3 gen.py $L                     # 床下の面の広さ・斜めの天井の角度
cd $W/data/p9 && python3 gen.py $L                      # 分類の色・Inf/NaN の強度
cd $W/data/p9b && python3 gen.py $L                     # double の時刻の欄
cd $W/data/p10 && python3 gen_tif.py && python3 gen_color.py $L && python3 gen_color2.py   # GeoTIFF・色（LAS 16bit・PLY ushort・PTS）
cd $W/data/p10ptx && python3 gen_ptx.py $L              # PTX の変換行列
cd $W/data/p10e57 && python3 gen_e57.py                 # E57 の pose
cd $W/data/p11 && python3 gen_sp.py $L                  # 点の間隔
cd $W/data/p12 && python3 gen_traj.py $L $W/data/p3/truth.json   # 軌跡
cd $W/data/p13 && python3 gen.py $L                     # 遠い外れ値（選択の時間）
echo gen_all done
