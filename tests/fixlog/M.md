# M 実測の廊下のデータを作り物（合成）に置き換える（2026-10-20）

目的: 公開リポジトリから、実測の研究室の廊下の点群・軌跡と、それから作ったファイルをなくす。
M は「作り直し」と「全履歴から消すべきパスの一覧」まで。git の commit・push・履歴の書き換えはしていない（親が git filter-repo で行う）。
実測の控え `/home/claude/real-map-backup/` は読むだけで、触っていない。

## 作ったもの
- `tests/sample-generators/samples/make_synthetic_corridor.py`（numpy のみ。LAZ を書くときだけ laspy + lazrs。乱数の種は固定で、何度流しても同じものができる）
  - 建物: 研究室（7 m × 6 m、机 4・棚・ロッカー・天井の照明）＋ L 字の廊下（幅 2 m・天井 2.6 m、東西 30 m ＋ 南北 8 m）。
    扉のくぼみ（幅 0.9 m、奥に扉の板）・柱（25 cm の出っ張り）・天井の照明（5 cm 下がる、強度が高い）・消火栓の箱・掲示板
  - 点: 軌跡に沿って動く LiDAR（水平 360°、上下 -7〜52°、最大 40 m）から 0.5 秒ごとに光線を飛ばし、箱に当たった所を点にする
    （距離の雑音 1.2 cm、まれな外れ点）。3 cm の格子に 1 点に間引き、361,000 点にそろえる。近い所・よく見た所ほど密（密度のむら）
  - 強度: 面ごとの反射の強さ × 入射角 × 距離 ＋ 雑音（中央値 37、最大 139。実測は中央値 32・99.9 % が 150 以下。
    A01 の gen_e57.py が「強度 × 12 ≤ 2047」を前提にしているので、5,000 点の元の強度は 170 以下に収めた）
  - 地図の座標: FAST-LIO と同じく走り始めのセンサーが原点。傾き 3.4°・向き -17° を付けた（開いたときの自動の水平補正が掛かる）
  - 軌跡: 部屋 → 廊下の東の端 → 北の突き当たり → 引き返して西の突き当たり → 部屋。10 Hz・4,210 行・約 421 秒・83 m。
    時刻は 2000-01-01 起点の作り物（946684800.937〜）。列は今までと同じ「# t x y z」の 4 列・空白区切り・小数 3 桁
  - 書き出し: `map.json`（n・lo・sc・b64（u16 の量子化、順番は混ぜる）・b64i（u8 の強度））、
    `map.laz`（LAS 1.2・点の形式 0・目盛り 0.001・オフセット 0・x の小さい順）、`trajectory.txt`。どれも今までの形のまま
  - 使い方: `python3 tests/sample-generators/samples/make_synthetic_corridor.py [出力先]`（既定はリポジトリの `sample/`）

## 作り直したもの（すべて合成の地図から）
- `sample/map.json` `sample/map.laz` `sample/trajectory.txt`
- サンプル一式（`tests/sample-generators/samples`）: `make_src.py 5000` → `src/P.npy I.npy RGB.npy src.ply`（`keep_src.ply` はその写し）→
  `gen_mesh.py`・`gen_py1.py`・`gen_py2.py`・`gen_py3.py` → `gen_clouds.sh` → 下の「CloudCompare の手順」。
  そのうち実測の点・軌跡から作られる 58 個を `out/` と `sample/formats/` に入れ替え、`cc/` 11 個・`tmp/` 9 個・`keep/cc_plane.bin`・`out_expected.json` も作り直した
  - 点群（P）由来: cc_cloud.*（10）・cc_cloud_ascii/binary.ply・cc_cloud_normals/shift.bin・cc_two_clouds.bin・cc_ptx_scans.bin・cc_plane.bin・pcl_*.pcd（3）・
    laspy_utm.las・laspy_14.laz・pye57_2scans.e57・handmade_2scans.ptx/.soi・handmade_bundler.out・handmade_cloud.pn/.pv・pov_scan0/1.asc・icm_cloud.asc・
    dracopy_cloud.drc・pyshp_points.*（3）・handmade_project.psz
  - 軌跡由来: handmade_lines.poly/.sx・pyshp_lines.*（3）・ezdxf_drawing.dxf（点も）
  - 真上から見た絵（廊下の形が写る）: pillow_topview.*（12）・handmade_topview.cur/.wbmp/.xpm・tifffile_rgb.tif
