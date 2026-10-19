# L ライブ機能の削除（2026-10-19）

利用者の判断: ライブ（LiDAR の直接受信・ほかの PC への配信・デモ）はもう使わないので、関連するコードをすべて消す。
同時に K がセキュリティの修正をしている（mesh.js・app.js の rasterizeSVG／readWithThree・main.js の権限／WebRTC／窓の設定・CSP・fuses）。そこには触れていない。

## 消したもの
- ファイル: `live.js`、`tools/fake_mid360.js`（空になった `tools/` も）
- `main.js`: `require('./live.js')`、`live`／`liveWin`／`setupLive`、`live:*` の IPC ハンドラ、画面が落ちたときの `live.stopAll()` と `wasLive` の文、`window-all-closed` の `live.close()`、ライブのためだけの `will-quit`（LiDAR の送り先を戻すまで待つ処理・`quitting`）。
  残り: `window-all-closed` → `app.quit()`、SIGINT/SIGTERM → `app.quit()`、二重起動、`render-process-gone`（知らせ→読み込み直す／終了）、`app:capture`・`app:ready`・`open-file` はそのまま
- `preload.js`: `window.pcdLive` を出す部分すべて（`pcdApp` は残す）
- `src/app.js`: 「ライブ」の見出しから「描画」の前まで（LV・点の入れ物と描画・色・知らせ・一覧・LiDAR／配信への接続・止める／一時停止・配信・「今の点群を開く」・デモ・`LIVE_ENABLED`）。
  ほかの場所の分岐: `afterRemove`／`removeTraj` の `|| !!LV.src`、`pickAt` の `liveHides`、描画の繰り返しの `liveExpire`、`POP_TITLES` の `live` を消し、普段の動きに一本化
- `src/index.html`: `data-pop="live"` の section 一式（`liveNotApp` など）、ドックの「ライブ」ボタン（`data-open="live"`）
- `src/styles.css`: ライブ専用の規則（`.livesec` `.livelist` `.livestat` `.livecode` `#liveShareBox` `#liveWarn` など。`.hint.warn` `.code` もライブでしか使っていなかったので一緒に）
- `package.json`: build.files の `live.js`、dependencies の `ws`（ライブだけが使っていた）。`package-lock.json` からも `ws` を外した（node_modules の中の ws はそのまま。配布物には入らなくなる）。mac の `NSLocalNetworkUsageDescription` は元から無かった。build.mjs・README・docs・src/samples.js にライブの記述は無かった
- 試験（ライブだけを試すもの）: `tests/suites/A07/` 全部、A05 `t13_live_demo.js`、A06 `live_msgs.js` `fake_peer.js` `electron_batch3.sh`（live_msgs だけを流すもの）、A08 `poc/net/` `poc/poc_a_pcv1_crash.js` `poc/poc_d_ipc_args.mjs`（live.js を直接読む PoC）、A10 `live_lifecycle.js/.sh`、A11 `data/p11live/` `data/p14/s_livepick.js`、A12 `regress/live/`、A14 `regress/live/`
- 試験の中のライブの部分（残りが動くように）: 各 run.sh・tasks の参照、A04 の `stripIpc`／`LIVE_LUT` の取り出しと試験、A05 e01（EL13・EL14 を削除、EL1 は `pcdApp` を見る）・t01 のドック一覧、A06 のカード一覧・messages のデモ・tooltip_app のライブの状態・summarize の live_msgs、A10 heavy_all／run／summarize_runtime の live の部分・asar_check の必要なファイル、A12 eslint／tsc の対象、A13 t_iframe の 5)、A14 c6 の e)・c8 のデモ・run.sh の live、`tests/env/README.md`・`tests/env/harness/electron_app.js`・`tests/TESTING.md` のライブの記述

## 残したもの（ライブとは別のもの・記録）
- 距離の途中表示 `updateLive` `#mLive`（`window.__pcd.updateLive` も。A05 t05・A11 s_measure などが使う）。名前に live を含むが、測定中の線のこと
- `aria-live`、`alive`、「ライブラリ」、`olive`（色名）、A09 perf_load の `--live`（途中経過の記録）
- MID-360 の名前: worker.js の水平補正の説明、A14 の模擬走査（world.py）、A01／A06 の試験データ名、env/README のロボットの説明（地図を作るセンサーとして）
- 記録: tests/reports*・BUGS.md・fixlog、A10 の報告の下書き（`A10_draft_*.md` `report_rpi_manual.md` `run/`）、A14 の `notes/`、A05 `asar/linux/`（旧版の配布物から取り出した写し。どこからも使われていない）

## 確かめたこと
- grep `live|ライブ|mid-?360|pcdLive`: node_modules・tests/reports*・BUGS.md・fixlog 以外は上の「残したもの」だけ
- 写し `$T/work/L/proj` で `node build.mjs` が通る。`node --check main.js preload.js` も通る
- Chromium（Playwright）で dist/index.html: sample/map.laz が 361,575 点で開く、ドックのカード 5 つ（ファイル・表示・色・断面・補正）と座標・距離が開く、点を選べる、ファイルを閉じると空の表示に戻る、`[data-open="live"]` などは 0 個、`window.pcdLive` なし、pageerror 0
- Electron（xvfb-run -n 610、PCDV_USERDATA は `$T/work/L/ud/*`）: 起動して窓の名前 LiDAR Viewer・`pcdApp` あり・`pcdLive` なし・`live:*` の IPC なし・`app:capture` あり。窓を閉じると 0.1 秒で終了コード 0。同じ置き場所の 2 つ目はすぐ終了コード 0。SIGTERM で 0.05 秒で終了コード 0、子プロセスは残らない。pageerror 0
- A04 の app.js の単体試験（`--only "t_app|OK-AP|AP0"`）: 削除前（HEAD）と同じ結果（PASS 7・FAIL 2・ERROR 7。失敗は以前からのもので、今回の変更とは関係なし）
