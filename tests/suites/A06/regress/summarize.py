#!/usr/bin/env python3
# A06 の再試験の結果を「OK / NG / ?（結果なし）」で一覧にする: python3 summarize.py <A06 の作業フォルダ>
#   NG = 今回の報告で見つけた問題がまだ残っている、OK = 直っている（または問題なし）
import json, os, sys, glob, re
W = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
O = W + '/out'
def load(n):
    try: return json.load(open(f'{O}/{n}'))
    except Exception: return None
def text(n):
    try: return open(f'{O}/{n}', encoding='utf8').read()
    except Exception: return None
rows = []
def chk(id_, title, ok, detail=''):
    rows.append((id_, 'OK' if ok is True else 'NG' if ok is False else '? ', title, detail))

t = load('tooltip_app.json')
if t:
    n = sum(len(s['tooltips']) for s in t['states']) + sum(len(p['tooltips']) for p in t['popups'])
    dom = [d for d in t['domTitles'] if d['titleAttr'] or d['svgTitle'] or d['xlinkTitle'] or d['visibleFile'] or d['abbr']]
    chk('吹き出し', '本物のマウスで吹き出しが 1 つも出ない', n == 0 and not dom, f'{sum(s["targets"] for s in t["states"])} か所・吹き出し {n}・DOM {len(dom)}')
else: chk('吹き出し', '本物のマウスで吹き出しが 1 つも出ない', None)
c = text('tooltip_control.log')
chk('吹き出し(対照)', '陽性対照（title 等）で吹き出しを検出できる', (c.count('"override": true') >= 4) if c else None)
cp = text('tooltip_colorpicker.log')
chk('吹き出し(色)', '色の選択画面に吹き出しが出ない', ('"tooltip": [\n' not in cp and '"windows"' not in cp.split('"hits"')[1]) if cp and '"hits"' in cp else None)

ms = [load(os.path.basename(f)) for f in sorted(glob.glob(f'{O}/matrix_chromium_*.json'))]
ms = [m for m in ms if m]
if ms:
    trunc = [m['tag'] for m in ms if any(i['kind'].startswith('省略') and 'statMsg' in i.get('el', '') for r in m['res'] for i in r.get('issues', []))]
    chk('A06-001', '右上の知らせが「…」で切れない', not trunc, ','.join(trunc))
    wrap = [m['tag'] for m in ms if any(i['kind'] == '折り返し' and ('大きさの決め方' in i['el'] or '読み込む最大点数' in i['el']) for r in m['res'] for i in r.get('issues', []))]
    chk('A06-011', '「表示」のラベルが語の途中で折れない', not wrap, ','.join(wrap))
    ov = [m['tag'] for m in ms if any(i['kind'] == '重なり' for r in m['res'] for i in r.get('issues', []))]
    chk('A06-010', '箱どうしの重なりがない（900×600 の操作の案内など）', not ov, ','.join(ov))
    out = [m['tag'] for m in ms if any(i['kind'] in ('画面外', 'カードが横にスクロール', '横に切れ', '箱からはみ出し') for r in m['res'] for i in r.get('issues', []))]
    chk('崩れ', '画面外・横スクロール・切れがない', not out, ','.join(out))
else: chk('A06-001', '右上の知らせが「…」で切れない', None)

for nm in ('keyboard_chromium.json', 'keyboard_electron.json'):
    k = load(nm)
    tag = nm.split('_')[1].split('.')[0]
    if not k: chk('A06-002', f'修飾キーでショートカットが動かない（{tag}）', None); continue
    bad = [m['combo'] for m in k['mod'] if m['changed'] and m['combo'].startswith('Control')]
    chk('A06-002', f'修飾キーでショートカットが動かない（{tag}）', not bad, ' '.join(bad))
    esc = [e['case'] for e in k['esc'] if not e['closed']]
    chk('A06-007', f'Esc でカードが閉じる（フォーカスの場所によらず）（{tag}）', not esc, '、'.join(esc))
    chk('A06-008', f'閉じたあとフォーカスがドックのボタンに戻る（{tag}）', k['focus_after_close_button']['d'] != 'body', k['focus_after_close_button']['d'])
    chk('A06-009', f'矢印キーでラジオを選べる（{tag}）', k['arrow_radio']['mapMode'] != '1', k['arrow_radio']['focus'])
    chk('A06-009', f'矢印キーで 3D の視点が動く（{tag}）', k['arrow_camera']['before'] != k['arrow_camera']['after'])
    if tag == 'electron':
        m0 = next((m for m in k['mod'] if m['combo'] == 'Control+c'), None)
        if m0: chk('A06-019', '天井のない点群で「天井を表示しています」と出ない', not ('天井を表示' in m0['msg'] and not m0['ceilFound']), m0['msg'])