- A01 `regress/data/ascii/*`（26）と `regress/data/manifest.json`: 新しい `src/P.npy` などを `gen/` に置いて `gen/gen_all.py` → `gen/gen_cc_files.sh` → `gen/gen_all.py`（397 件、試験の顔ぶれは前と同じ）。
  `data/traj/*` は作り直しても同じ中身（合成）だったので変えていない
- A03 `crashers/`: `cr_only.pcd`（新しい pcl_ascii.pcd の改行を CR に）、`ply_binary_truncated.ply`（新しい cc_cloud_binary.ply の先頭 710 バイト）、
  `tga_havoc_hang.tga`（新しい pillow_topview.tga に前と同じ変異: 先頭に 0x0A を 1 バイト足し、元の 169640〜169643 を `00 01 00 00`、181082〜181085 を `40 00 00 00` に）
- A05 `data/trajectory.txt`（sample/trajectory.txt の写し）
- A12 `regress/data/traj_kitti.txt` `traj_xyzq.txt` `traj_utm.txt`（`gen_data.py` で。sample/trajectory.txt から作る）
- 試験の期待値（実測の 5,000 点の範囲が書いてあった）: A11 `regress/check.py` の a003（x の範囲 -4.3512〜28.6278）、A14 `regress/c12_misc.js` の `a_expected`

### CloudCompare の手順（元の gen_clouds.sh に無かったものを再構成。できたファイルの大きさは元と 1 バイトまで同じ）
`QT_QPA_PLATFORM=offscreen xvfb-run -a -n 650 CloudCompare -SILENT -NO_TIMESTAMP …` で:
- `cc/src.*`: `src/src.ply` を `-C_EXPORT_FMT ASC -EXT asc -ADD_HEADER`／`-EXT csv -SEP COMMA -ADD_HEADER`／`-EXT txt`／`-EXT pts -ADD_PTS_COUNT`／`-EXT xyz -SEP SEMICOLON`／`-EXT neu -SEP TAB`／`BIN`／`VTK`／`SBF` で書く。`cc/src.ply` は `src/src.ply` の写し
- その後 `gen_clouds.sh`（`tmp/` を作り直すので先に流す）
- `tmp/n.ply`・`tmp/s.ply` = src.ply、`tmp/p.ptx` = out/handmade_2scans.ptx、`tmp/second.asc` = P の先頭 1000 点の z+5 と強度×2（`%.4f %.4f %.4f %.1f`）、
  `tmp/shift.asc` = P + (539000, 3836000, 30) と色・強度（見出し `//X Y Z R G B Intensity`）
- `cc_cloud_normals.bin`: `-O n.ply -COORD_TO_SF Z -OCTREE_NORMALS 0.5 -C_EXPORT_FMT BIN -SAVE_CLOUDS FILE n_OCTREE_NORMALS.bin`
- `cc_cloud_shift.bin`: `-C_EXPORT_FMT BIN -O -GLOBAL_SHIFT AUTO shift.asc -SAVE_CLOUDS`
- `cc_two_clouds.bin`: `-C_EXPORT_FMT BIN -O s.ply -O second.asc -SAVE_CLOUDS ALL_AT_ONCE`
- `cc_ptx_scans.bin`: `-C_EXPORT_FMT BIN -O p.ptx -SAVE_CLOUDS ALL_AT_ONCE`（AllClouds.bin。記録は tmp/log.txt）
- `cc_plane.bin`（out と keep の両方）: `-C_EXPORT_FMT BIN -O s.ply -BEST_FIT_PLANE`（s_BEST_FIT_PLANE.bin）
- `pillow_topview.icns`: 元のものは ic07（128×128 の PNG）1 つだけだった。今の Pillow はすべての大きさを書いて 730 KB になり試作ページが 1 MB 増えるので、Pillow の出力から ic07 だけを取り出して書き直した
- 手順の写し（scratch、消えることがある）: `/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/M/redo_samples.sh`・`cc_steps.sh`・`gen_clouds_run.sh`

