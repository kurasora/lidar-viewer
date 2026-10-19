## Raspberry Pi 5（arm64 Linux）で使うときの注意（資料と配布物の点検から）

| 項目 | 状況 | 注意・対策 |
|---|---|---|
| OS | ROS2 Jazzy の標準は Ubuntu 24.04。ロボットの Pi 5 に画面環境を入れて動かす場合 | **A10-001 にそのまま当たる**（deb も AppImage もサンドボックスで落ちる）。当面は `lidar-viewer --no-sandbox` で起動（.desktop の Exec にも付ける）か、AppArmor のプロファイルを置く。A10-005（libgbm1・libasound2）も、Ubuntu Server に軽い画面環境を足した構成では起こりうる |
| 16K ページの核 | Raspberry Pi OS（bookworm 以降）の Pi 5 用の核は既定で 16K ページ。Ubuntu の Pi 用の核は 4K | arm64 の全 ELF（本体・chrome-sandbox・crashpad・各 .so、AppImage の runtime）の LOAD の整列は 64K で、16K の核でも読み込める（点検済み）。それでも落ちる場合は `getconf PAGESIZE` を確認し、4K の核（`/boot/firmware/config.txt` に `kernel=kernel8.img` を足す。例: `echo 'kernel=kernel8.img' \| sudo tee -a /boot/firmware/config.txt` の後に再起動）で比べる |
| GPU・WebGL2 | VideoCore VII（Mesa V3D 7.1、OpenGL ES 3.1 準拠）。WebGL2 に必要な ES 3.0 は満たす | Electron（Chromium 132）が GPU を使うか、ソフトウェア描画（SwiftShader）に落ちるかは実機で確かめる（実機手順 L-5）。ソフトウェア描画だと 100 万点の地図やライブの 20 万点/秒は重い |
| Wayland | Raspberry Pi OS は Wayland（labwc）、Ubuntu 24.04 も既定は Wayland | Electron 34 は既定で X11（XWayland）で動くので、WM_CLASS（`LiDAR Viewer`）と .desktop の StartupWMClass が合い、ドックのアイコンはまとまる。日本語入力（fcitx-mozc）は XWayland の方が安定 |
| メモリ | Pi 5 は 4/8/16 GB | 点数の上限は 10 億点まで選べるが、1 点あたり 16 バイト以上使うので、Pi では 1,000 万〜3,000 万点（既定）に留める。ライブの入れ物は 150 万点で固定（約 30 MB） |
| 画面の大きさ | 窓の最小は 900×600 | 公式の 7 インチ画面（800×480）には収まらない（右と下が切れる） |
| 日本語のフォント | 画面はすべて日本語。CSS は Yu Gothic UI・Hiragino・Meiryo（Windows/mac 用）→ system-ui | Ubuntu Server に最小の画面環境を足した構成では日本語のフォントがなく豆腐（□）になりうる（`lifecycle.js fonts` で再現の写真）。`sudo apt install fonts-noto-cjk` |
| 配信元としての利用 | ライブの配信は画面のアプリから操作する | 画面なしの Ubuntu Server のままでは配信元になれない（コマンドラインで配信だけ始める手段がない）。livox_ros_driver2 と同時に使うと、どちらも SO_REUSEADDR で同じポートを開くため、エラーにならずに点群を取り合う／LiDAR の送り先・形式の設定を書き換える恐れ（担当外。ライブの担当に共有） |

## 実機で人が確かめる手順（次回、実験室で）

