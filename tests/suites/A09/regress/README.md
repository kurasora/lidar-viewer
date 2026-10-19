# A09 性能・メモリ・負荷 — 再試験の道具

この試験環境では `bash run.sh`（全部・2〜3 時間）か `bash run.sh quick`（約 15 分）。結果は `../out/*.jsonl` と `../out/summary.md`。
実機（Windows の PC・Raspberry Pi 5）では下の「実機で測る」の手順で、同じスクリプトを Electron version（配布物）に対して流す。

## スクリプト

| ファイル | 内容 |
|---|---|
| `lib.js` | 共通部品。Chromium（dist/index.html）か Electron（main.js か配布物の実行ファイル）を起動し、ページに計測の仕掛け（別スレッドとのやりとりの時刻・進み具合・長いタスク・フレーム）を入れる。プロセスごとのメモリ（Linux は /proc の RSS/PSS、それ以外は `app.getAppMetrics()`）、CDP で画面と別スレッドの JS ヒープ（ArrayBuffer を含む）・GC |
| `perf_load.js` | 1 ファイルを開いて、時間（読み取り・表示・点の間隔・水平補正）・速さ・最大メモリ・閉じたあと・進み具合の停止・長いタスクを 1 行の JSON に。`--electron` `--cap=N` `--close` `--stats`（座標の統計と x のヒストグラム）`--level=0`（自動の水平補正を切る）`--live=ファイル`（途中経過） |
| `many_files.js` | 多数のファイルを一度に開く・全部閉じる（A09-001） |
| `scenarios.js` | 繰り返し: `reopen`（開く/閉じる k 回）`color`（色の切り替え）`measure`（距離を引いて消す）`cmap` `level` `pick` |
| `lod.js` | 操作ごとに描いた点数と 1 回の描画時間（A09-005） |
| `during_load.js` | 読み込み中の操作（回す・色・上限・閉じる・開く） |
| `during_queue.js` | 3 つ同時に選んだときの順番待ち（A09-007） |
| `close_during_level.js` | 水平補正の計算中に閉じる（A09-004） |
| `oom_inject.js` | メモリ不足の故障注入（画面・GPU のプロセスの RLIMIT_DATA を絞る／`--kill` で画面のプロセスを落とす。Linux のみ）（A09-011） |
| `retain.js` | 閉じたあとに残る大きな ArrayBuffer の保持経路（ヒープスナップショット）（A09-013） |
| `probe_render.js` | 閉じたあとに描き直しが起きているか |
| `field_close.js` | 色のモードごとに、最後のファイルを閉じたあとの知らせ（A09-006） |
| `prof_load.js` | 画面と別スレッドの CPU プロファイル（関数ごとの自分の時間） |
| `startup.js` | 起動の速さ・何も開いていないときのメモリ・GPU の状態（`getGPUFeatureStatus`・WebGL の描画器の名前） |
| `sim_bounds.mjs` | updateBounds と同じ計算をファイル数ごとに（A09-001） |
| `sim_reservoir.mjs` / `.sh` | アプリの Sink に N 点流して間引きの偏りを見る（A09-012） |
| `gen_big.py` | 大きな点群を作る（`--kind corridor`＝廊下の地図を n 点に増やす、`sparse`＝15 km 四方の疎な地形、`sweep`＝点の順に x が進む）。形式 pcd_bin / pcd_ascii / las / laz / ply / xyz / e57 |
| `pcdbc.c` | PCD binary → binary_compressed（PCL と同じ LZF）。`gcc -O2 -o pcdbc pcdbc.c` |
| `gen_frames.py` | 2 万点の PCD を 200 個（LiDAR の 1 フレームごとのファイル） |
| `gen_hint.py` / `gen_fakehdr.py` | 点数の見込みが外れる文字の点群／頭書きの点数が多すぎる LAS |
| `summarize.py` / `table_report.py` | jsonl → 表（Markdown） |
| `console_probe.js` | Node なしで測る: アプリの画面で F12 → Console に貼る。開いたファイルごとに時間と JS ヒープを表で出す |
| `batch1.sh`〜`batch6.sh` | この環境でまとめて流す単位（bigmem で） |

