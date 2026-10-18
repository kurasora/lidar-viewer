
### A10-012 [中] macOS: Electron の既定のアプリのメニューがそのまま出る（⌘R で再読み込みすると開いていた点群がすべて消え、ライブの配信は裏で続く）
- 種類: 意図しない挙動
- 対象: アプリ版（macOS）
- 再現手順（コード読解と Linux での確認）: main.js:37 は `win.removeMenu()` だけ。mac では窓のメニューを外す API は効かず、Electron 34.5.8 の既定のメニュー（`lib/browser/default-menu.ts`: appMenu・fileMenu・editMenu・viewMenu・windowMenu。viewMenu は「再読み込み ⌘R」「強制的に再読み込み ⇧⌘R」「開発者ツール ⌥⌘I」・拡大縮小・フルスクリーン）が画面上のメニューバーに出る。Linux 版で `Menu.getApplicationMenu()` の中身を取り出して確認する場面を `lifecycle.js menu` に用意（結果: {{MENU_RESULT}}）
- 影響: ⌘R を押すと画面が読み込み直され、開いていた点群・計測・カードは確認なしにすべて消える。ライブで配信中だった場合、主プロセスの配信は続くが、読み込み直した画面は `LV.src` を持たないので点を捨て、配信を止める操作も出ない
- 期待される結果: 再読み込みの項目がないか、確認してから読み込み直す
- 直し方の案: mac では `Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]))` のように、再読み込みと開発者ツールを除いた最小のメニューにする（Windows/Linux は今のままでよい）
- 確度: コード上の推定（既定のメニューの中身は Linux で確認。mac での表示は実機手順 M-4）

### A10-013 [中] Electron 34.5.8 はサポートが終わっている（2025-06-23 に終了）
- 種類: セキュリティ
- 対象: アプリ版（全 OS）
- 根拠: endoflife.date（Electron は最新の 3 系列だけを保守。2026-10 時点では 42・43・44）。Chromium 132 / V8 / Node のその後のセキュリティ修正が入っていない。このアプリは外から来るファイル（点群）と LAN の通信（配信の WebSocket・UDP）を扱う。さらに AppImage は .desktop から起動すると `--no-sandbox`（A10-001 の回避）で動く
- 直し方の案: 保守中の版（43 / 44）へ上げる。上げると Linux は Wayland が既定（38.2 以降）になり、Wayland の app_id は package.json の `desktopName`（なければ「LiDAR Viewer.desktop」。Electron の起動処理で確認）から決まるので、`"desktopName": "lidar-viewer.desktop"` を今のうちに足して .desktop の名前と合わせる（今は X11 なので WM_CLASS「LiDAR Viewer」と StartupWMClass で合っている）。macOS の最小の版が上がる点も確かめる
- 確度: 資料による

### A10-014 [中] 署名がなく、OS ごとに「開くまでの手順」が要るのに、利用者向けの手順書が配布物にない
- 種類: 配布物 / 使い勝手
- 対象: 全 OS の配布物
- 実際の結果:
  - Windows: portable.exe・中の exe とも Authenticode 署名なし（pefile で確認）→ SmartScreen の「Windows によって PC が保護されました」（詳細情報 → 実行）。Windows 11 の Smart App Control が「オン」の PC では、署名のない不明なアプリは既定で止められる（Microsoft Learn: "unknown, unsigned code are blocked by default"）
  - mac: ad-hoc 署名のみ（公証なし）。macOS 15 以降は Control キーを押しながら「開く」が使えず、システム設定 > プライバシーとセキュリティ >「このまま開く」が要る（Apple のサポート文書）。「壊れている」と出る場合は `xattr -dr com.apple.quarantine` が要る（Apple の DTS は社内配布に限って勧める）
  - Linux: A10-001・A10-002・A10-008 の回避手順（`--no-sandbox`、libfuse2、zlib1g-dev）
- 直し方の案: release/ に README（OS ごとの開き方・回避策・ファイアウォール・ローカルネットワークの許可）を同梱する。公開して配るなら、Windows はコード署名（Azure Trusted Signing など）、mac は Developer ID と公証。※ release/ には builder-debug.yml（ビルドの内部情報）も入っているので、配るときは除く
- 確度: 再現済み（署名の有無は静的）。OS の画面は実機手順 W-1・M-1

### A10-017 [軽微] deb の付帯情報が仮のまま（Homepage が https://localhost/…、連絡先が fukuda@localhost、Section: default、copyright ファイルなし）
- 種類: 配布物 / 文言
- 対象: deb x64・arm64（`apt show`・ソフトウェアの一覧に出る）
- 実際の結果（`dpkg-deb -I`）: `Homepage: https://localhost/lidar-viewer`、`Maintainer: fukuda <fukuda@localhost>`、`Vendor: fukuda <fukuda@localhost>`、`Section: default`（Debian の分類にない名前）。`/usr/share/doc/lidar-viewer/` には fpm が作った changelog（`lidar-viewer (0.3.0) whatever; urgency=medium` / `* Package created with FPM.`）だけで copyright がない。説明文は UTF-8 で正しく入っていて文字化けはない。md5sums と中身は一致
- 場所: package.json:6-10（author の email）、:59（maintainer）、:106（homepage）
- 直し方の案: homepage を消すか実在の URL（研究室のページ・リポジトリ）に、メールを実在のものに。`deb.packageCategory: "science"` など。copyright は `extraFiles` で入れる
- 確度: 再現済み（静的）

