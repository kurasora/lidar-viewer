# A10 配布物・クロスプラットフォーム・起動と終了 報告

（`$W` = `/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A10`、`R` = `/home/claude/pcd-viewer/release`、旧 version = `/home/claude/release-archive/release-0.2.0`）

## まとめ

- 試験した範囲: release/ の配布物 7 つ（portable.exe・AppImage x64/arm64・deb amd64/arm64・mac zip x64/arm64）と展開済み 5 つ、package.json の build 設定、main.js の寿命（起動・二重起動・終了・強制終了・読み込み中／ライブ中の終了）、旧 version 0.2.0（PCD Viewer）からの移行、OS ごとの導入・初回起動の流れ（Ubuntu 24.04 のサンドボックス、Windows のファイアウォール・SmartScreen、macOS の Gatekeeper・ローカルネットワークの許可）、Raspberry Pi 5 で使うときの注意
- 使った試験技法:
  - 静的解析: 全配布物のメタデータの突き合わせ（PE の version 情報・アイコン・マニフェスト、deb の control/postinst/.desktop、Info.plist、asar のヘッダー）、ELF/Mach-O/PE の構造（CPU・LOAD の整列・NEEDED・LC_UUID・コード署名のページ指紋と CodeResources）、NSIS の台本の展開、依存の推移的閉包（apt-cache）、Electron の fuse、同梱ライブラリの使用許諾
  - デシジョンテーブル: サンドボックス（置き場所の空白の有無 × chrome-sandbox の権限 × user 名前空間の可否 × --no-sandbox）
  - 状態遷移: 起動 → 二重起動 → 終了／読み込み中・ライブ配信中の終了／強制終了 → 再起動／旧 version で設定 → 新 version で起動
  - 境界値: TMPDIR の長さ（UNIX ソケットの 107 文字）、窓の最小の大きさ、ページの大きさ（16K）
  - 比較試験: 旧 version 0.2.0 との差分（アイコン・UUID・展開先・live.js）
  - 脅威分析: fuse・署名・ファイアウォール・ローカルネットワークの許可・サポート切れの実行環境
  - 資料調査: Apple TN3179、Microsoft Learn（ファイアウォール・Smart App Control）、Electron のサポート期間、Ubuntu の AppArmor 制限、Electron の Wayland 既定化
- 見つけた数: {{COUNTS}}
- 問題なかったこと（確認して OK だった項目）は「問題なかった項目」の節にまとめた
- 実機（Windows・mac・Raspberry Pi・Ubuntu 24.04）で人が確かめる手順は「実機で人が確かめる手順」の節に ID つきで並べた（`$W/regress/manual_checks.md` にも同じもの）
