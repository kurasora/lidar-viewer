# LiDAR Viewer の試験のしかた（次回の再試験用）

2026-10-17 の総合試験で作った道具・手順・分かったことのまとめ。実験室で実機の確認が終わったあと、同じ試験をもう一度行うときに使う。

## フォルダ
| 場所 | 中身 |
|---|---|
| `tests/BUGS.md` | 見つかった問題の一覧（重複を統合。B01〜B94） |
| `tests/reports/A01〜A14.md` | 担当ごとの詳しい報告（再現手順・場所・直し方の案・問題なかった項目・実機で確かめること） |
| `tests/suites/A01〜A14/` | 担当ごとの試験スクリプト。多くは `regress/run.sh` 1 本で流せる |
| `tests/env/` | 共通の道具（`bin/light` `heavy` `bigmem` `guard` `mknet` `rmnet` `mkcopy`、`harness/read.mjs` `browser_read.js` `electron_app.js`、共通の決まり `README.md`） |

## 担当と観点（使った試験技法）
| 担当 | 観点 | 技法 |
|---|---|---|
| A01 | 点群の形式（PCD・LAS/LAZ・E57・PLY・PTX・文字・SBF・BIN・軌跡） | 同値分割・境界値・正解（laspy/pye57/CloudCompare）との比較 |
| A02 | メッシュ・CAD・画像（OBJ・STL・VTK・glTF・DXF・SHP・IFC・STEP・Draco・TIFF・画像） | 同値分割・仕様の変種 |
| A03 | 壊れた入力（約 5,900 件） | 変異ファジング・構造を意識した改ざん |
| A04 | 関数単位（util・sink・pcd・各形式・worker の計算） | 命令/分岐網羅（c8）・単体試験・統計的検定 |
| A05 | 画面の機能 | 状態遷移・デシジョンテーブル・ユースケース |
| A06 | 見た目・アクセシビリティ・文言 | 画面の大きさ・テーマ・対比の計算・キーボード操作 |
| A08 | セキュリティ | STRIDE の脅威分析・概念実証 |
| A09 | 性能・メモリ | 負荷・耐久・リーク測定 |
| A10 | 配布物・起動と終了 | 配布物の点検・実起動 |
| A11 | 計算と数値 | numpy/scipy による独立の正解との比較 |
| A12 | コードレビュー | 静的解析（eslint・tsc --checkJs）＋再現 |
| A13 | 試作ページ | claude.ai の枠（別オリジンの iframe・sandbox・CSP）の再現 |
| A14 | ユーザーの立場の探索的試験 | セッション型探索・ツアー・エラー推測 |

## 環境の準備（Linux。コンテナでも PC でも）
- Node 22、Playwright（Chromium）、xvfb（Electron 用）、CloudCompare（正解に使う）、Python: numpy laspy lazrs pye57 plyfile trimesh ezdxf pyshp ifcopenshell gmsh DracoPy tifffile Pillow scipy pandas
- `tests/env/README.md` の T・パスは前回のコンテナのもの。使う前に、`tests/env/bin/*` と各 `run.sh` の中のパス（`/tmp/claude-0/.../testenv`、`/home/claude/pcd-viewer`）を今の場所に置き換える
- 同時実行は見張り付きの入口で: `light`（Node・小さなもの）、`heavy`（Chromium・Electron）、`bigmem`（大きなファイル）。メモリ 7 GB・2 CPU では heavy を 2 つまでにしないと落ちる

## はまりどころ
- `pkill -f` は自分のシェルや別の試験まで止める。PID を控えて止める
- Electron は `PCDV_USERDATA` を 1 台ずつ別にしないと、2 台目が二重起動として即終了する
- Node では LAZ・Draco・IFC・PNG などの画像を読めない（wasm の作り・createImageBitmap）。それらは `browser_read.js` で
- SwiftShader（GPU なし）は描画がとても遅い。速さの数字は参考値
- `xvfb-run -a` を同時に使うときは `-n` で番号をずらす
- 元のプロジェクトを読み取り専用でマウントしておくと、うっかり書き換えを防げる（`mount --bind` → `mount -o remount,bind,ro`）

## 次回（実機の確認のあと）にすること
1. `BUGS.md` で「直した」ものを、各担当の `regress/run.sh` で再現しなくなったか確かめる（回帰試験）
2. 途中で切り上げた担当（A01・A02・A04・A05・A06・A09・A10・A11・A13・A14）は、報告の「計画」のうち未実施の観点を続ける。特に A13（試作ページ）はほとんど未実施
3. 実機で確かめること（各報告の「実機で次回確かめるべきこと」）:
   - Ubuntu 24.04・Raspberry Pi 5: 起動できるか（B02・B23）、GPU・WebGL2 の速さ
   - セキュリティの修正（`tests/fixlog/K.md`、0.4.2）のあと、前は動いていたものが動くか。Windows と Linux の両方で:
     - 「点群のファイル」「軌跡のファイル」のボタンで選んだファイルが、選ぶ画面 1 回で開くか（許可を全部断っていたため、もう一度選ぶ画面が出ていた。b6e1199 で直した）
     - ファイルのダブルクリック・「プログラムから開く」（関連付け）で開けるか（Windows は未確認）
     - STEP・IFC が開けるか（別スレッドの起動のしかたを変えた。Windows は未確認）
     - OBJ＋MTL、glTF＋.bin、SHP＋SHX＋DBF を一緒に選んで開けるか（DAE・FBX の模様の画像は、一緒に選んだものしか読まない仕様にした）
     - ドラッグ＆ドロップで開く・画像の保存・設定の保存が今までどおりか
   - Mac（GitHub の Mac で作ったもの）: 起動は確かめた。ファイルを開くところまでは未確認（改ざん防止の fuse を入れた）

## 0.4.1 での変更（2026-10-18）
- 第 2 回の試験の報告は `tests/reports2/`（R1〜R9）。修正の記録は `tests/BUGS.md` の「0.4.1」
- 画面が大きく変わったので、前回の試験スクリプトのうち次の前提は古い:
  - 座標は 1 つだけ・メニューを閉じると消える → 今は番号付きで何個でも残る（`window.__pcd.S.pins`）
  - 「開く」「視点」「表示」のボタン → 「ファイル」「表示」（`data-open="open"` `data-open="view"`。`display` はない）
  - 「座標は元のファイルの座標で出す」「床を z = 0」のチェック → 隠した（補正しても原点は変わらない）
- 試作ページはサンプルの点群を入れずに作る: `NOSAMPLE=1 node build.mjs artifact`（入れると 14.6 MB、外すと 6.7 MB）
