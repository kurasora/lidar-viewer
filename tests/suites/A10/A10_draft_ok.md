
## 問題なかった項目（確認して OK）

配布物（静的な点検。`$W/regress/out/static/summary.md` の PASS）
- 7 つの配布物がそろい、名前の規則（`LiDARViewer-0.3.0-<種類>`）と version がそろっている
- app.asar（18,046,112 バイト）は exe・AppImage x64/arm64・deb amd64/arm64・mac zip x64/arm64・展開済み 5 つのすべてで同一（sha256 `9a661f12…`）
- asar の中身は 26 ファイルだけ: main.js・preload.js・live.js・package.json・assets/icon.png（窓のアイコン、Tsubu 512px）・dist/（index.html・app.js・styles.css）・node_modules/ws（LICENSE 付き）。ソースマップ・src/・tools/・sample/・build.mjs・package-lock.json はない。asar の package.json に devDependencies・scripts・build は残っていない
- asar の完全性の値（mac の `ElectronAsarIntegrity` と exe の `INTEGRITY/ELECTRONASAR` 資源）がヘッダーの sha256 と一致
- portable.exe の中身（7z）は win-unpacked と全 73 ファイル同一。AppImage x64/arm64 の中身は linux-unpacked / linux-arm64-unpacked と同一（AppRun・.desktop・usr/ を除く）。deb の /opt の中身も展開済みと同一で、md5sums とも一致。mac の zip の中身（記号リンク 14・権限を含む）は mac/・mac-arm64/ と同一
- portable.exe（外側）の version 情報（LiDAR Viewer・0.3.0・fukuda・© 2026 fukuda）とアイコン（Tsubu、16〜256 の 7 サイズ）。マニフェストは asInvoker（管理者を要求しない）
- deb の Package・Version・Architecture、説明文（UTF-8、文字化けなし）、.desktop の Name・StartupWMClass・Categories・Exec の引用符、ファイルの所有者 root:root。Ubuntu 24.04 で `apt-get -s install` が依存を解決できる（libgtk-3-0t64 などが旧名を Provides）
- arm64 の配布物（linux-arm64-unpacked・arm64 AppImage・arm64 deb）の ELF はすべて aarch64。LOAD の整列は 64K で、Raspberry Pi 5 の 16K ページの核でも読み込める。必要な glibc は 2.25 まで（Ubuntu 18.04・Debian 10 以降で動く）
- mac: Info.plist の CFBundleName/DisplayName/Identifier/version、LSMinimumSystemVersion 11.0（Electron 34 の対応範囲どおり）、Helper の bundle ID（`local.fukuda.lidarviewer.helper.*`）。ad-hoc 署名は全 15 の Mach-O（本体・Helper 4 つ・フレームワーク 4 つ・dylib 4 つ・crashpad・ShipIt）でページの指紋が中身と一致し、Info.plist・CodeResources の特別な枠、CodeResources の files2 の指紋・記号リンク・入れ子の cdhash もすべて一致（x64・arm64、展開済み・zip の中身の両方）。x64 は x86_64、arm64 は arm64 の Mach-O
- icns は Tsubu で ic07〜ic14（128〜1024）。exe の外側の ico も Tsubu
- 画面に出る名前に旧名「PCD Viewer」は残っていない（desktop・control・Info.plist・exe の外側・窓の題）
- 配信の約束事（`app:'pcd-viewer'`・`PCV1`）は 0.2.0 と 0.3.0 で同じで、旧 version と新 version の間で配信を見られる

起動と終了（実行で確認。`$W/run/heavy_latest/runtime_summary.md` の PASS）
{{RUNTIME_OK}}
