# LiDAR Viewer

FAST-LIO などで作った点群の地図（.pcd など）を、見やすく表示・計測するためのデスクトップアプリです（Windows / Linux / macOS）。CloudCompare の代わりに、地図の確認・座標の読み取り・距離の計測を手軽に行うことを目的にしています。

## できること
- 点群を開く：PCD・LAS/LAZ・E57・PLY・PTX・文字の点群（txt/csv/xyz）・SBF・BIN など。メッシュ・CAD（OBJ・STL・glTF・DXF・IFC・STEP ほか）や画像も点として表示
- 軌跡を開く：TUM 形式の txt/csv、ROS 2 の rosbag（.mcap）の Odometry / PoseStamped
- 補正：床・天井・壁から傾きを自動で直し、廊下の向きを x 軸にそろえる（原点は元のファイルと同じ）
- 座標：クリックした点に番号付きの吹き出しを残す。原点は白い丸で表示
- 距離：2 点をクリックして測る。長さ・水平距離・高さの差を吹き出しと表で表示
- 色分け（高さ・反射・RGB・値）、断面・範囲の切り出し、天井を隠す
- 画像を保存：画面に映っているもの（吹き出しを含む）をそのまま PNG に

## 使い方
1. [Releases](../../releases) から自分の OS の配布物をダウンロードする
   - Windows：`LiDARViewer-<版>-portable.exe`（ダブルクリックで起動）か `-win-x64.zip`
   - Ubuntu：`.deb`（`sudo apt install ./LiDARViewer-<版>-amd64.deb`）か `.AppImage`
   - Raspberry Pi（64 bit）：`-arm64.deb` か `-arm64.AppImage`
   - macOS：`-mac-arm64.zip`（Apple シリコン）か `-mac-x64.zip`
2. 下のメニューの「ファイル」→「点群のファイル」で開く（画面へのドラッグでも開ける）

署名をしていないので、初回は Windows で「PC が保護されました」（「詳細情報」→「実行」）、macOS で「開発元を確認できません」（右クリック →「開く」）と出ます。ファイルの関連付けなどは [docs/HOW-TO-OPEN.md](docs/HOW-TO-OPEN.md) を見てください。

## 開発
```
npm install
npm start            # 画面を作って起動
npm run dist         # Windows（portable・zip）
npm run dist:linux   # Linux（deb・AppImage、x64・arm64）
npm run dist:mac     # macOS（zip）
NOSAMPLE=1 node build.mjs artifact   # 1 ファイルの試作ページ（dist-artifact/）
```
- `main.js`：Electron の起動・ファイルの受け渡し・画像の保存
- `src/app.js`：画面（three.js）／`src/worker.js`：読み込み・補正・点の選択（別スレッド）／`src/io/`：各形式の読み込み
- `live.js`：LiDAR（Livox MID-360）の直接表示と配信。0.4.1 では画面のボタンを隠している（`src/app.js` の `LIVE_ENABLED`）
- 試験：`tests/TESTING.md`、見つかった問題と直したこと：`tests/BUGS.md`

## 使用許諾
同梱しているライブラリの使用許諾は `build/THIRD_PARTY_LICENSES.txt` にあります。
