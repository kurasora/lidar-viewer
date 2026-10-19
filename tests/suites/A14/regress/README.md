# A14 探索的試験の資産（次回の再試験用）

`W=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A14`

## 1 本で流す
```
bash $W/regress/run.sh all        # 試験用ファイルを作り（なければ）、Node → アプリ version の順に流す
bash $W/regress/run.sh node       # Node だけ（数十秒）
APPDIR=$W/proj bash $W/regress/run.sh app   # 直した写し（$T/bin/mkcopy $W/proj して node build.mjs）を試す
```
結果は `$W/out/run_<日時>/`。`judge.txt` に問題ごとの OK（直った）/ NG（まだ再現）。判定を自動にしていないもの（画面の確かめ）はログを見る。

## 試験用ファイルの作り方（regress/gen/）
| スクリプト | 作るもの | 何を確かめるのに使うか |
|---|---|---|
| `world.py` | 正解の分かっている建物（L 字の廊下: 幅 2.4 m・天井 2.7 m・床の上の箱 0.6×0.4×0.8 m・扉のへこみ・天井の照明）と、MID-360 風の走査（水平 360°・上下 -7〜52°・距離の雑音 1 cm）。環境変数 SENSOR_H・MOUNT_ROLL・MOUNT_PITCH | 共通部品 |
| `gen_fastlio.py <出力> [光線数]` | FAST-LIO 風: scans.pcd（PointXYZINormal binary）、truth.json（正解: 変換・箱の角・床/天井の点）、odom_tum.txt、poses_kitti.txt、pos_log.txt（FAST-LIO の Log 形式 25 列）、rosbag2 MCAP 4 種（/Odometry 等・zstd・/path だけ・/odom だけ）。NOBAG=1 で bag なし | お金のツアー、水平補正、軌跡 |
| `gen_shift.py <元> <出力>` | 同じ地図の LAS: ローカル・UTM 風（+539000,+3836000,+30）・平面直角風（-38000,-12000）・1 点目が原点の UTM、UTM の TUM 軌跡 | グローバルシフト・座標の表示 |
| `gen_liosam_livox.py <FAST-LIO の出力> <出力>` | LIO-SAM: GlobalMap.pcd・trajectory.pcd・transformations.pcd（time F8）、livox: livox_frame.pcd（PointXYZRTLT 26 バイト/点・timestamp F8 ns）と ascii version | double の欄・種類の色分け |
| `gen_outdoor.py <出力>` | 屋外（地面・高さ 12 m の建物 3 棟・並木 40 本: 葉の層 4.5〜7 m） | 天井を隠す（屋外） |
| `gen_cls.py <元> <出力>` | 分類つき LAS（1・2・6・18） | 種類の色分けの色のかぶり |
| `gen_wrong.py <出力>` | 16000×16000 の PNG（中身は単色・ファイルは小さい）、8000×6000 の JPEG | 巨大な画像 |
| `gen_ply_for_cc.py` + `../c4_cc_convert.sh` | CloudCompare に通した ASCII（見出しに timestamp）・CSV（2 つをまとめた Original cloud index）・BIN（gps_time をオフセット付きで持つ） | ドラッグ時の判定・CC の BIN |
※ この環境の CloudCompare は PCD と LAS を開けない（qPCL・LAS の部品がない）ので、PLY に直してから渡す。

## 再現スクリプト（問題との対応）
| スクリプト | 実行 | 問題 |
|---|---|---|
| `level_check.js <フォルダ>…` | heavy（Chromium、X 不要） | A14-001 床の検出 |
| `c1_money.js` / `c1_pick_hidden.js` | heavy + xvfb（Electron） | A14-001・A14-002 |
| `c5_shift.js` | heavy + xvfb | A14-004 |
| `field_precision.mjs <ファイル>…` | light（Node） | A14-005 |
| `c4_is_traj.mjs` | light（Node） | A14-006 |
| `c7_traj_parse.mjs` / `c7_wrong.js` | light / heavy | A14-007 ほか反対側のツアー |
| `c5b_coords.js` | heavy + xvfb | A14-008 |
| `c6_bad.js` | heavy + xvfb | 悪い地区ツアーの各項目 |
| `c8_night.js` | heavy + xvfb | 深夜ツアー（メモリの推移） |
| `c10_sights.js` `c12_misc.js` `c3_fields.js` `c1c_outdoor.js` | heavy | 名所・裏通り・使い勝手 |
| `lib.js` | — | Electron を動かす共通部品（launch / open / drop / waitIdle / screenOf / click / shot） |
| `bg.sh <名前> <light|heavy|bigmem> <コマンド>` | — | 見張り付きでバックグラウンド実行し out/<名前>.log へ（heavy の順番待ちが長いとき用） |

## 次回の探索のチャーター（実機の確認のあと）
1. **本物の FAST-LIO の地図**（i-Cart mini の高さに MID-360）で、自動の水平補正の床の高さ（A14-001）と、天井を隠したまま真上からの計測（A14-002）
2. **大きな bag**（/livox/lidar を含む数 GB の .mcap）を「軌跡を開く」で開いたときの時間とメモリ
