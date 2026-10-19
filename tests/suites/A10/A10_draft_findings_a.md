
## 見つけた問題（重大度の高い順）

### A10-001 [致命] Ubuntu 24.04（ROS2 Jazzy の標準 OS）で deb version・AppImage version が起動直後に落ちる。エラーの指示どおり chrome-sandbox を 4755 にしても、置き場所「/opt/LiDAR Viewer」の空白のせいでやはり落ちる
- 種類: 配布物 / バグ
- 対象: アプリ version（Linux x64・arm64 の deb と AppImage）。Ubuntu 23.10 以降（24.04 LTS を含む）など、一般ユーザーの user 名前空間を制限している OS。ロボットの Raspberry Pi 5（Ubuntu 24.04 + ROS2 Jazzy）に画面環境を入れて動かす場合にもそのまま当たる
- 再現手順（このマシンで、Ubuntu 24.04 の制限を seccomp でまねて再現。`$W/regress/linux_sandbox_test.sh`）:
  1. deb と同じく `/opt/LiDAR Viewer/` に linux-unpacked を置く（専用のマウント名前空間で /opt に重ねる）
  2. deb の postinst と同じ判定を root で実行 → `unshare --user true` が root では通るので **0755**（SUID にしない）と判定
  3. 一般ユーザー（uid 999）で、user 名前空間を作れない状態（`$W/bin/nouserns`）で `/opt/LiDAR Viewer/lidar-viewer` を起動
  4. エラーの指示どおり `chown root:root` と `chmod 4755 chrome-sandbox` をして、もう一度起動
- 期待される結果: 起動する（名前空間か SUID のどちらかのサンドボックスで）
- 実際の結果（`$W/evidence/sbx_result.txt`）:
  - 手順 3（0755）: `FATAL:setuid_sandbox_host.cc(163)] The SUID sandbox helper binary was found, but is not configured correctly. Rather than run without sandboxing I'm aborting now. You need to make sure that /opt/LiDAR Viewer/chrome-sandbox is owned by root and has mode 4755.` で終了
  - 手順 4（4755）: `LaunchProcess: failed to execvp:` `/opt/LiDAR` と `FATAL:zygote_host_impl_linux.cc(207)] Check failed: . : Invalid argument (22)` で終了（**SUID ヘルパーのパスが空白で切れている**）
  - 対照: 同じ 4755 でフォルダ名だけ空白なし（`/opt/LiDARViewer`）にすると SUID サンドボックスで正常に起動（描画プロセスが別の PID 名前空間に入る）。user 名前空間が使える環境（Ubuntu 22.04・Debian 12・Raspberry Pi OS 相当）では 0755 のままで起動する。`--no-sandbox` なら制限下でも起動する。`--disable-namespace-sandbox` で SUID を強制した場合も手順 4 と同じ失敗
  - AppImage は FUSE の読み取り専用の中にあるので SUID にできず、ファイルをダブルクリックすると AppRun は `--no-sandbox` なしで起動する（`--no-sandbox` は AppImage 内の .desktop の Exec にだけ付いている）→ 手順 3 と同じ失敗になる
- 証拠: `$W/evidence/sbx_result.txt`、`$W/evidence/sbx_B_space_0755_userns_ng.log`、`$W/evidence/sbx_C_space_4755_userns_ng.log`、`$W/evidence/sbx_D_nospace_4755_userns_ng.log`。外部の同種の報告（Ubuntu 24.04 の Electron アプリで、AppImage が手順 3 と、deb を 4755 にした後が手順 4 と同じエラー）: https://community.vikunja.io/t/linux-desktop-app-install-problems/3614
- 場所: deb の postinst（electron-builder 25.1.8 の雛形 `templates/linux/after-install.tpl`。root で `unshare --user true` を試すだけ）／package.json:3,21 の productName「LiDAR Viewer」がそのまま /opt のフォルダ名になる／Chromium の `CommandLine::PrependWrapper` が SUID ヘルパーのパスを空白で分ける
- 原因の見立て: Ubuntu 23.10 以降は AppArmor（`kernel.apparmor_restrict_unprivileged_userns=1`）で、プロファイルのないアプリの user 名前空間を制限する。root は制限を受けないので postinst は気づかない
- 直し方の案: (1) electron-builder 26 以降に上げて `deb.appArmorProfile` に `abi <abi/4.0>, include <tunables/global> profile lidar-viewer "/opt/LiDAR Viewer/lidar-viewer" flags=(unconfined) { userns, include if exists <local/lidar-viewer> }` を指定（26.0.0-alpha.6 で追加。Chrome・VS Code の deb と同じやり方）するか、25 のまま `deb.afterInstall` の自前の台本で同じプロファイルを `/etc/apparmor.d/` に置いて `apparmor_parser -r` する。(2) /opt のフォルダ名を空白なしにする（Linux 用のビルドだけ productName を `LiDAR-Viewer` などにする。設定の置き場所の名前も変わるので A10-010 と合わせて移行を考える）。(3) AppImage は利用者向けの手順に「Ubuntu 24.04 では `--no-sandbox` を付けて起動」を書くか、deb を勧める
- 確度: 再現済み（制限は seccomp でまねたもの。本物の Ubuntu 24.04 での確認は実機手順 L-1）
- 再現スクリプト: `$W/regress/linux_sandbox_test.sh`（`heavy xvfb-run -a -n 200 -s "-ac -screen 0 1280x800x24" bash linux_sandbox_test.sh <linux-unpacked> <作業フォルダ>`）