### Linux（Ubuntu 24.04 Desktop x64、Raspberry Pi 5 の Ubuntu 24.04 + 画面環境、比較に Ubuntu 22.04 / Raspberry Pi OS）
- **L-1**（A10-001）`sudo apt install ./LiDARViewer-0.3.0-amd64.deb`（Pi は arm64）→ メニューから起動。起動しなければ端末で `lidar-viewer` を実行し、エラーを記録。`cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns`、`ls -l "/opt/LiDAR Viewer/chrome-sandbox"`。続けて `sudo chmod 4755 "/opt/LiDAR Viewer/chrome-sandbox"` 後に再度（`failed to execvp: /opt/LiDAR` が出るか）。回避策 `lidar-viewer --no-sandbox` で起動するか
- **L-2**（A10-002）アプリ一覧・ドック・Alt+Tab のアイコンが Tsubu か（汎用の歯車・白い四角でないか）。起動中の窓がドックの項目にまとまるか
- **L-3**（A10-006）AppImage をダブルクリック → 何も起きない／libfuse2 のエラーか。`sudo apt install libfuse2t64` の後にもう一度 → サンドボックスのエラーか。`./LiDARViewer-0.3.0-x86_64.AppImage --no-sandbox` で起動するか
- **L-4**（A10-017）旧 version 0.2.0 の deb を入れた状態で 0.3.0 を入れる → `dpkg -l | grep -E "pcd-viewer|lidar-viewer"`、メニューに 2 つ出るか。旧 version で変えた「読み込む最大点数」が新 version に残るか
- **L-5**（Pi 5）`getconf PAGESIZE`・`echo $XDG_SESSION_TYPE`・`free -h`。起動するか。F12 の開発者ツールのコンソールで `const gl = document.createElement('canvas').getContext('webgl2'); gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)` → `V3D 7.1` なら GPU、`SwiftShader`・`llvmpipe` ならソフトウェア。map.laz（100 万点）の回転の滑らかさ、ライブ 20 万点/秒の CPU（`top`）。日本語が豆腐にならないか
- **L-6**（担当外の確認）Pi の上で livox_ros_driver2 を動かしたままライブを開く → エラーが出るか、ROS 側の点群（`ros2 topic hz /livox/lidar`）が止まらないか

### Windows 10 / 11（管理者と標準ユーザーの両方で）
- **W-1** portable.exe をブラウザでダウンロードして実行 →「Windows によって PC が保護されました」→「詳細情報」→「実行」で起動するか（署名なし）
- **W-2**（A10-003）タスクマネージャーのプロセス名とアイコン（「Electron」か）、タスクバーにピン留めしたときのアイコン
- **W-3**（A10-008）ライブを開いたときのファイアウォールの画面: 表示名・発行元・プライベート/パブリックのチェックの初期値。LiDAR を直結した LAN のネットワークの種類（設定 > ネットワークとインターネット）。許可しない・標準ユーザーの場合に「LiDAR は見つかるが 0 点/秒」になるか。`wf.msc` の受信の規則に何ができたか。ほかの PC からの配信が一覧に出るか
- **W-4**（A10-007）起動にかかる秒数（初回・2 回目）、`%TEMP%` にできるフォルダ、動いている間に exe をもう一度ダブルクリック（前に出るまでの秒数・1 つ目が落ちないか・`%TEMP%\<フォルダ>` の中身が減っていないか）、終了後にフォルダが消えるか
- **W-5**（A10-017）設定の置き場所 `%APPDATA%\LiDAR Viewer`。「読み込む最大点数」を変えて再起動 → 残るか。旧 version `%APPDATA%\PCD Viewer` の設定は引き継がれないこと
- **W-6**（A10-010）点群ファイルを exe のアイコンにドロップ／「プログラムから開く」→ 開かないこと（窓へのドロップは開く）

### macOS 14 / 15 / 26（Apple Silicon と Intel）
- **M-1** zip を Safari・Chrome でダウンロード → 展開 → アプリケーションへ移動 → ダブルクリック。出る警告の文言（「開発元を確認できない」「Apple は検証できませんでした」「壊れている」のどれか）。システム設定 > プライバシーとセキュリティ >「このまま開く」で開けるか。だめなときだけ `xattr -dr com.apple.quarantine "/Applications/LiDAR Viewer.app"`
- **M-2** `codesign --verify --deep --strict --verbose=2 "/Applications/LiDAR Viewer.app"`、`codesign -dv --verbose=4 "/Applications/LiDAR Viewer.app"`、`spctl -a -vvv -t exec "/Applications/LiDAR Viewer.app"` の出力を記録（Linux での点検では整合している）
- **M-3**（A10-004）macOS 15 以降でライブを開く → ローカルネットワークの許可の画面が出るか、文言、許可する前後で MID-360 が見つかるか、拒否したときの画面。PCD Viewer 0.2.0 を先に使った Mac で、LiDAR Viewer に許可の画面が改めて出るか（UUID が同じ）。システム設定 > プライバシーとセキュリティ > ローカルネットワークの一覧の表示
- **M-4**（A10-012）メニューバーの内容（表示 > 再読み込み など）、⌘R で開いていた点群が消えるか、⌘W・⌘Q で終わるか、終了後に `ps aux | grep "LiDAR Viewer"` が空か
- **M-5** Dock のアイコン（Tsubu）、「LiDAR Viewer について」の version（0.3.0）、Finder で点群ファイルを「このアプリケーションで開く」・Dock のアイコンへドロップ → 開かないこと（A10-010）
- **M-6** 「ファイアウォール」をオンにした Mac で、配信を始めたときに「受信を許可しますか」が出るか、毎回出ないか
