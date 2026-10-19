# LiDAR Viewer 総合試験 — 共通の決まりと道具

このフォルダ（以下 `$T`）は、LiDAR Viewer の総合試験のための共通の場所です。
`T=/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv`

**今回は「見つけて報告する」だけです。アプリのコードは直しません。** 直し方の案は報告に書いてください。

---

## 1. 絶対に守ること

1. **元のプロジェクトを書き換えない。** `/home/claude/pcd-viewer` と `/home/claude/samples` は読み取り専用でマウントしてあります（書けません）。
   改造・計測用の版が必要なら `$T/bin/mkcopy $W/proj` で自分用に写し、写しの中で `node build.mjs` などをしてください。
2. **electron-builder（配布物の作成）は実行しない。** 配布物は `/home/claude/pcd-viewer/release/` にできています（読むだけ）。
3. **試験の実行は必ず見張り付きの入口から。** 同時に動かせる数と、メモリ・時間の上限を守るためです（このマシンは 2 CPU・メモリ 7 GB しかありません）。
   - `$T/bin/light <コマンド>` … Node の単体試験・ファジング・小さな Python など。同時 3 つ・既定 800 MB・300 秒
   - `$T/bin/heavy <コマンド>` … Chromium / Electron / CloudCompare / xvfb-run を使うもの。同時 2 つ・既定 1600 MB・900 秒
   - `$T/bin/bigmem <コマンド>` … 大きなファイル・性能・メモリの試験。ほかを止めて独占・既定 5000 MB・1800 秒（必要なときだけ）
   - 上限を変える: `MEM=1200 TIMEOUT=900 $T/bin/light node x.mjs`。上限は「その実行と子孫プロセスの合計」です
   - 上限を超えると止められ、`[guard:…] 止めました: メモリ上限…`（終了コード 137）/`時間切れ`（124）と出ます。
     **小さな入力でメモリ上限を超えたなら、それ自体がバグ（解凍爆弾・過大確保）の可能性があります。** 大きな入力で超えたなら上限を上げて再試験。
   - 待ち時間が出ることがあります（ほかの担当も使っているため）。待ちは正常です。
4. **ほかの人のプロセスを止めない。** `pkill -f` `killall` は使わない（自分のシェルやほかの担当の試験まで止めます）。止めるのは自分が起動して PID を控えたものだけ。
   バックグラウンドで動かすもの（にせ LiDAR・http サーバーなど）は、試験本体と同じスクリプトの中で起動して最後に止める形にし、全体を `light`/`heavy` に渡してください（見張りが最後に子孫を片付けます）。
5. **自分専用の場所だけを使う。** `W=$T/work/<自分のID>`（例 `$T/work/A05`）。ファイル・スクリプト・写真はすべてここへ。合計 1 GB 程度まで（A09 は 8 GB まで、使い終わった大きなファイルは消す）。
   `/tmp` に書くものも `$W/tmp` に寄せてください（`TMPDIR=$W/tmp`）。
6. **Electron を起動するときは設定の置き場所を必ず自分専用に。** `PCDV_USERDATA=$W/ud-<何か>`。同じ置き場所で 2 つ起動すると、2 つ目は「二重起動」として即終了します（アプリの仕様）。
7. **画面（X）を使うときは** `xvfb-run -a -n <自分の番号×10+100>`（例 A05 → `-n 150`、A14 → `-n 240`）。番号がぶつからないようにするためです。Chromium の Playwright は X なしで動きます。Electron は X が必要です。
8. **ネットワーク名前空間（netns）**: ポートを使う試験は、自分の netns の中で動かしてください。普通の名前空間で動かすと、ほかの担当とポートがぶつかります。
   - `$T/bin/mknet <自分の小文字ID> <番号> [台数]` → 同じスイッチにつながった netns を台数分つくる（`a07` `107` → `a071`(10.107.0.1) `a072`(10.107.0.2) …）。番号は「100 + 自分の番号」を使う
   - 中で動かす: `$T/bin/heavy ip netns exec a072 xvfb-run -a -n 170 node 試験.js`
   - 片付け: `$T/bin/rmnet a07 3`（終わったら必ず）
   - http サーバーなどを普通の名前空間で立てるときのポートは `8700 + 自分の番号×10` から 10 個（例 A13 → 8830〜8839）
