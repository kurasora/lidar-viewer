#!/usr/bin/env python3
# heavy_all.sh の結果（lifecycle.jsonl・sbx/）を、期待との比べ表にする
#   python3 -I summarize_runtime.py <heavy の出力フォルダ>  → <フォルダ>/runtime_summary.md
import sys, os, json, re

d = os.path.abspath(sys.argv[1])
rows = []

def row(cid, title, ok, detail, ref=''):
    rows.append((cid, title, 'PASS' if ok is True else ('FAIL' if ok is False else str(ok)), ref, detail))

# 期待（望ましい状態）。値がこれと違えば FAIL
WANT = {
    'basic.userDataName': (True, '設定の置き場所が ~/.config/LiDAR Viewer', ''),
    'basic.title': (True, '窓の題と document.title が LiDAR Viewer', ''),
    'basic.exitedQuickly': (True, '窓を閉じると 5 秒以内に終わる', ''),
    'basic.noLeftovers': (True, '終了後に子プロセスが残らない', ''),
    'basic.lockRemoved': (True, '終了後に Singleton* が消える', ''),
    'basic.wmClass': (True, 'WM_CLASS が lidar-viewer（deb の .desktop の StartupWMClass=lidar-viewer と一致）', ''),
    'second.secondExited': (True, '2 つ目はすぐ（10 秒以内に）終わる', ''),
    'second.eventFired': (True, '1 つ目で second-instance が 1 回起きる', ''),
    'second.restoredAndFocused': (True, '1 つ目の窓に restore と focus が呼ばれる', ''),
    'second.fileFromSecondOpened': (True, '2 つ目に渡したファイルが 1 つ目で開く', 'A10-010'),
    'argv.fileOpened': (True, 'コマンドラインで渡したファイルが開く', 'A10-010'),
    'closeLoading.exitedQuickly': (True, '読み込み中に閉じても 5 秒以内に終わる', ''),
    'closeLoading.noLeftovers': (True, '読み込み中に閉じても子プロセスが残らない', ''),
    'kill9.noOrphans': (True, '主プロセスを強制終了すると子も消える', ''),
    'kill9.relaunchOk': (True, '強制終了の後、同じ設定の置き場所ですぐ起動できる', ''),
    'netlog.noExternal': (True, '起動して 20 秒の間に外へ通信しない', ''),
    'menu.appMenuHasReload': (False, '既定のアプリのメニューに「再読み込み」がない（mac のメニューバー。mac で動かしたときだけ）', 'A10-012'),
    'menu.appMenuHasToggleDevTools': (False, '既定のアプリのメニューに「開発者ツール」がない（mac で動かしたときだけ）', 'A10-012'),
    'menu.windowMenuHidden': (True, 'Linux・Windows: 窓にメニューがない（再読み込み・開発者ツールのショートカットが届かない。mac は setupMacMenu で置き換え）', 'A10-012'),
    'roUserData.silentExit': (False, '設定の置き場所を作れないとき、何も言わずに終わらない', 'A10-019'),
    'rendererCrash.recovered': (True, '描画プロセスが落ちたら知らせを出し、「読み込み直す」で立ち直る', 'A10-020'),
    'rendererCrash.dialogShown': (True, '描画プロセスが落ちたら知らせ（読み込み直す／終了する）が出る', 'A10-020'),
    'migrate.settingsCarriedOver': (True, '旧 version（PCD Viewer）で変えた設定が新 version に引き継がれる', 'A10-017'),
    'migrate.singleInstanceAcrossVersions': (True, '旧 version と新 version は同時に動かない（ポートの取り合いを防ぐ）', 'A10-017'),
    'longTmpdir.started': (True, 'TMPDIR が長くても起動する（または理由を知らせる）', 'A10-019'),
}
# 直さないと決めたもの（tests/reports3/R15.md）。期待と違っても FAIL ではなく「既知」と書く
KNOWN = {
    'migrate.settingsCarriedOver': '旧 version 0.2.0（PCD Viewer）からの設定の引き継ぎはしない（A10-017 の計画どおり）',
    'migrate.singleInstanceAcrossVersions': '旧 version とは別の置き場所なので同時に動く（直さない）',
    'longTmpdir.started': 'TMPDIR が 107 文字を超えると Chromium が起動できない（環境の制約。直さない）',
}
lf = os.path.join(d, 'lifecycle.jsonl')
if os.path.exists(lf):
    for line in open(lf, encoding='utf-8'):
        try: j = json.loads(line)
        except Exception: continue
        sc = j.get('scene')
        if 'fatal' in j:
            row(sc, '場面の実行', False, j['fatal'][:200]); continue
        for k, v in (j.get('checks') or {}).items():
            key = f'{sc}.{k}'
            want, title, ref = WANT.get(key, (True, key, ''))
            if v != want and key in KNOWN: row(key, title, '既知', json.dumps(v) + ' … ' + KNOWN[key], ref); continue
            row(key, title, v == want, json.dumps(v), ref)

sb = os.path.join(d, 'sbx', 'sbx_result.txt')
if os.path.exists(sb):
    t = open(sb, encoding='utf-8').read()
    # 0.3.1 から deb の置き場所は空白のない /opt/LiDARViewer（B02）。空白のある置き場所（B・C）は、昔の作りの再現として参考に残す
    for name, want_alive in [('A_space_0755_userns_ok', 'yes'), ('B_space_0755_userns_ng', None), ('C_space_4755_userns_ng', None), ('D_nospace_4755_userns_ng', 'yes')]:
        m = re.search(rf'^{name}\s.*alive=(\w+)', t, re.M)
        ok = (m.group(1) == want_alive) if (m and want_alive) else ('参考' if m else None)
        row('sandbox.' + name, f'{name} で起動する' + ('' if want_alive else '（空白のある置き場所。今の deb は使わない）'), ok, (m.group(0)[:200] if m else 'なし'), 'A10-001')

with open(os.path.join(d, 'runtime_summary.md'), 'w', encoding='utf-8') as f:
    f.write(f'# 起動と終了の試験の結果（{d}）\n\n| 番号 | 期待 | 結果 | 報告 | 詳細 |\n|---|---|---|---|---|\n')
    for r in rows:
        f.write(f'| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {str(r[4])[:160].replace("|", "/")} |\n')
for r in rows:
    print(f'[{r[2]}] {r[0]} {r[1]} {r[3]}')
print('→', os.path.join(d, 'runtime_summary.md'))
