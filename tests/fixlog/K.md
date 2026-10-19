# K 修正記録（第 4 回: セキュリティ精査 S1〜S4 のうち、ライブ以外）

ライブに関するもの（S1-001・S1-006・S4-001・S4-002 など）は担当 L の削除で解消するので触っていない。
確かめ方の道具は $T/work/K（T = 試験環境）:
- `mkgltf.mjs` … 正しい glTF（複製 3 個・bufferView のない sparse・交互配置）と、複製 1,000,001 個の glb を作る
- `scripts/el_k.js` … 開発版の Electron（xvfb `-n 620`、PCDV_USERDATA は $T/work/K/ud-*）で、画面のスクリプトの立場から file:// の読み取り・共有フォルダ・WebRTC・権限・capture の範囲・eval を調べ、サンプル 18 組を開き、SVGZ の解凍爆弾、画像の保存、localStorage、終了までを見る。`QUICK=1 APP=<写し>` で前の版との比較（$T/work/S3/proj = 修正前）
- `scripts/el_pkg.js` … 同じことを製品版（`electron-builder --linux dir`）で。fuse で `--inspect` が効かないので `--remote-debugging-port` と CDP で画面だけを操作し、保存は Browser.setDownloadBehavior、終了は SIGTERM
- `scripts/argv_open.js` … 製品版にファイルを渡して起動（関連付けと同じ経路）して開けるか
- `fz/t2.sh` … 製品版で NODE_OPTIONS・`--inspect`・resources/app の差し替えが効かないこと
- 結果: `out_dev.json`・`out_pkg.json`・`out_base.json`（修正前）・`out_art.json`（試作ページ）

## 直したもの

- **S2-001（致命）glTF の複製数**: `src/io/formats/mesh.js`
  - accessor の数の上限を、宣言ではなく実際のバッファの長さで掛ける。データのある accessor は「バッファに入る数（1 要素の大きさ = 要素数 nc × 型の大きさ と 間隔 の大きい方）」まで。データのない（0 か sparse だけの）accessor は 3,000 万個まで、かつ 要素数×nc がバッファ全体のバイト数（最低 160 万）まで（S2-003 も同じ修正）
  - EXT_mesh_gpu_instancing の複製数は 100 万まで（超えたら「glTF の複製（EXT_mesh_gpu_instancing）が多すぎます（… 個。1,000,000 個まで）」）。行列は先に全部作らず 1 つずつ作る
  - 確認: `gltf_instancing_bomb.gltf`・`gltf_accessor_nc_bomb.gltf` とも「glTF の要素の数（50,000,000）がファイルの大きさに合いません…」ですぐ断る（前は 1.7 GB 超）。複製 1,000,001 個の glb は上の文で断る。正しい glTF（複製 3 個・sparse だけ・交互配置）、sample の trimesh_mesh.glb/.gltf、glTF+bin は今までどおり開ける
- **S2-002（重大）SVGZ の解凍爆弾**: `src/app.js` rasterizeSVG
  - ブラウザの DecompressionStream は渡した分を一度に全部展開する（読む側で止めても間に合わない。最初の版では Electron で 1.6 GB を超えた）ので使わず、fflate の Gunzip に 16 KB ずつ渡して展開後の大きさを数え、100 MB を超えたら「この SVGZ は展開すると大きすぎるため開けません（展開後 100 MB まで）」で止める
  - 確認: svgz_bomb.svgz（1.2 MB → 1.2 GB）は 1.6〜1.9 秒で上の文になり、窓は落ちない。普通の .svgz・壊れた .svgz（「SVGZ を展開できませんでした…」）は今までどおり
- **S3-001（重大）・S3-003 DAE・FBX の模様の画像**: `src/app.js` readWithThree の URL の差し替え
  - 一緒に選んだファイルの中にない参照は、ファイルに書かれた場所（file://・共有フォルダ・http・絶対パス）へ行かず、1 画素の空の画像（data:）にする。部品が中で作る blob:・data: はそのまま（模様は点群の色には使っていないので見た目は同じ）
  - 確認: tex_beacon.dae / .fbx を開いても、主プロセスの記録に file:///etc/hostname・file://127.0.0.1/share/… の要求が 1 件も出ない（修正前は `completed 200 file:///etc/hostname` ほか 5 件）。試作ページ（http で配信）でもサーバへの要求 0 件（修正前は 4 件）
