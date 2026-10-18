# A01 点群の形式 — 再試験の資産

`bash run.sh` 1 本で全部（試験用ファイルの生成 → CloudCompare での変換 → Node → Chromium → 場面 → 試作ページ）が流れます。
段階だけ流すとき: `bash run.sh node browser`、CloudCompare との比較も: `bash run.sh oracle`。
結果は `out/RESULT.txt`（NG の一覧）、詳しくは `out/node.txt` `out/browser.txt` `out/scen.txt` `out/artifact.txt` `out/cc_compare.txt`。

## 中身
| ファイル | 役割 |
|---|---|
| `gen/gen_all.py` | すべての試験用ファイルと正解を作る（`data/<形式>/…`、正解は `data/<id>.expect.npz`、一覧は `data/manifest.json`） |
| `gen/common.py` | 共通（元の点群 = 廊下の 5,000 点 `gen/P.npy I.npy RGB.npy`、試験の登録 `case()`） |
| `gen/gen_pcd.py` | PCD（型・COUNT・整列・POINTS の食い違い・頭書きの揺れ・UTM・時刻の欄・FAST-LIO/Livox の欄）。ascii と binary_compressed は PCL 1.14 の `pcl_convert_pcd_ascii_binary` で変換 |
| `gen/gen_las.py` | LAS/LAZ（版 1.0〜1.4 × 点の形式 0〜10、8/16 bit の色、extra bytes、scale/offset、最初の点が原点）。laspy + lazrs |
| `gen/gen_e57.py` | E57（Float/Integer/ScaledInteger、球座標、invalidState、複数スキャン + pose、色、強度、30 万点、UTM、点 0 個のスキャン）。pye57 の libe57 を直接使う |
| `gen/gen_ply.py` | PLY（ascii/le/be、型の別名 16 種、要素の順序、list、色の名前・型、欄、CRLF、UTM、HTML の欄の名前） |
| `gen/gen_ascii.py` | 文字の点群（区切り・見出し・PTS・色・指数・BOM・UTF-16・CR・小数点カンマ・列の推測・8 列の CSV・日本語の見出し） |
| `gen/gen_ptx.py` | PTX（複数スキャン・色なし・最初のマスが空・センサー行・UTM・CRLF・0×0 のスキャン） |
| `gen/gen_cc.py` + `gen/gen_cc_files.sh` | CloudCompare 2.11.3 に書かせた BIN・SBF・ASC・PLY（gen_cc_files.sh は heavy の中で動かす） |
| `gen/gen_misc.py` | PN・PV・SOI・Bundler・Salome・SinusX・古い BIN（v1）。正解は CloudCompare 2.11.3 のソース（qAdditionalIO）の読み方 |
| `gen/gen_cap.py` | 点数の上限（5 万点を 1 万点などで開く。偏りも見る） |
| `gen/gen_traj.py` | 軌跡（TUM・CSV・4 列・KITTI・FAST-LIO の pos_log・ns の時刻・UTM・MCAP（無圧縮・チャンクなし・zstd・lz4、Odometry/PoseStamped/PoseWithCovarianceStamped、2 万姿勢））。MCAP は pip の mcap（`../pylib`） |
| `gen/gen_samples.py` | 同梱のサンプル（sample/formats）の点数と平均・最小・最大 |
| `node_check.mjs` | Node で src/io を直接動かし、座標（シフトを足し戻した double）・色・欄を JSON に書く |
| `bcheck.js` | Chromium（dist/index.html）で 1 件ずつ開き、S.files から座標・色・欄（worker に問い合わせ）・知らせの移り変わりを JSON に書く。cap は capSel に試験用の選択肢を足す |
| `compare.py` | 正解と比べる（最近傍で対応づけ。許容誤差は float32 の丸め。1 mm の判定、色・欄・点数・間引きの偏り・線の上の点） |
| `bscenario.js` + `scen_check.py` | 場面: 同じファイル 2 回、違う形式を同時に、ローカル↔UTM の順、閉じたあと、UTM の点群 + 軌跡、軌跡を「開く」から、ドラッグ＆ドロップ、高さの大きい点群のあと、エラーの続き、HTML の欄の名前、BIN + OBJ、拡張子なし、少ない点の知らせ |
| `bartifact.js` + `art_check.py` | 試作ページ: 最初に開く廊下の地図のあとに、サンプル（.las など）を開いたときの精度 |
| `cc_oracle.sh` + `cc_oracle.list` + `cc_compare.py` | CloudCompare に同じファイルを読ませて ASC に書き出し、アプリの読み方と比べる（参考） |
| `electron_seq.js` | アプリ（Electron）でファイルを順に開いて様子を記録（A01-001 の確認） |

## はまりどころ
- pye57 の `SourceDestBuffer` は numpy の int64（形式 `l`）を 4 バイトとして読む不具合がある → Integer の項目は float64 の配列で渡して変換させる。列の切り出し（`C[:, k]`）も連続した配列にしてから渡す
- PCL 1.14 の `pcl_convert_pcd_ascii_binary` は ascii を 7 桁でしか書かない（F8 の UTM 座標でも `538998.3`）。ascii の正解は PCL が書いた文字から作る（gen_pcd.py の `parse_pcd_ascii`）。また ascii の rgb は TYPE U の整数で書く
- Debian の CloudCompare 2.11.3 には qAdditionalIO（PN/PV/SOI/OUT/POLY/SX）と PCL・E57・LAS のプラグインがない。CloudCompare の読み方の正解は、同じ版のソース（https://raw.githubusercontent.com/CloudCompare/CloudCompare/v2.11.3/...）で確かめた
- CloudCompare の `-SAVE_CLOUDS` は入力と同じ名前で書くので、入力が .asc のときは .txt にして読ませる（cc_oracle.sh）
- 5,000 点の点群は、自動の水平補正が必ず失敗し、最後の知らせが「水平補正できませんでした…」（赤）になる。読み込みの知らせは bcheck.js の「知らせの移り変わり」で見る
- 1 件の試験で画面に例外が出ると、以後の読み込みが止まる（A01-001）。bcheck.js は例外のあとページを開き直す
- 他の担当の bigmem が動いている間は light も heavy も始まらない（待ちは正常）。長い待ちを見込んで run.sh は段階ごとに見張りを取り直す

## 実機で次回確かめること
- A01-001（高さの幅が大きい点群で止まる）を Windows / mac のアプリ版で（V8 の引数の上限は OS・スタックの大きさで少し違う）
- 実験室の FAST-LIO の地図（scans.pcd、PointXYZINormal）と rosbag2（Jazzy の既定 = mcap・チャンクあり・無圧縮）の /Odometry を開いて、点群と軌跡が重なるか
- Livox MID-360 の生データを PCD に保存したもの（timestamp の欄）で、時刻の色分けが段々にならないか（A01-008）
- UTM・平面直角座標の地図（GNSS 付きの計測）と FAST-LIO のローカル地図を同時に開く運用があるか（A01-002）
