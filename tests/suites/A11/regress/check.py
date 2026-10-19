# A11 の再試験の判定: regress/out の結果を読み、問題ごとに「再現する（直っていない）／直った／判定できない」を出す
#   使い方: python3 check.py [out のフォルダ]
import json, os, re, sys

O = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
rows = []


def put(fid, title, state, why):
    rows.append((fid, title, state, why))


def jl(name):
    p = os.path.join(O, name)
    if not os.path.exists(p): return None
    return [json.loads(l) for l in open(p) if l.strip()]


def browser(label):
    for d in jl('browser.jsonl') or []:
        if d['label'] == label: return d
    return None


def txt(name):
    p = os.path.join(O, name)
    return open(p).read() if os.path.exists(p) else None


def check(fid, title, fn):
    try:
        st, why = fn()
    except Exception as e:  # 結果がない・形が違う
        st, why = '判定不能', f'{type(e).__name__}: {e}'
    put(fid, title, st, why)


BUG, OK = '再現（直っていない）', '直った'


def a001():
    d = browser('pick/ceiling_top')['result']
    zs = [h['hit']['world'][2] for h in d['top'] if h['hit']]
    hidden = [z for z in zs if z > 2.0]
    return (BUG if d['hideCeil'] and hidden else OK), f"天井を隠した状態で床を狙った {len(zs)} 回のうち {len(hidden)} 回が z>2 の点（world z={[round(z, 3) for z in zs]}）"


def a002():
    d = browser('display/utm_room_f8')['result']
    p = d['picks'][0]
    box = re.findall(r'[XYZ]([-0-9.]+)', p['box'].replace(' ', ''))
    shown = [float(v) for v in box[:3]]
    orig = [p['hitLocal'][k] + d['offset'][k] for k in range(3)]
    err = max(abs(shown[k] - orig[k]) for k in range(3))
    return (BUG if err > 0.01 else OK), f"吹き出し {shown} / 元の座標 {[round(v, 3) for v in orig]}（最大の差 {err:.3f} m）"


def a003():
    d = browser('range/pcl_binary')['result']
    s = [v for v in d['info'] if v.startswith('範囲 x')][0]
    a, b = [float(v) for v in re.findall(r'(-?[0-9.]+) 〜 (-?[0-9.]+)', s)[0]]
    err = max(abs(a - (-4.3512)), abs(b - 28.6278))
    return (BUG if err > 0.05 else OK), f"表示 {s}（本当は -4.35 〜 28.63、差 {err:.2f} m）"


def a004():
    d = browser('display/utm_room_f8')['result']
    clipx = d['dval'][2]
    return (BUG if not clipx.startswith('5390') else OK), f"切り出し x のつまみの表示 '{clipx}'（情報の範囲は 539033〜）"


def a005():
    d = browser('display/utm_room_f8')['result']
    m = re.search(r'床の高さ ([-0-9.]+) m', d['levelResult'])
    z = float(m.group(1))
    return (BUG if abs(z - 30.0) > 0.5 else OK), f"床の高さの表示 {z} m（ファイルの床は約 30 m）"


def a006():
    t = txt('shift.txt')
    m = re.search(r'"name":"a2[^"]*","offset":\[[^\]]*\],"maxErr_mm":([0-9.]+)', t)
    e = float(m.group(1))
    return (BUG if e > 1 else OK), f"UTM の点群で先頭が (0,0,0) のときの最大誤差 {e} mm"


def a007():
    d = browser('ceil/c_below')['result']
    return (BUG if d['totalHidden'] > 0.5 else OK), f"床の下に下の階があるとき、隠れる点 {100 * d['totalHidden']:.1f}%（ceilZ={d['ceilZ']}）"


def a008():
    d = browser('ceil/c_2story')['result']
    band = {s.split(':')[0]: s for s in d['hiddenByFileZ']}
    s1, s2 = band.get('2〜2.8', ''), band.get('2.8〜3.5', '')
    bug = s1.startswith('2〜2.8: 0%') and s2.startswith('2.8〜3.5: 100%')
    return (BUG if bug else OK), f"2 階建て: {s1} / {s2}"


def a009():
    rows_ = {r['file']: r for r in jl('sweep_raw.jsonl')}
    chk = json.load(open(os.path.join(O, 'sweep_check.json')))
    up = json.load(open(os.path.join(O, 'level_check.json')))
    e40 = chk['sw40']['up_err']; eu = up['upside']['up_err']
    bug = (e40 > 5 and 'error' not in rows_['sw40.pcd']) or eu > 90
    return (BUG if bug else OK), f"傾き 40°: 上向きの誤差 {e40:.1f}°（回転を当てた）、上下逆: {eu:.1f}°"


def a010():
    rows_ = {r['file']: r for r in jl('level_raw.jsonl')}
    e = rows_['sparse030.pcd'].get('error')
    return (BUG if e else OK), f"点の少ない部屋の自動補正: {e}（画面では赤い知らせ）"


def a011():
    t = txt('pickfar.txt')
    sec = t.split('== room_far.pcd')[1]
    ms = [int(x) for x in re.findall(r'\) (\d+) ms', sec)]
    bad = 'maximum size' in sec or max(ms) > 3000
    return (BUG if bad else OK), f"遠い外れ値のある点群で、何もない所の選択 {ms} ms{'、Set の上限で失敗' if 'maximum size' in sec else ''}"


def a012():
    t = txt('bigimg.txt')
    if t is None: return '判定不能', 'bigimg.txt なし（bigmem で t_bigimg.mjs を流す）'
    bad = 'Map maximum size exceeded' in t
    return (BUG if bad else OK), ('1,764 万画素の画像で Map の上限の例外' if bad else '例外なし')


def a013():
    t = txt('spacing.txt')
    line = [l for l in t.splitlines() if l.startswith('sp_dem30')][0]
    return (BUG if 'app=None' in line else OK), line.strip()


for fid, title, fn in [
    ('A11-001', '隠した天井の点を選ぶ', a001), ('A11-002', '座標が補正後＋シフトの混ざった値', a002),
    ('A11-003', '範囲が 1%＋1cm 広い', a003), ('A11-004', 'シフトを足す所と足さない所が混在', a004),
    ('A11-005', '床の高さがシフトしだい', a005), ('A11-006', 'シフトを最初の点で決める', a006),
    ('A11-007', '床下の面で主の階が消える', a007), ('A11-008', '2 階建てで 2 階が消える', a008),
    ('A11-009', '水平補正が誤った回転を当てる', a009), ('A11-010', '自動補正の失敗が赤い知らせ', a010),
    ('A11-011', '遠い外れ値で選択が止まる', a011), ('A11-012', '1678 万点超で索引が作れない', a012),
    ('A11-013', '点の間隔が計算中のまま', a013),
]:
    check(fid, title, fn)

w = max(len(r[1]) for r in rows)
for fid, title, st, why in rows:
    print(f'{fid}  {st:12s}  {title}\n          {why}')
print()
print('まとめ:', {s: sum(1 for r in rows if r[2] == s) for s in (BUG, OK, '判定不能')})
