
### A10-003 [重大] macOS 15 以降: ライブ機能に「ローカルネットワーク」の許可が要るのに説明文がなく、さらに許可の記録が不安定になる条件（ad-hoc 署名・旧 version やほかの Electron アプリと同じ LC_UUID）がそろっている
- 種類: 配布物 / 使い勝手
- 対象: アプリ version（macOS 15 Sequoia 以降、x64・arm64）
- 再現手順: Info.plist を読む／全 Mach-O の LC_UUID を旧 version 0.2.0（PCD Viewer）と比べる（`$W/regress/mac_sig_check.py`）
- 期待される結果: `NSLocalNetworkUsageDescription` があり、主の実行ファイルの UUID がこのアプリ固有
- 実際の結果: `NSLocalNetworkUsageDescription` なし。主の実行ファイル「LiDAR Viewer」の LC_UUID は x64 `4C4C44C6-5555-3144-A10F-9FB886F07EF0`・arm64 `4C4C4446-5555-3144-A117-AEB167531362` で、**旧 version PCD Viewer 0.2.0 の主の実行ファイルと同じ**（Electron 34.5.8 の雛形の実行ファイルの名前を変えただけなので、同じ version の Electron で作ったほかのアプリとも同じになる）。署名は ad-hoc（Developer ID でも公証でもない）
- 資料（Apple TN3179 Understanding local network privacy）: macOS 15 から、UDP ブロードキャストの送信・ローカルの相手への UDP ユニキャストの送信・UDP ブロードキャストの受信・ローカルの相手への TCP 接続に許可が要る。このアプリでは MID-360 の探索（255.255.255.255:56000 への送信）、設定の命令、配信の知らせ（47800 のブロードキャスト受信）、配信元への WebSocket 接続が該当する（点群のユニキャスト受信と、配信の待ち受けは不要）。同文書には「許可の画面を出した直後の操作は、利用者が答える前に拒否されることがある」「ad-hoc 署名だと許可の記録が確実に追えない」「主の実行ファイルの UUID がほかのプログラムと同じだと、おかしな動きをすることがある」とある。Apple の開発者フォーラムでは、UUID が同じ 2 つのアプリが 1 つの許可の項目を共有し、後から起動したアプリが確認なしに前のアプリの判断を引き継いだ例がある（https://developer.apple.com/forums/thread/766129）。macOS 27.2 より前は、許可を「未決定」に戻す方法がない
- 影響: 許可の画面に用途の説明が出ない。拒否された場合や、旧 version・ほかの Electron アプリの判断を引き継いだ場合、MID-360 が「見つかりません」と出るだけで理由が分からない（アプリに許可の状態の案内がない）
- 場所: package.json の `mac`（`extendInfo` なし）、Electron の主の実行ファイル（electron-builder は名前を変えるだけ）
- 直し方の案: `mac.extendInfo.NSLocalNetworkUsageDescription`（例:「LiDAR（Livox MID-360）を探して点群を受け取り、同じネットワークのほかの LiDAR Viewer と点群をやり取りするために使います。」）。署名の前（afterPack）に主の実行ファイルの LC_UUID をアプリ固有の値（appId から作る UUID v5 など）へ書き換える（Apple TN3178 の考え方）。できれば Developer ID で署名して公証。ライブのカードに「macOS: システム設定 > プライバシーとセキュリティ > ローカルネットワーク で LiDAR Viewer をオンに」と出す
- 確度: 資料（Apple の技術文書）による推定 ＋ 配布物の UUID 一致・説明文なしは確認済み。実機の動きは実機手順 M-3
- 再現スクリプト: `$W/regress/mac_sig_check.py`、`$W/regress/static_checks.py`（R11b・R12b・R12c）

