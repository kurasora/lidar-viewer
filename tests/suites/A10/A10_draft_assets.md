
## 試験の資産（次回の再試験のために）

### まとめて流す: `$W/regress/run.sh`
```
bash $W/regress/run.sh /home/claude/pcd-viewer/release --old /home/claude/release-archive/release-0.2.0
#   --static-only（静的な点検だけ。light で数分）／--runtime-only（起動と終了・ライブ・サンドボックス。heavy で約 10 分）
#   --parts "lifecycle live sandbox"（heavy の部分を絞る）
# 出力: $W/regress/out/<日時>/static/summary.md（PASS/FAIL の表）と runtime_summary.md
```
新しい配布物では、表の FAIL が今回の報告の番号（A10-xxx）と結び付いているので、直ったかどうかがそのまま分かる（今回の配布物では FAIL になるように「望ましい状態」を期待値にしてある）。

### 個別のスクリプト（すべて `$W/regress/`）
| ファイル | 中身 | 使い方 |
|---|---|---|
| `static_checks.py` | 配布物の静的な点検の本体（R01〜R15: 一覧・asar の同一性と中身・exe の版情報とアイコン・deb の control/依存/postinst/アイコン/.desktop・AppImage の runtime と中の CPU と 16K 整列・mac の Info.plist/署名/UUID/zip の記号リンク・fuse） | `light python3 -I static_checks.py <release> [--old <旧版>] [--out <dir>]` |
| `asar_check.js` | app.asar の一覧・node_modules・ソースマップ・開発用ファイル・package.json・完全性の値・旧名の出現 | `node asar_check.js <app.asar> [埋め込みの完全性の値]` |
| `pe_info.py` | PE の版情報・アイコン（.ico に書き出し）・マニフェスト・資源・署名 | `PYTHONPATH=$W/pylib python3 -I pe_info.py <exe> [アイコンの出力先]` |
| `mac_sig_check.py` | Linux 上での ad-hoc 署名の点検（全 Mach-O のページ指紋、Info.plist/CodeResources の特別な枠、files2 の指紋・記号リンク・入れ子の cdhash、LC_UUID、CPU、最小 OS）。rcodesign の verify は ad-hoc で誤った結果を出すため自作 | `python3 -I mac_sig_check.py "<…/LiDAR Viewer.app>"` |
| `fuses.py` | Electron の fuse の読み取り | `python3 -I fuses.py <バイナリ>...` |
| `gtk_icon_lookup.py` | GTK3 の icon theme で .desktop の Icon 名が見つかるか | `python3 -I gtk_icon_lookup.py lidar-viewer <展開した usr/share>` |
| `deb_md5_check.py` | deb の md5sums と中身の突き合わせ | `python3 -I deb_md5_check.py <x.deb>...` |
| `linux_sandbox_test.sh` + `nouserns.c` | deb と同じ /opt に置いて、一般ユーザー・user 名前空間なし（Ubuntu 24.04 相当）で起動する 6 通りのデシジョンテーブル | `heavy xvfb-run -a -n 200 -s "-ac -screen 0 1280x800x24" bash linux_sandbox_test.sh <linux-unpacked> <出力>` |
| `arm64_appimage_qemu.sh` | arm64 の AppImage の runtime を qemu-user で動かす（libz.so の再現） | `light bash arm64_appimage_qemu.sh <arm64.AppImage>...` |
| `lifecycle.js` | 起動と終了の場面（basic・second・argv・closeLoading・kill9・keys・netlog・menu・fonts・roUserData・rendererCrash・migrate・longTmpdir） | `heavy xvfb-run -a -n 200 node lifecycle.js [場面...]`（TMPDIR は短く） |
| `live_lifecycle.sh` + `live_lifecycle.js` | netns 3 台（にせ MID-360・配信する側・見る側）で、配信中に閉じる・起動し直す・2 つ同時に開く | `MEM=3000 heavy bash live_lifecycle.sh` |
| `heavy_all.sh` | heavy の部分をまとめて 1 回で流す | `MEM=3000 TIMEOUT=1800 heavy bash heavy_all.sh <release> lifecycle live sandbox` |
| `summarize_runtime.py` | heavy の結果を期待との比べ表に | `python3 -I summarize_runtime.py $W/run/heavy_latest` |
| `x11_windows.py` | X の窓の WM_CLASS・名前・PID・アイコンの大きさ | `PYTHONPATH=$W/pylib python3 -I x11_windows.py` |
| `gen_big_pcd.py` | 読み込み中に閉じる試験用の大きな PCD（800 万点、96 MB） | `python3 -I gen_big_pcd.py $W/data/big8m.pcd 8000000` |

