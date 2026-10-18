
### A10-002 [重大] arm64 の AppImage は、runtime が「libz.so」（版なしの名前。Debian/Ubuntu/Raspberry Pi OS では開発用の zlib1g-dev にしかない）を要求していて、普通の Raspberry Pi では起動の入口で止まる
- 種類: 配布物 / バグ
- 対象: アプリ版（AppImage arm64。Raspberry Pi 5 など arm64 の Linux 全般。0.2.0 も同じ）
- 再現手順: 
  1. `readelf -d LiDARViewer-0.3.0-arm64.AppImage` で先頭の runtime の NEEDED を見る
  2. qemu-user（`qemu-aarch64-static`）と arm64 の glibc だけの環境（`libc6-arm64-cross` を展開）で `LiDARViewer-0.3.0-arm64.AppImage --appimage-version` を実行（`$W/regress/arm64_appimage_qemu.sh`）
- 期待される結果: x64 と同じく、普通の環境（zlib1g の `libz.so.1`）で動く
- 実際の結果:
  - NEEDED: `[libdl.so.2] [libpthread.so.0] [libz.so] [libc.so.6] [ld-linux-aarch64.so.1]`、`RPATH [/deps/lib]`（作った環境のパスが残っている）。x64 の runtime は `[libz.so.1]`
  - qemu での実行: `error while loading shared libraries: libz.so: cannot open shared object file: No such file or directory`（終了コード 127）。0.2.0 の arm64 AppImage も同じ
  - `libz.so` という名前のライブラリを置くと読み込みの段階は通り `Version: effcebc` と出る。runtime は zlib の `uncompress` を使う（動的記号にある）ので、実際には本物の zlib が `libz.so` の名前で要る（＝ `sudo apt install zlib1g-dev` で動くようになるはず）
- 影響: Raspberry Pi 5 で AppImage をダブルクリックしても何も起きない（端末から起動すると上のエラー）。libfuse2（A10-008）と A10-001 も重なるので、arm64 で AppImage を使える環境はほぼない
- 証拠: `$W/evidence/arm64_appimage_qemu.log`
- 場所: electron-builder 25.1.8 が同梱する arm64 用の AppImage の runtime（app-builder の appimage ツール）
- 原因の見立て: arm64 の runtime を作るときに `-lz` が開発用の `libz.so`（記号リンク）を直接 NEEDED に記録した（SONAME のない作り方）
- 直し方の案: arm64 では AppImage をやめて deb だけにするか、静的リンクの新しい type2 runtime を使う electron-builder（26 系）に上げて `readelf -d` で NEEDED を確かめる。当面の回避は利用者向けの手順に `sudo apt install zlib1g-dev libfuse2t64` と `--no-sandbox` を書く
- 確度: 再現済み（qemu-user による。実機の Pi での確認は実機手順 L-5）
- 再現スクリプト: `$W/regress/arm64_appimage_qemu.sh`（`light bash arm64_appimage_qemu.sh <arm64.AppImage>...`）、`$W/regress/static_checks.py` の R10g
