
## 名前・版・アイコンの突き合わせ（静的点検の結果）

| 項目 | package.json | portable.exe（外側の NSIS） | 中の LiDAR Viewer.exe | deb（control） | .desktop（deb / AppImage） | mac Info.plist |
|---|---|---|---|---|---|---|
| 名前 | productName LiDAR Viewer / name lidar-viewer | ProductName LiDAR Viewer | **ProductName Electron・FileDescription Electron** | Package lidar-viewer、説明「LiDAR Viewer — 点群ビューア」 | Name=LiDAR Viewer | CFBundleName/DisplayName LiDAR Viewer（Helper の CFBundleName は「Electron Helper (GPU)」など） |
| 版 | 0.3.0 | 0.3.0.0 | **34.5.8** | 0.3.0 | X-AppImage-Version=0.3.0 | 0.3.0 / 0.3.0 |
| ID | appId local.fukuda.lidarviewer | — | — | — | StartupWMClass=LiDAR Viewer（実際の WM_CLASS と一致） | CFBundleIdentifier local.fukuda.lidarviewer（Helper は .helper.GPU など） |
| 作者 | fukuda &lt;fukuda@localhost&gt; | CompanyName fukuda、© 2026 fukuda | **GitHub, Inc.、© 2015 GitHub** | Maintainer fukuda &lt;fukuda@localhost&gt;（仮のアドレス） | — | © 2026 fukuda |
| 説明 | LiDAR Viewer（点群ビューア: PCD・LAS・E57 ほか、LiDAR のライブ表示） | FileDescription に同じ全文 | **Electron** | 同じ（UTF-8 で正しく、文字化けなし） | Comment=同じ | — |
| アイコン | build/icon.png 1024・icon.ico 7 サイズ・icon.icns 8 要素、窓は assets/icon.png 512 | Tsubu（16〜256 の 7 サイズ） | **Electron のロゴ**（16/32/48/256） | **1024x1024 の 1 枚だけ**（GTK で見つからない） | Icon=lidar-viewer、.DirIcon は 1024 | icon.icns（Tsubu、ic07〜ic14） |
| 旧名の名残 | — | なし | — | なし | なし | なし（UUID は旧版と同じ） |

画面に出る名前に旧名「PCD Viewer」は残っていない。内部の名前（配信の知らせの `app:'pcd-viewer'`、localStorage の `pcdviewer.cap`/`pcdviewer.bg`、ファイル選択の id）は残っているが、配信の名前は旧版との互換のため意図して残している（live.js:5 のコメント）。0.2.0 と 0.3.0 の live.js の違いはコメントだけで、互いに配信を見られる。