## この環境でのはまりどころ
- `TMPDIR` を `$W/tmp` の長いパスにすると Chromium が起動しない（一時ソケットのパスが長すぎる → SIGTRAP）。`/tmp/a09t → $W/tmp` の記号リンクを使う（run.sh が作る）
- 画面のプロセスが落ちると `page.evaluate` が返らないことがある → lib.js は 'crash' の印と 60 秒の時間切れで抜ける
- `requestAnimationFrame` の引数はフレームの始まりの時刻。「表示された時刻」は `performance.now()` で記録する
- Electron（xvfb）はこの環境では WebGL がソフトウェア描画＋読み戻しになり、描くたびに画面のメインスレッドが止まる（A09-010）。描画の速さは Chromium（headless）で比べる
- guard のメモリは子孫の RSS の合計（共有メモリを二重に数える）。PSS の合計はそれより 10〜20% 小さい
- heavy は混む。測定は bigmem で数本ずつまとめる

## 実機で測る（Windows の PC・Raspberry Pi 5）
1. 準備
   - Node 18 以上と Playwright: `npm i playwright@1.56`（ブラウザの取得は不要: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`）。このフォルダを丸ごと写す
   - Python 3 と `pip install numpy laspy lazrs pye57`（pye57 が入らなければ E57 は省く）
   - アプリ: Windows は `release/win-unpacked/LiDAR Viewer.exe`、Raspberry Pi 5 は `release/linux-arm64-unpacked/lidar-viewer`
2. ファイルを作る（例: 1,000 万・3,000 万点。ディスクは各 2〜5 GB）
   - `python3 gen_big.py --n 10000000 --out data/10M --formats pcd_bin,las,laz,ply,e57 --name c10M`
   - `python3 gen_big.py --n 30000000 --out data/30M --formats pcd_bin,las,laz --name c30M`
   - 多数のファイル: `python3 gen_frames.py --count 100 --n 20000 --out data/frames`
3. 測る（1 行ずつ。結果は out.jsonl に追記）
   - Windows（PowerShell）: `$env:ELECTRON="C:\...\win-unpacked\LiDAR Viewer.exe"; node perf_load.js --electron --close --out=out.jsonl data\10M\c10M.las`
   - Raspberry Pi 5: `ELECTRON=~/release/linux-arm64-unpacked/lidar-viewer node perf_load.js --electron --close --out=out.jsonl data/10M/c10M.las`
   - 同じく `startup.js --electron --k=3`、`lod.js --electron data/10M/c10M.las`（実機の GPU での描画時間）、`many_files.js --electron data/frames 50`、`scenarios.js reopen --electron --k=10 data/10M/c10M_bin.pcd`、`close_during_level.js --electron data/2M/... data/small/...`
   - 上限 1 億: `perf_load.js --electron --cap=100000000 --close data/30M/c30M.las`（メモリの足りない機械では、どう落ちるか・知らせが出るかを見る。Windows のタスク マネージャーで「コミット済み」も見る）
   - Windows ではメモリは `app.getAppMetrics()`（workingSetSize と privateBytes）で取る（lib.js が自動で切り替える）。PSS の欄には privateBytes が入る
4. 表にする: `python3 table_report.py out.jsonl`、`python3 summarize.py out.jsonl`
5. Node を入れられないとき: アプリで F12 → Console に `console_probe.js` の中身を貼り、ファイルを開くと 1 ファイルごとの時間が表で出る（`copy(JSON.stringify(window.__a09.rows))` でコピー）

## 実機で特に確かめること
- `startup.js` の `gpuFeatureStatus.webgl` が `enabled`（ハードウェア）か。`unavailable_software` なら A09-010 と同じく非常に遅い（Raspberry Pi 5 は要確認）
- `lod.js`: 1,000 万・3,000 万点の 1 回の描画時間（全点・15%）。ホイールのズームが滑らかか（A09-005）
- 3,000 万点の LAS（既定の上限）が 8 GB の PC・4 GB/8 GB の Raspberry Pi 5 で開けるか。足りないときの知らせ（A09-011）
- Windows でページファイルを小さくした状態で上限 1 億 → 「メモリが足りません」が出るか、落ちるか
