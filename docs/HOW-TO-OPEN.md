# LiDAR Viewer の開き方（Windows・macOS・Ubuntu・Raspberry Pi）

LiDAR Viewer には、OS の会社が確かめた「署名」がありません。そのため初めて開くときに OS が警告を出します。
下の手順で 1 回だけ許可すれば、次からは普通に開けます。配布元（研究室・作った人）から受け取ったファイルだけを開いてください。

| OS | 使うファイル |
|---|---|
| Windows 10 / 11（64 ビット） | `LiDARViewer-<版>-win-x64.zip`（おすすめ）または `LiDARViewer-<版>-portable.exe` |
| macOS 11 以降（Apple シリコン） | `LiDARViewer-<版>-mac-arm64.zip` |
| macOS 11 以降（Intel） | `LiDARViewer-<版>-mac-x64.zip` |
| Ubuntu 22.04 / 24.04（x64） | `LiDARViewer-<版>-amd64.deb`（おすすめ）または `LiDARViewer-<版>-x86_64.AppImage` |
| Raspberry Pi 5（Ubuntu 24.04 / Raspberry Pi OS 64 ビット） | `LiDARViewer-<版>-arm64.deb` |

---

## Windows

### zip 版（おすすめ）
1. **展開する前に**、zip を右クリック →「プロパティ」→ 下のほうの「セキュリティ: このファイルは他のコンピューターから取得したものです…」の **「許可する」にチェック** →「OK」。
   - これをしないと、起動したときに「アクセスが拒否されました」と出て開けないことがあります（インターネットから来たファイルの印が中のファイルにも付き、署名の無いアプリの部品が止められるため）。
   - 新しい版をダウンロードするたびに必要です。「許可する」が無いときは、そのまま次へ。
2. zip を右クリック →「すべて展開」。展開先は `C:\Users\<名前>\LiDARViewer` など、書き込めるフォルダにします（デスクトップでも可）。zip をダブルクリックして中の exe を直接開くのではなく、必ず展開してから使います。
3. 展開したフォルダの `LiDAR Viewer.exe` をダブルクリック。
4. 「Windows によって PC が保護されました」（SmartScreen）が出たら、**「詳細情報」→「実行」**。
   - 「実行」が出ない・何も起きずに止められる場合は、Windows 11 の「スマート アプリ コントロール」がオンです。
     設定 → プライバシーとセキュリティ → Windows セキュリティ → アプリとブラウザーの制御 → スマート アプリ コントロール の設定を確認してください（オフにすると元に戻せないので、研究室の PC は管理者と相談）。
5. スタートメニューやタスクバーに置きたいときは、`LiDAR Viewer.exe` を右クリック →「スタートにピン留めする」。

portable.exe 版も、ダウンロードしたあとに右クリック →「プロパティ」→「許可する」にチェックしておくと確実です。
portable.exe 版は 1 つのファイルで動きますが、起動のたびに一時フォルダへ展開するので起動が遅く、2 回続けてダブルクリックすると不安定になることがあります。続けて使うなら zip 版にしてください。

### ファイルの関連付け（.pcd などをダブルクリックで開く）
zip 版・portable 版は自動では関連付けません。`.pcd` などを右クリック →「プログラムから開く」→「別のアプリを選択」→「PC でアプリを選択する」→ `LiDAR Viewer.exe` を選び、「常にこのアプリを使って開く」にチェック。

---

## macOS

1. zip をダブルクリックして展開し、出てきた **LiDAR Viewer** を「アプリケーション」フォルダへ移します。
2. LiDAR Viewer をダブルクリック。「開発元を確認できないため開けません」「Apple は、悪質なソフトウェアが含まれていないことを検証できませんでした」と出たら「完了」（または「OK」）で閉じます。
3. **システム設定 → プライバシーとセキュリティ** を開き、下の方の「"LiDAR Viewer" は開発元を確認できないため、使用がブロックされました」の横の **「このまま開く」** → パスワード → もう一度「開く」。
   - macOS 15 以降は、Control キーを押しながら開く方法は使えません。上の手順で開いてください。
4. 「"LiDAR Viewer" は壊れているため開けません」と出る場合は、ターミナルで次を実行してから開き直します:
   `xattr -dr com.apple.quarantine "/Applications/LiDAR Viewer.app"`

### ファイルを開く
.pcd .las .laz .e57 .ptx .pts は、ダブルクリックで LiDAR Viewer が開きます（ほかのアプリが既定になっている場合は、右クリック →「このアプリケーションで開く」→ LiDAR Viewer）。.ply .xyz は右クリック →「このアプリケーションで開く」から。Dock の LiDAR Viewer にファイルを落としても開けます。

---

## Ubuntu（x64）

### deb 版（おすすめ）
```
sudo apt install ./LiDARViewer-<版>-amd64.deb
```
（ファイルのあるフォルダで実行。`./` を忘れないこと。足りない部品も一緒に入ります）
アプリの一覧に「LiDAR Viewer」が出ます。端末からは `lidar-viewer`、ファイルを渡すなら `lidar-viewer 地図.pcd`。
.pcd .las .laz .e57 などは、右クリック →「別のアプリケーションで開く」→ LiDAR Viewer で開けます。
削除は `sudo apt remove lidar-viewer`。

### AppImage 版
1. ファイルを右クリック → プロパティ →「プログラムとして実行できる」をオン（端末なら `chmod +x LiDARViewer-<版>-x86_64.AppImage`）。
2. ダブルクリック、または端末で `./LiDARViewer-<版>-x86_64.AppImage`。
- この版の AppImage は libfuse2 が要りません（FUSE 3 の `fusermount3` を使います。Ubuntu 22.04 以降は最初から入っています）。
  それでも「FUSE」の誤りで開かないときは `./LiDARViewer-<版>-x86_64.AppImage --appimage-extract-and-run`。
- Ubuntu 24.04 では、OS の制限（AppArmor）があるとき AppImage 版はサンドボックスなしで動きます（アプリが自動で切り替えます）。気になる場合は deb 版を使ってください。

---

## Raspberry Pi 5（arm64）

deb 版を使います（Ubuntu 24.04 Server / Desktop、Raspberry Pi OS 64 ビット）。
```
sudo apt install ./LiDARViewer-<版>-arm64.deb
```
- Ubuntu Server に画面を後から足した構成でも、必要な部品（libgbm1・libasound2 など）は一緒に入ります。
- 画面（デスクトップ）のない状態では起動できません。
- 3D が遅いときは、`raspi-config` などで GPU のドライバ（KMS）が有効になっているか確認してください。

---

## 困ったとき
- 起動しない・すぐ落ちる（Linux）: 端末から `lidar-viewer` を実行し、出た文字を作った人に送ってください。
- 調べるために開発者ツールを使うとき: 環境変数 `LIDAR_VIEWER_DEVTOOLS=1` を付けて起動し、F12。
- 同梱しているソフトウェアの使用許諾は、アプリのフォルダの `THIRD_PARTY_LICENSES.txt` にあります。
