#!/bin/bash
# Node で直接動かす試験（worker.js・Sink・読み込み部品）。light の中で動かす（MEM=1500 くらい）
#   使い方: MEM=1500 TIMEOUT=1800 $T/bin/light bash $W/regress/node_all.sh
W=$(cd "$(dirname "$0")/.." && pwd); O=$W/regress/out; mkdir -p $O
N="node --no-warnings"
cd $W/data/p4 && $N t_shift.mjs > $O/shift.txt 2>&1                                   # A11-006
cd $W/data/p5 && $N t_level.mjs cases/*.pcd > $O/level_raw.jsonl && python3 check_level.py cases/truth.json $O/level_raw.jsonl $O/level_check.json > $O/level_table.txt   # A11-009
cd $W/data/p5 && $N t_level.mjs sweep/*.pcd > $O/sweep_raw.jsonl && python3 check_level.py sweep/truth.json $O/sweep_raw.jsonl $O/sweep_check.json > $O/sweep_table.txt
cd $W/data/p6n && $N t_ceil_node.mjs below_*.pcd slopeceil_*.pcd > $O/ceil_sweep.jsonl   # A11-007/008/009
cd $W/data/p9b && $N t_field.mjs > $O/field_f8.txt 2>&1
cd $W/data/p10 && $N t_tif.mjs > $O/tif.txt 2>&1 && $N t_color.mjs > $O/color.txt 2>&1 && $N t_color2.mjs > $O/color2.txt 2>&1
cd $W/data/p10ptx && $N t_ptx.mjs > $O/ptx.txt 2>&1
cd $W/data/p10e57 && $N t_e57.mjs > $O/e57.txt 2>&1
cd $W/data/p11 && $N t_spacing.mjs sp_room.pcd sp_map.pcd sp_dup.pcd sp_sparse1km.pcd sp_dem30.pcd sp_mixed.pcd > $O/spacing.jsonl && python3 check_spacing.py $O/spacing.jsonl > $O/spacing.txt
cd $W/data/p13 && for f in room_ok.pcd room_far5k.pcd room_far.pcd; do echo "== $f"; timeout 200 $N t_pickfar.mjs $f; done > $O/pickfar.txt 2>&1
echo node_all done