### 生成した試験用ファイル
- `$W/data/big8m.pcd`（800 万点の binary PCD、`gen_big_pcd.py` で再生成できる）
- `$W/data/fc/nocjk.conf`（日本語のフォントがない環境をまねる fontconfig。DejaVu だけ）
- `$W/tools/`（qemu-user-static と arm64 の glibc を `apt-get download` + `dpkg-deb -x` で展開したもの。全体の環境は変えていない）
- 証拠: `$W/evidence/`（サンドボックスの各場合のログ）、`$W/logs/`（PE・asar・署名の点検の JSON）、`$W/ex/exe/icons_*`（exe のアイコンの PNG）、`$W/run/heavy_latest/`（起動と終了・ライブの結果・写真）

### 環境のはまりどころ・コツ
- **TMPDIR を `$W/tmp` にすると Electron が起動直後に終わる**（Playwright では「Process failed to launch!」）。Chromium の二重起動防止のソケット `$TMPDIR/.org.chromium.Chromium.XXXXXX/SingletonSocket` が UNIX ソケットの上限（107 文字）を超えるため（`$W/tmp` だと 142 文字）。短い記号リンク `/tmp/a10t → $W/tmp/e` を TMPDIR にした（`heavy_all.sh` が作り、`run.sh` の最後に消す）。ほかの担当も `TMPDIR=$W/tmp` で Electron を動かすと同じことが起きる
- bigmem の実行が続くと light/heavy は長く待たされる（今回は 1 時間以上）。Bash の 2 分の時間切れを避けるため、`$W/bin/bgrun <名前> <コマンド>` で裏で動かし、`$W/bin/bgwait <名前>` で待った
- root では Chromium のサンドボックスを試せない（`--no-sandbox` が必須）。サンドボックスの試験は一般ユーザー（claude, uid 999）で、`$W` はその利用者から見えないので、専用のマウント名前空間で `$W/run/.../opt` を `/opt` に重ねて deb と同じ `/opt/LiDAR Viewer` を再現した。Ubuntu 24.04 の user 名前空間の制限は、seccomp で CLONE_NEWUSER を拒否してまねた（no_new_privs を立てないので SUID の chrome-sandbox は効く）
- rcodesign 0.29 の `verify` は ad-hoc 署名で「CMS error: missing further values」と誤って失敗する（本人も「buggy」と表示）。`mac_sig_check.py` で代わりに点検した
- arm64 の AppImage は x64 の runtime の後ろに arm64 の squashfs をつないだファイルを作ると `--appimage-extract` で取り出せる（`static_checks.py` の `appimage_extract`）
- ports.ubuntu.com・deb.debian.org は proxy で拒否される。arm64 の glibc は amd64 の archive にある `libc6-arm64-cross`（Architecture: all）から取った
- xvfb には窓の管理（WM）がないので、最小化・前に出すの見た目は試せない。second-instance の処理は BrowserWindow の restore/focus が呼ばれるかで確かめた

### 実機（本物の MID-360・実験室の LAN・Windows/mac/Pi の実機）で次回確かめるべきこと
「実機で人が確かめる手順」の L-1〜L-6・W-1〜W-6・M-1〜M-6 を参照（`$W/regress/manual_checks.md` に同じ一覧）。特に L-1（Ubuntu 24.04 で起動するか）、L-5（Pi 5 の GPU と 16K ページ）、W-3（ファイアウォールで点が 0 点/秒にならないか）、M-3（macOS 15 のローカルネットワークの許可）は、直した版でも必ず確かめる。