9. **パッケージの追加は自分の場所へ。** `npm install --prefix $W/tools <名前>`、`pip install --break-system-packages --target $W/pylib <名前>`（`PYTHONPATH=$W/pylib`）。全体の環境は変えない。
10. **報告は日本語で、実際に再現したものを中心に。** 推測だけのものは「確度: コード上の推定」と書く。試験環境のせい（SwiftShader の遅さ、xvfb、Node で wasm が動かない等）とアプリのバグを区別する。

---

## 2. 対象のアプリ（LiDAR Viewer 0.3.0）

卒業研究のロボット（i-Cart mini ＋ Livox MID-360 ＋ Raspberry Pi 5 ＋ ROS2 Jazzy ＋ FAST-LIO）で作った点群地図や、LiDAR の生データを見るための
**デスクトップ点群ビューア**（CloudCompare の置き換え）。Windows / Linux（x64・arm64）/ macOS 向けに配布。画面はすべて日本語。
同じ中身を 1 つの HTML にした「試作ページ」（claude.ai のアーティファクト。サンプルファイル入り）もあります。

### 構成（`/home/claude/pcd-viewer`）
| ファイル | 役割 |
|---|---|
| `main.js` | Electron の主プロセス。窓の作成、OS から渡されたファイルを開く・画像の保存（`app:capture`）、二重起動の防止、`PCDV_USERDATA` |
| `preload.js` | 画面に `window.pcdApp`（OS から渡されたファイル・画像の保存）を渡す。contextIsolation・sandbox 有効 |
| `src/index.html` `src/styles.css` | 画面。CSP あり（`'unsafe-eval'` は STEP の展開部品が eval を使うため） |
| `src/app.js` | 画面の処理（three.js）。ファイルの読み込み順番待ち、カード（ポップ）の重ね、色、計測、座標、水平補正、天井を隠す、軌跡、試作ページの扱い など |
| `src/worker.js` | 別スレッド。読み込み・間引き・統計・選択用の索引・水平補正の解析・軌跡 |
| `src/io/index.js` | 拡張子 → 読み方の対応表（READERS）。メーカー専用形式（RIEGL など）は理由付きで断る |
| `src/io/util.js` | `Src`（ファイルを少しずつ読む）・行の切り出し・XML など |
| `src/io/sink.js` | `Sink`（点の入れ物。上限を超えたら Algorithm L の貯水池抽出で間引く／大きな座標はグローバルシフト）、`addMesh`（面の上に点を散らす）、`addLines` |
| `src/io/formats/*.js` | 形式ごとの読み方（PCD・LAS/LAZ・E57・PLY・PTX・ASCII 系・SBF・CloudCompare BIN・PN/PV/SOI/OUT/POLY/SX・OBJ/STL/OFF/VTK/glTF・DXF/SHP/PDMS・Draco/IFC/STEP（wasm）・PhotoScan PSZ・画像/GeoTIFF） |
| `src/pcd.js` | PCD の頭書きと LZF 展開 |
| `src/trajectory.js` | 軌跡（.mcap / .txt / .csv / .tum） |
| `src/samples.js` | 試作ページのサンプル一覧 |
| `build.mjs` | `node build.mjs` → `dist/`（アプリ用）、`node build.mjs artifact` → `dist-artifact/pcd-viewer.html`（試作ページ、約 14.5 MB） |
| `release/` | 配布物（exe・AppImage・deb の x64/arm64・mac の zip。mac は ad-hoc 署名済み）と展開済みの中身（`linux-unpacked` など） |