### A10-004 [重大] Windows: ライブの受信（UDP 56301 の点群・47800 の配信の知らせ・配信の待ち受け）が Windows ファイアウォールに止められやすく、止められてもアプリは何も言わない
- 種類: 使い勝手 / 配布物
- 対象: アプリ version（Windows portable）
- 根拠（Microsoft Learn「Windows Firewall rules」）: 受信の許可規則のないアプリが初めて待ち受けると許可を求める画面が出る。「管理者の権限がある利用者が No／取り消しを選ぶと、TCP と UDP の遮断規則が作られる」「**管理者でない利用者に画面が出た場合は、どれを選んでも遮断規則が作られる**」
- このアプリでの影響（コード読解: live.js）:
  - 点群は LiDAR の 56300 → PC の 56301 へのユニキャスト。PC は 56301 から何も送らないので、ステートフルな「返事」として通らず、許可規則がないと遮断される。探索の返事（ブロードキャストへのユニキャストの返事）と設定の返事は、こちらが送った直後の返事なので通る → **「LiDAR は一覧に出て『表示』も押せるのに、0 点/秒のまま」**になる
  - 配信の知らせ（47800 のブロードキャスト受信）と配信の WebSocket（毎回変わる TCP ポートの待ち受け）も遮断され、ほかの PC から配信が見つからない／つながらない
  - 許可の画面の名前は A10-006 のため「Electron」と出る。portable の展開先は `%TEMP%\<ビルドごとの KSUID>\LiDAR Viewer.exe`（0.3.0 は `%TEMP%\3Ko5qThTjREWb6GhdvRuHV6fR0M`、0.2.0 は `%TEMP%\3Ko1gVU4DaHad8mVBOcQWtOXFsY`。NSIS の台本を展開して確認）で、version を上げるたびに場所が変わるので、許可も version ごとにやり直し
  - LiDAR を直結した有線 LAN は「識別されていないネットワーク」としてパブリックに分類されやすい。許可の画面でパブリックにチェックがないと受信できない（実機手順 W-3 で確認）
- 期待される結果: 初回に分かりやすい名前で許可を求め、受信できないときはアプリが原因の候補（ファイアウォール）を知らせる
- 場所: live.js:65-73（bindUdp）、live.js:221（`WebSocket.Server({ port: 0 })`）、src/app.js のライブのカード（つないだのに 0 点/秒のときの案内なし）
- 直し方の案: (1) A10-006 を直して許可の画面に「LiDAR Viewer」と出す。(2) NSIS のインストーラー version を用意し、導入時に `netsh advfirewall firewall add rule name="LiDAR Viewer" dir=in action=allow program="<導入先>\LiDAR Viewer.exe" profile=any` を入れる（管理者で 1 回）。(3) LiDAR につないで数秒たっても 0 点/秒なら、Windows では「ファイアウォールで受信が止められている可能性（パブリックのネットワークも許可）」を出す。(4) 利用者向けの手順書に許可の手順を書く
- 確度: 資料（Microsoft の文書）とコードからの推定。実機手順 W-3 で確認

### A10-005 [中] deb・AppImage のアイコンが 1024x1024 の 1 枚だけで、GTK（GNOME のメニュー・ドック）がアイコンを見つけられない（0.2.0 からの後退）
- 種類: 配布物
- 対象: アプリ version（Linux の deb x64・arm64、AppImage を統合したとき）
- 再現手順: deb を展開し、Ubuntu 24.04 の hicolor テーマ（hicolor-icon-theme 0.17）で GTK 3.24 の `gtk_icon_theme_lookup_icon("lidar-viewer")` を呼ぶ（`$W/regress/gtk_icon_lookup.py lidar-viewer <展開した usr/share> 16 48 128 256 512`）
- 期待される結果: 各大きさで Tsubu のアイコンが見つかる
- 実際の結果: `has_icon: false`、16/48/128/256/512 のどれも `null`。パッケージにあるのは `usr/share/icons/hicolor/1024x1024/apps/lidar-viewer.png` だけで、hicolor の index.theme には `1024x1024/apps` という場所がない（512x512 まで）。比較: 0.2.0 の deb は 16/32/48/64/128/256 を入れていて、同じ方法で見つかる
- 証拠: `$W/regress/out/static/summary.md` の R09
- 場所: package.json の build（`linux.icon` の指定なし → build/icon.png（1024）だけが使われた）
- 原因の見立て: 0.3.0 でアイコンを 1024 の 1 枚に作り直したため、electron-builder が 1024x1024 の場所にだけ置いた
- 直し方の案: `build/icons/` に `16x16.png`〜`512x512.png` を置き、`linux.icon: "build/icons"` を指定する
- 確度: 再現済み（GTK の探し方で確認。実際のメニューの表示は実機手順 L-2）