### A10-018 [軽微] 同梱しているライブラリの使用許諾の表記が配布物にない（LGPL-2.1 の occt-import-js、MPL-2.0 の web-ifc、Apache-2.0 の laz-perf・draco ほか）
- 種類: 配布物
- 対象: アプリ版・試作ページ
- 実際の結果: dist/app.js の末尾の「Bundled license information」には three.js・fflate・pako・lerc だけ。wasm として埋め込んでいる occt-import-js 0.0.23（LGPL-2.1。OpenCASCADE）・web-ifc 0.0.78（MPL-2.0）・laz-perf 0.0.7（Apache-2.0）・draco3d 1.5.8（Apache-2.0）と geotiff 3.0.5（MIT）の表記、LGPL/MPL が求めるソースの入手先の案内がどこにもない（LICENSE.electron.txt・LICENSES.chromium.html と ws の LICENSE は入っている）
- 直し方の案: `THIRD_PARTY_NOTICES.txt`（名前・版・使用許諾の全文・ソースの URL）を作って `extraResources` で同梱し、アプリから開けるようにする（`license-checker` などで生成）
- 確度: 再現済み（静的）。法的な判断ではなく、公開して配る前の確認事項として

### A10-020 [軽微] アプリの中に版の表示がない（Windows・Linux では動いている版を確かめる手段がない）
- 種類: 使い勝手
- 対象: アプリ版（Windows・Linux。mac は既定のメニューの「LiDAR Viewer について」で 0.3.0 が出る）
- 実際の結果: index.html・app.js に版を出す場所がない（`0.3.0` も `getVersion` もない）。Windows では exe のプロパティを見ても A10-006 のため 34.5.8（Electron の版）と出る
- 直し方の案: preload から `app.getVersion()` を渡して、設定のカードなどに「LiDAR Viewer 0.3.0」と出す
- 確度: 再現済み（静的）

### A10-021 [情報] Electron の fuse が既定のまま（RunAsNode・NODE_OPTIONS・--inspect が有効、asar の完全性の検査なし）
- 種類: セキュリティ（強化の提案）
- 対象: アプリ版（全 OS）
- 実際の結果（`$W/regress/fuses.py`）: 全配布物で `RunAsNode: ON`、`EnableNodeOptionsEnvironmentVariable: ON`、`EnableNodeCliInspectArguments: ON`、`EnableEmbeddedAsarIntegrityValidation: off`、`OnlyLoadAppFromAsar: off`。asar の完全性の値（`ElectronAsarIntegrity` と exe の INTEGRITY 資源）は埋め込まれていて、ヘッダーの sha256 と一致する（検査が無効なだけ）
- 影響: `ELECTRON_RUN_AS_NODE=1` でアプリの実行ファイルを Node として使える、`--inspect` で主プロセスに入れる、resources/app.asar の差し替えに気づかない。mac では、ローカルネットワークなど LiDAR Viewer に与えた許可をほかのプログラムが借りる道になる（Electron の security チェックリストの「fuse を使う」）
- 直し方の案: `afterPack` で `@electron/fuses` の `flipFuses` を呼び、RunAsNode・NodeOptions・NodeCliInspect を切り、EnableEmbeddedAsarIntegrityValidation と OnlyLoadAppFromAsar を入れる（mac は署名の前に）。※ Playwright（`--inspect` を使う）での試験ができなくなるので、試験用の版と分けるか試験の方法を変える
- 確度: 再現済み（静的）

### A10-022 [情報] mac の Info.plist に使わない機能の説明文（英語の既定値）が残り、関連付けの宣言がない／Helper の CFBundleName が「Electron Helper」
- 種類: 配布物 / 文言
- 実際の結果: `NSCameraUsageDescription: This app needs access to the camera`、`NSMicrophoneUsageDescription`、`NSBluetoothAlwaysUsageDescription`、`NSBluetoothPeripheralUsageDescription`（いずれも Electron の既定。アプリは使わない）。`CFBundleDocumentTypes` なし。Helper 4 つの `CFBundleName` が `Electron Helper (GPU)` など（表示名と実行ファイル名は LiDAR Viewer Helper に直っている）。`LSMinimumSystemVersion: 11.0` は Electron 34 の対応範囲どおりで正しい。icns は ic07〜ic14（128〜1024 と @2x）で、16/32 の等倍の要素はない（縮小で足りる）
- 直し方の案: afterPack で Info.plist から不要な説明文を消す（electron-builder の extendInfo は上書きしかできない）。Helper の CFBundleName も afterPack で直せる
- 確度: 再現済み（静的）

### A10-023 [情報] 配布物の大きさを減らせる（全言語の .pak、arm64 の不要なフォルダ、elevate.exe）
- 種類: 性能（配布）
- 実際の結果: locales に 55 言語（展開後で約 40 MB）。画面は日本語だけなので ja と en-US で足りる。linux-arm64 と arm64 AppImage に Electron の作り方の残り `clang_x64_v8_arm64/`（icudtl.dat と snapshot_blob.bin、約 10.8 MB。中身はデータで、実行には使われない）。win の `resources/elevate.exe`（自動更新用。使っていない）。各配布物の大きさ: exe 79.5 MB、AppImage x64 114.0 MB / arm64 114.4 MB、deb amd64 79.3 MB / arm64 78.0 MB、mac zip x64 111.1 MB / arm64 104.5 MB。app.asar は 18.0 MB（うち dist/app.js が 17.7 MB。wasm を base64 で埋め込んでいるため）
- 直し方の案: `electronLanguages: ["ja", "en-US"]`、`afterPack` で `clang_x64_v8_arm64` を消す
- 確度: 再現済み（静的）