### 動作確認用の窓口（画面の中）
`window.__pcd = { S, enqueue, setView, pickAt, call, world, renderer, cam, controlsTarget(), updateLive }`
- `S.files[]`（`name n total positions(Float32, offset を引いた値) header{data, fields} hasRgb …`）、`S.offset`（グローバルシフト）、`S.measures`、`S.tools`、`S.levelInfo`、`S.ceilZ` など
- 主な要素: `#fileInput`（ファイル選択）`#trajInput`（軌跡）`#statMsg`（右上の知らせ。誤りは赤）`#progress`（読み込み中の表示）`#fileList [data-act=remove]`（閉じる）`#capSel`（点数の上限: 1,000 万〜10 億）

### ユーザーがこれまでに求めた仕様（確認の観点）
- 座標を示す球（選んだ点の印）は、カメラを動かしても・ほかと重なっても**常に見える**こと
- 「座標」と「距離」のボタンは**同時に押せない**こと
- 左上に出るカード（色・表示・距離 など）は、後から開いたものが**重なるように順に並ぶ**。数の上限なし。**どのカードもボタンでいつでも閉じられ**、途中のカードが消えたら残りが**詰めて移動**する。1 つ閉じたらほかが消える、ということがない
- 点数の上限は**最大 10 億点**まで選べる
- CloudCompare で開ける形式をできるだけ開ける。試作ページには**形式ごとのサンプル**が入っている
- ファイルを開く画面では、形式の種類が**縦に 1 つずつ**並ぶ（拡張子が横に羅列されない）
- ファイルを閉じたあとに、的外れな知らせ（例: 「RGB の色を持つファイルがないので…」）が出ないこと
- マウスを乗せて止めたときに出る**説明の吹き出し（title など）は一切出さない**
- スクロールバーとつまみ（スライダー）は、画面に合わせたデザイン（カプセル形のスクロールバー、2 本の溝のスライダー）
- アプリ名は「LiDAR Viewer」、アイコンは「Tsubu」（粒）。旧名は PCD Viewer（名残の表記が残っていないか）

### サンプルと期待値
- `/home/claude/pcd-viewer/sample/formats/`（82 ファイル）: ほとんどが**同じ廊下の点群 5,000 点**を各形式で書いたもの。
  期待値 `/home/claude/samples/out_expected.json`: n=5000, mean≈[14.7463, 4.8036, 0.3985], min≈[-11.5167,-6.2480,-5.3942], max≈[86.2494,29.0875,3.1325], 一部は UTM 風の大きな座標（+[539000, 3836000, 30]）。
  メッシュ・CAD は面の上に点を散らす（既定 100 万点）ので点数は一致しない。画像は画素が点になる。
- 作り方: `/home/claude/samples/`（`make_src.py` `gen_clouds.sh` `gen_py1.py` `gen_py2.py` `gen_py3.py` `gen_mesh.py`）。CloudCompare で書いた元: `/home/claude/samples/cc/`
- `/home/claude/pcd-viewer/sample/map.json` `map.laz` `trajectory.txt`: 廊下の地図（約 100 万点）と軌跡

### 使える道具
- Node 22、Playwright（全体に入っている。`require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')`）、Chromium `/opt/pw-browsers/chromium`
- Electron 34.5.8: `/home/claude/pcd-viewer/node_modules/electron/dist/electron --no-sandbox <アプリのフォルダ>/main.js`（X が必要）
- CloudCompare（比較の正解として使える）: `QT_QPA_PLATFORM=offscreen xvfb-run -a -n <番号> CloudCompare -SILENT -NO_TIMESTAMP -O <入力> -C_EXPORT_FMT ASC -SAVE_CLOUDS`（出力は入力と同じフォルダに書くので、入力は自分の場所に写してから）
- Python: numpy, laspy(+lazrs), pye57, plyfile, trimesh, ezdxf, pyshp(shapefile), ifcopenshell, gmsh, DracoPy, tifffile, Pillow, scipy, pandas, imageio
- `$T/harness/read.mjs` … Node で読み込み部品を直接動かす: `$T/bin/light node --no-warnings $T/harness/read.mjs <ファイル> [付属ファイル…] [--cap=N]` → JSON
  （**LAZ・Draco・IFC・PNG/JPG などの画像は Node では動きません**（wasm の作り・createImageBitmap のため）。それらは次のブラウザ版で）