pe = text('pe_info.txt')
chk('A06-003', 'Windows の exe の版情報・アイコンが LiDAR Viewer', ("'ProductName': 'Electron'" not in pe) if pe else None)
e = load('electron_misc.json')
if e:
    chk('A06-004', '起動時に白い画面が出ない（背景色の指定）', e['win'].get('bg', '').upper() != '#FFFFFF' and not any(s['dominant'].startswith('(24') for s in e['startup']), e['win'].get('bg'))
    chk('A06-005', '保存を取り消したとき「保存しました」と出ない', e['saveMsgAfterCancel'] != '画像を保存しました', e['saveMsgAfterCancel'])
    chk('A06-005', '保存の画面の題名が data: で始まらない', not any(w['name'].startswith('data:') for w in e['windowsAfterSave']))
    chk('A06-006', '画像の保存名が旧名（pcd_）でない', not (e.get('download') or {}).get('filename', '').startswith('pcd_'), (e.get('download') or {}).get('filename'))
    chk('窓', '題名が LiDAR Viewer', e['win']['title'] == 'LiDAR Viewer' and e['docTitle'] == 'LiDAR Viewer')
    chk('窓', '最小の大きさ 900×600 が守られる', e['afterSetSmall']['size'] == [900, 600])
    chk('A06-025', 'Ctrl+＝ / Ctrl+− で文字を大きくできる', e['zoom']['afterKeys'] != e['zoom']['before'])
th = load('theme_electron.json')
chk('テーマ', 'OS の明るい/暗いで見た目が同じ（いつも暗い）', all(v == '0' for v in th['diff'].values()) if th else None)
for d in ('1', '2'):
    s = load(f'scroll_slider_d{d}.json')
    chk('つまみ', f'スクロールバー・つまみが操作どおり動く（DPR {d}）', (s['afterDrag'] > 0 and s['afterWheel'] > s['afterDrag'] and s['sliderAfterDrag']['v'] != '2' and s['sliderEnd']['v'] == '12') if s else None)
mg = load('messages.json')
if mg:
    r = {x['step']: x for x in mg['res']}
    s = r.get('「反射」のまま最後のファイルを閉じる')
    if s: chk('A06-030', '最後のファイルを閉じたとき的外れな知らせが出ない', not s['log'], ' → '.join(s['log']))
    s = r.get('「反射」を押す（label もあるファイル）')
    if s: chk('A06-031', '「反射」で intensity の色分けになる', s['field'] == 'intensity', s['field'])
    s = r.get('ファイルなしで「反射」を押す')
    if s: chk('A06-030', 'ファイルなしで「反射」を押しても「この点群には…」と出ない', not any('この点群' in x for x in s['log']), ' → '.join(s['log']))
ln = load('longnames_1280x800.json')
if ln:
    pr = ln['cases'][0].get('prog') or {}
    chk('A06-032', '読み込み中の表示から長い名前がはみ出さない', not pr or pr.get('textW', 0) <= pr.get('boxW', 9999), str(pr)[:160])
    lo = ln.get('legendOverflow') or {}
    chk('A06-032', '空白のない長い名前で色のカードが横にあふれない', lo.get('popSW', 0) <= lo.get('popCW', 0) + 1, str(lo))
    mq = ln.get('mixedQueue') or {}
    chk('A06-029', '誤りの知らせが次のファイルの知らせで消えない', '[赤]' in ' '.join(mq.get('log', [])[-1:]) or '開けません' in mq.get('final', ''), mq.get('final'))
mc = load('misc_chromium.json')
if mc:
    chk('A06-033', 'DPR が変わったら 3D 画面の解像度も変わる', mc['dpr_after']['canvas'][0] == mc['dpr_after']['css'][0] * mc['dpr_after']['dpr'], f"{mc['dpr_before']} → {mc['dpr_after']}")
    ns = mc.get('noteStyle')
    if ns: chk('A06-038', '情報の注記が淡い色', ns['color'] != ns['ddColor'], str(ns))
m2 = load('misc2.json')
if m2:
    mr = m2.get('mlive_right')
    if isinstance(mr, dict): chk('A06-037', '測定中の長さの表示が右端で切れない', mr['rect'][2] <= mr['vw'], str(mr))
    mb = m2.get('mlive_bottom')
    if isinstance(mb, dict): chk('A06-037', '測定中の長さの表示がドックに隠れない', mb['rect'][3] <= mb['dockTop'], str(mb))
    chk('A06-010', '900×600 で距離の案内と右上の知らせが重ならない', not m2.get('guide_vs_msg'), str(m2.get('guide_vs_msg'))[:200])
bs = load('backspace.json')
if bs: chk('A06-036', '線が見えないとき Delete / Backspace で測った線が消えない', bs['afterBackspace'] == bs['measuredBefore'], str(bs))
if ln:
    mq = ln.get('mixedQueue') or {}
    chk('A06-028', '自動の水平補正ができないとき赤い誤りにならない', not any('水平補正できませんでした' in x for x in mq.get('log', [])), '')
ds = load('dual_stuck.json')
if ds:
    c = ds['color']
    chk('A06-035', '2 つつまみが左端で重なっても右へ動かせる', c['dragRightFromLeftEnd']['hi'] > 0 or c['dragRightFromLeftEnd']['lo'] > 0, str(c['dragRightFromLeftEnd']))
    chk('A06-035', '2 つつまみが真ん中で重なっても右へ動かせる', c['dragRightFromMet']['hi'] > 500, str(c['dragRightFromMet']))
for idd, st, title, det in rows:
    print(f'[{st}] {idd:12s} {title}' + (f'  … {det}' if det else ''))