### A10-006 [中] Windows: 実際に動く「LiDAR Viewer.exe」の version 情報とアイコンが Electron のまま（タスクマネージャー・ファイアウォールの許可の画面に「Electron」と出る）
- 種類: 配布物
- 対象: アプリ version（Windows portable）
- 再現手順: portable.exe を 7za で展開（中身は win-unpacked と全ファイル同一）し、`LiDAR Viewer.exe` の資源を pefile で読む（`$W/regress/pe_info.py`）
- 期待される結果: 製品名 LiDAR Viewer・version 0.3.0・会社 fukuda・アイコン Tsubu
- 実際の結果: `CompanyName: GitHub, Inc.` `FileDescription: Electron` `ProductName: Electron` `FileVersion: 34.5.8` `OriginalFilename: electron.exe` `LegalCopyright: Copyright (C) 2015 GitHub, Inc. All rights reserved.`、アイコンは Electron のロゴ（16/32/48/256）。外側の portable.exe（NSIS）は正しい（LiDAR Viewer・0.3.0・fukuda・Tsubu 7 サイズ）。0.2.0 も同じ状態
- 証拠: `$W/logs/pe_inner.json`、`$W/logs/pe_outer.json`、`$W/ex/exe/icons_inner/inner_256x256.png`（Electron のロゴ）、`$W/ex/exe/icons_outer/group_103.ico.png`（Tsubu）
- 場所: package.json:31 `"signAndEditExecutable": false`
- 原因の見立て: Linux でビルドするときに rcedit（wine が要る）を避けるため、資源の書き換えを止めている（asar の完全性の資源だけは書き換わっている）。窓のアイコンは BrowserWindow の icon（Tsubu）なので作業中のタスクバーは Tsubu だが、プロセス名・exe のアイコン・ファイアウォールの許可の画面の名前（version 情報の FileDescription を使う）は「Electron」になる
- 直し方の案: electron-builder の `afterPack` で純 JS の `resedit` を使い、version 情報とアイコンを書き込む（wine 不要）か、Windows 上（CI の Windows ランナーなど）でビルドする
- 確度: 再現済み（静的）。画面での見え方は実機手順 W-2

### A10-007 [中] deb の依存の宣言に libgbm1・libasound2（と libdrm2）がなく、最小構成の Ubuntu では入れても起動できない
- 種類: 配布物
- 対象: アプリ version（deb x64・arm64）
- 再現手順: `readelf -d lidar-viewer` で必要なライブラリを調べ、Ubuntu 24.04（noble）の apt の情報で、deb の Depends の推移的な閉包にそれぞれの提供パッケージが入るかを `apt-cache depends --recurse` で調べる。あわせて `apt-get -s install ./LiDARViewer-0.3.0-amd64.deb`
- 期待される結果: すべて閉包に入る
- 実際の結果: `apt-get -s install` は成功する（libgtk-3-0t64 などが旧名を Provides しているので依存は解決する）が、`libgbm.so.1`（libgbm1）・`libasound.so.2`（libasound2t64）・libdrm2 は閉包に入らない（ほかの NEEDED は libgtk-3-0t64 経由で入る）。普通の Ubuntu Desktop には入っているが、Ubuntu Server に軽い画面環境を足した構成（Pi 5 のロボットで予定している形）やコンテナでは、導入は成功しても起動時に `error while loading shared libraries: libgbm.so.1` になる恐れ
- 場所: package.json:77-87（`deb.depends` を electron-builder の既定と同じ一覧で上書き）
- 直し方の案: `deb.depends` に `libgbm1`、`libasound2t64 | libasound2`、`libdrm2` を足す
- 確度: 再現済み（依存の閉包の静的確認）。起動の失敗そのものは推定