- **S1-002（重大）・S4-004 Electron の fuse**: `package.json` の `build.electronFuses`
  - RunAsNode・EnableNodeOptionsEnvironmentVariable・EnableNodeCliInspectArguments を無効、EnableEmbeddedAsarIntegrityValidation・OnlyLoadAppFromAsar を有効
  - **GrantFileProtocolExtraPrivileges は有効のまま**: 無効にすると app.asar の中の dist/index.html を file:// で読めず、窓が空になる（ERR_FILE_NOT_FOUND。1 つずつ切り替えて確認）。file:// の読み取りは下の S3-004 の webRequest で止める
  - EnableCookieEncryption は入れていない（Linux で鍵束の確認が出ることがあり、このアプリは cookie を使わない）
  - 確認（写しの `--dir` 版）: `@electron/fuses read` で linux・win・mac(arm64) とも上の値。linux 版で `ELECTRON_RUN_AS_NODE=1` は Node として動かず、`NODE_OPTIONS=--require` は読まれず、`--inspect=9333` は待ち受けず、app.asar を外して resources/app/ を置いても読まれない。製品版で起動・ファイルを開く・保存・終了・コマンドラインで渡したファイルを開く、が通る
  - win: electron-builder が exe に ASAR の整合性の値を書き込む（「updating asar integrity executable resource」）。Windows の実機での起動は未確認
  - mac: Info.plist の ElectronAsarIntegrity の値と app.asar のヘッダーの SHA256 が一致することを確認。**Linux で作ると electron-builder は mac の署名を飛ばす**（「skipped macOS application code signing」）。fuse を書き換えると Electron の本体の署名が合わなくなるので、前回（release/sign.log）と同じく rcodesign の ad-hoc 署名を**作ったあとに必ず**かける（写しで `rcodesign sign` が通ることは確認。rcodesign verify は前の版でも同じ「CMS error」を出すので判断に使えない）。mac の実機での起動は未確認。もし mac だけ起動しなくなったら、mac 用は enableEmbeddedAsarIntegrityValidation を外して作る（electronFuses は全 OS 共通の設定なので、そのときは mac だけ `-c.electronFuses.enableEmbeddedAsarIntegrityValidation=false` を付けて作る）
- **S1-003（中）WebRTC**: `main.js` で `setWebRTCIPHandlingPolicy('disable_non_proxied_udp')`
  - 確認: 画面から RTCPeerConnection（stun:127.0.0.1）を作っても候補 0・STUN のパケット 0（修正前は候補 2・パケット 4）
- **S3-004（情報）・S1-003 の file:// 読み取り**: `main.js` lockDownSession の `webRequest.onBeforeRequest`
  - file:// はアプリ自身の dist の中だけ通し、ホスト名つき（共有フォルダ）・ほかの場所は取り消す。http・https・ws・wss・ftp もすべて取り消す（アプリは使わない）。利用者が選んだファイルは File（blob）なので影響しない
  - 確認: 画面からの fetch・同期 XHR・img での file:///…/secret.txt と file://127.0.0.1/share/… はすべて ERR_BLOCKED_BY_CLIENT（修正前は中身を読めた）。サンプル 18 組・コマンドラインで渡したファイル・localStorage（設定の保存）は今までどおり
- **S1-004（中）権限**: `main.js` で setPermissionRequestHandler / setPermissionCheckHandler / setDevicePermissionHandler をすべて断る
  - 確認: geolocation・camera・microphone・clipboard-read・notifications・midi が全部 denied、clipboard.readText は NotAllowedError、Notification は denied（修正前は全部 granted・クリップボードを読めた）。画像の保存（ダウンロード）は権限を使わないので影響なし
- **S1-005（軽微）app:capture の範囲**: `main.js`
  - 数でない・省略・窓（getContentSize）から 2 画素を超えてはみ出す・幅や高さが 1 未満、は「撮る範囲が正しくありません」で断る。端の小数は窓の中に切り詰める
  - 確認: 100×100 と窓全体は撮れる。1e9・省略・負・窓の外はすべて断る（修正前は 1e9 と省略でページ全体を返した）。画像の保存は製品版でも保存される（136 KB の PNG）
- **S3-002（中）・S1-007・S3-005 CSP**: `src/index.html`
  - `object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'; media-src 'none'; manifest-src 'none'` を追加
  - **'unsafe-eval' を画面本体から外した**: 別スレッド（Worker）を blob: から作ると画面の CSP を受け継ぐため、STEP の部品（occt-import-js が `new Function` を使う）のために本体にも 'unsafe-eval' が要っていた。アプリ版は別スレッドを `dist/worker.js` のファイルから作るように変え（`build.mjs` が書き出す、`app.js` は `new Worker('worker.js')`）、本体は `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:` にした（script-src の blob: も外した）。ファイルから作った Worker には画面の CSP が掛からないので STEP は動く。Worker の外への要求は上の webRequest で止まる。試作ページは今までどおり埋め込み（gzip）から blob: で作る
  - 確認: 画面で `eval`・`new Function` が EvalError（修正前は動いた。※Playwright の evaluate の中で直接呼ぶと CSP を素通りするので、setTimeout の中で確かめた）。iframe は「violates … frame-src 'none'」で止まる。STEP（gmsh_parts.step）・IFC・Draco・LAZ・E57 を開発版・製品版とも開ける
- **S4-009 deb の copyright**: `build/linux/copyright` の `Source:` を https://github.com/kurasora/lidar-viewer に

## 直さなかったもの
- S4-009 の elevate.exe: portable の設定に `packElevateHelper` が無く（electron-builder 26 の設定の検査で断られる）、afterPack より後に入れられるので設定では外せない。AppImage の古い同梱部品（libgconf など）も electron-builder 標準の作りで外せない。どちらもそのまま
- S4-006（公開リポジトリの整理）・Electron 44.9.0 への版上げ: 持ち主の確認が要るのでやっていない
- 試作ページの CSP（S3-003 の 2 つ目の案）: S3-001 の修正で外への要求が 0 件になったので入れていない

## 気づいたこと
- 開発版で一度だけ「WebGL: CONTEXT_LOST_WEBGL … Context Restored」が出た（ソフトウェア描画の一時的なもの。再現せず、直後に戻って表示も保存も正常）
- release/ と dist/ は作り直していない。次の配布は全 OS を作り直し、mac は fuse のあとに ad-hoc 署名、Windows・mac の実機で起動を確かめること