## 実測由来ではなかったので変えていないもの（確かめ方）
- メッシュ由来（gen_mesh.py の合成の廊下）: trimesh_mesh.*・cc_mesh.*・dracopy_mesh.drc・handmade_*.fbx・gmsh_parts.step・ifcopenshell_building.ifc・
  keep/cc_mesh*.bin・tmpm/*・src/mesh*。作り直すと同じ中身（dae・step・ifc は書いた時刻だけ違う）
- 手書きの合成: handmade_plant.mac・handmade_floorplan.svg・handmade_matrix.csv・tifffile_dem.tif・handmade_scans.pov・handmade_images.icm・icm_images.wrl・cc_mesh_lines/textured.bin（座標 0〜10 の四角）
- A02 `data/cases.json`（作り直して同じ）、A04 `files/*`（gen_las.py などの合成。utm_ref.txt は乱数の点で、実測の点とは合わない）、
  A05 の c_trajectory・utm_traj・plain_xyz・proposed_layout・cc_export_merged（作り直して同じ。合成の廊下）、A11 p12 の軌跡（合成の部屋）、A13・A14 のファイル（合成）
- 時刻 1791886716 を合成のデータに使っているだけの生成スクリプト（A05・A11・A14）は、形が分からないので変えていない。tests/reports*・BUGS.md・fixlog・env/README の文章も残した

## 確かめたこと
- 実測の点・軌跡の座標に 2 mm 以内で合う 3 つ組の数を、作業中の全ファイルと、全履歴のすべての version（`git rev-list --all --objects` の blob、UTF-16 も）で数えた（ローカルと +UTM の両方）。
  作り直した後の作業中のファイルは 0 件。履歴で見つかったのは一覧に入れたパスだけ。画像（png・jpg など）はアプリのアイコンと pillow_topview.* だけで、ほかに地図の画像は履歴にもない
- 写し（`$T/bin/mkcopy $T/work/M/proj`）で `node build.mjs` と `node build.mjs artifact` が通る（試作ページ 14.72 MB。前は 14.60 MB）
- Chromium（http.server で配信）: アプリ version で map.laz（361,000 点）と trajectory.txt（4,210 姿勢・83.1 m・420.9 秒）が開き、自動の水平補正「傾き 3.40° を補正、廊下の向きに合わせて 17.0° 回転、床の高さ -0.446 m」。
  cc_cloud.csv・.sbf + .sbf.data・cc_cloud_binary.ply・cc_cloud_ascii.ply・cc_mesh.obj・OBJ + MTL + PNG（cc_mesh_textured）・laspy_utm.las・pillow_topview.png も開く。
  試作ページ（claude.ai の枠の HTML で包んだもの）でサンプルの地図・軌跡が自動で開いて同じく補正され、形式のサンプルのボタン（.csv・.sbf・.ply バイナリ・.obj・.laz・.png）も開く。pageerror はどちらも 0
- 起動時の知らせ「…点群なら「ファイル」の一覧で「点群として開き直す」を押してください」は、前のサンプルでも同じく出る（変化なし）

## 全履歴から消すべきパス
- `/home/claude/purge-paths.txt`（180 行）。今のパスと、`git log --all --name-only` で過去にあった同じ由来のパス（同じパスだけで、別の名前で残っていたものはなかった）
- 新しいファイルは `/home/claude/new-data/` に同じ相対パスで写した（上の 180 個 ＋ 消さないが足した・変えたファイル 4 個: make_synthetic_corridor.py・A11 check.py・A14 c12_misc.js・この M.md）
- `cc_cloud.sbf`（3 か所）は見出しだけで中身は前と同じだが、組（.sbf + .sbf.data）として一覧に入れた

## 提案（まだしていない）
- `gen_clouds.sh` に上の CloudCompare の手順と icns の書き直しを足し、`cd /home/claude/samples` を自分の場所からの相対にすれば、サンプル一式を 1 本で作り直せる
- `tests/env/README.md` のサンプルの期待値（mean≈[14.7463, …] など）は古い値のまま。新しい値は `tests/sample-generators/samples/out_expected.json`