### A10-008 [中] AppImage が FUSE 2（libfuse.so.2）を要る古い型の runtime で、Ubuntu 22.04 以降の既定の状態ではダブルクリックしても起動しない
- 種類: 配布物
- 対象: アプリ version（AppImage x64・arm64）
- 再現手順: AppImage の先頭の ELF（runtime。x64: 188,392 バイト、arm64: 197,808 バイト）を調べる。どちらも動的リンクで `libfuse.so.2` を dlopen する（文字列 `libfuse.so.2`）。squashfs は gzip
- 実際の結果: Ubuntu 22.04/24.04 は libfuse2 を既定で入れていないため、`dlopen(): error loading libfuse.so.2 … AppImages require FUSE to run.` で止まる（AppImage の公知の動き）。入れた後も 24.04 では A10-001 の理由で落ちる。arm64 はさらに A10-002
- 直し方の案: 利用者向けの手順に `sudo apt install libfuse2t64`（24.04）/ `libfuse2`（22.04）と `--no-sandbox` を書く。または静的リンクの新しい type2 runtime（libfuse3 内蔵）を使う version の electron-builder に上げる
- 確度: 静的確認 ＋ 公知の動き（実機手順 L-3）

### A10-009 [中] Windows portable: 起動のたびに約 300 MB を一時フォルダへ 2 回書き出す。二重起動すると、動いている方のフォルダを消してから上書きしようとする。設定は exe の横ではなく %APPDATA% に残る
- 種類: 性能 / 意図しない挙動
- 対象: アプリ version（Windows portable）
- 再現手順（コード読解）: electron-builder 25.1.8 の `templates/nsis/portable.nsi` と `include/extractAppPackage.nsh`、portable.exe の NSIS の台本（deflate を展開して文字列を確認）
- 実際の動き: 展開先は `%TEMP%\3Ko5qThTjREWb6GhdvRuHV6fR0M`（ビルドごとに変わる KSUID）。起動のたびに (1) `RMDir /r` で展開先を消し、(2) 7z を `$PLUGINSDIR\7z-out` へ展開（約 300 MB）、(3) `CopyFiles` で展開先へ写す（さらに約 300 MB）、(4) アプリの終了後にまた消す。1 つ目が動いている間に exe をもう一度ダブルクリックすると、(1) で動いている version の使われていないファイル（ほかの言語の .pak、vk_swiftshader.dll など）を消し、使用中のファイルの上書きに失敗して 1 秒おきに 5 回やり直した後、無音モードのため「再試行」扱いで `Nsis7z::Extract` で無理に上書きし、2 つ目のアプリは二重起動として終了、その後 (4) で動いている方のフォルダをまた消す
- 影響: 起動が遅い（ウイルス対策の検査も毎回走る）。二重起動の後、1 つ目は消されたファイル（例: GPU が落ちてソフトウェア描画に切り替わるときの vk_swiftshader.dll）を後で読めず不安定になりうる。前に出るまで 5 秒以上かかる。「portable」だが設定・キャッシュは `%APPDATA%\LiDAR Viewer` に残る（`PORTABLE_EXECUTABLE_DIR` を使っていない）
- 場所: package.json:28-35（`win.target: portable`、`portable.unpackDirName` 未指定）、main.js:50（userData）
- 直し方の案: NSIS のインストーラー（`win.target: nsis`、利用者ごと・管理者不要）か zip を用意する。portable を続けるなら `portable.unpackDirName` を固定（ファイアウォールの許可が version をまたいで効く）し、利用者向けに「起動は 1 回だけ。前に出ないときはタスクバーから」と書く。設定を exe の横に置きたいなら、`process.env.PORTABLE_EXECUTABLE_DIR` があれば `app.setPath('userData', …)` する
- 確度: コード上の推定（実機手順 W-4 で確認）