- `$T/harness/browser_read.js` … Chromium で `dist/index.html` を開いてファイルを開かせる（本番と同じ道筋）: `$T/bin/heavy node $T/harness/browser_read.js a.pcd -- b.shp b.dbf -- c.laz` → 1 組 1 行の JSON。環境変数 `PAGE`（写しの dist を試す）`CAP` `SHOT` `WAIT`
- `$T/harness/electron_app.js` … Electron でアプリを動かす雛形: `cd $W && $T/bin/heavy xvfb-run -a -n <番号> node $T/harness/electron_app.js [ファイル…]`（`APPDIR` `USERDATA`）
- 以前の確認用スクリプト（古いものもある。参考に）: `/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/shot/*.js`（`fmt_test.js` `el_pkg.js` `sec_test.js` `meas_test.js` `ceil.js` など）、`…/scratchpad/ccbin/`（BIN の試験）、`…/scratchpad/nodetest/`
- Web 検索も可（Electron のセキュリティ指針 など、仕様の確認に）

---

## 3. 報告の書き方

`$T/reports/<自分のID>.md` に書く（途中経過も随時書き足してよい。最後に完成させる）。

```
# <ID> <担当名> 報告

## まとめ
- 試験した範囲・使った試験技法（例: 同値分割・境界値分析・状態遷移・デシジョンテーブル・ファジング・命令/分岐網羅・静的解析・脅威分析・負荷/耐久 など）
- 見つけた数: 致命 x / 重大 x / 中 x / 軽微 x / 情報 x
- 問題なかったこと（確認できて OK だった項目の一覧も必ず書く）

## 見つけた問題
### <ID>-001 [重大度] 一行の題名
- 種類: バグ / 意図しない挙動 / セキュリティ / 性能 / 使い勝手 / 文言 / 配布物
- 対象: アプリ版 / 試作ページ / 両方（OS に依存するならその OS）
- 再現手順:（具体的に。入力ファイルはパスを書く）
- 期待される結果:
- 実際の結果:（知らせの文言・エラー・数値をそのまま）
- 証拠: ログ・写真・出力のパス
- 場所: ファイル:行
- 原因の見立て:
- 直し方の案:（短く。直すかどうかはユーザーが決める）
- 確度: 再現済み / コード上の推定
- 再現スクリプト: パス

## 試験の資産（次回の再試験のために）
- 再実行できるスクリプトの一覧と使い方（`$W/regress/` にまとめ、`$W/regress/run.sh` 1 本で全部流れるのが理想）
- 生成した試験用ファイルとその作り方
- 環境のはまりどころ・コツ
- 実機（Windows/mac・Raspberry Pi の実機）で次回確かめるべきこと
```

重大度:
- **致命**: よくある使い方で、アプリが落ちる・固まる・点群が黙って間違う（座標・点数・色の誤り）、またはネットワークから悪用できる穴
- **重大**: 主な機能が一般的な入力で動かない／誤る、条件付きで悪用できる
- **中**: まれな条件での誤動作、分かりにくい・誤った知らせ、リーク、性能の大きな落ち込み
- **軽微**: 見た目・文言・小さな不便
- **情報**: バグではない改善の提案・仕様として確認したいこと

担当の範囲の外で見つけたものも、`（担当外）` と付けて報告してください（重複はまとめ役が整理します）。
最後の返事（まとめ役への返答）は短く: 件数と、重大度の高い順の題名一覧、報告ファイルのパス。
