# bscenario.js の結果を判定する: python3 scen_check.py <data フォルダ> <場面の出力フォルダ>
import sys, os, json, base64, glob
import numpy as np
from scipy.spatial import cKDTree

DATA, OUT = sys.argv[1], sys.argv[2]
man = {c['id']: c for c in json.load(open(os.path.join(DATA, 'manifest.json')))}
dec = lambda s, dt: np.frombuffer(base64.b64decode(s), dt) if s else None


def err_vs(file_entry, cid):
    E = np.load(os.path.join(DATA, man[cid]['expect']))['P']
    A = dec(file_entry['P'], '<f8').reshape(-1, 3)
    d, i = cKDTree(E).query(A)
    return float(np.abs(A - E[i]).max()), len(A), len(E)


def load(name):
    fn = os.path.join(OUT, name + '.json')
    return json.load(open(fn)) if os.path.exists(fn) else None


res = []
def out(name, ok, msg):
    res.append({'scene': name, 'ok': ok, 'msg': msg}); print(f"[場面] {'OK' if ok else 'NG'} {name}: {msg}")


r = load('same_twice')
if r:
    s = r['steps'][1]; f = s['files']
    e = [err_vs(x, 'pcd/xyz_f4_bin')[0] for x in f]
    out('same_twice', len(f) == 2 and max(e) < 1e-5, f"ファイル {len(f)} 個 {[x['name'] for x in f]}、誤差 {e}、知らせ {s['msgs']}")
r = load('mixed_at_once')
if r:
    s = r['steps'][0]
    names = [(x['name'], x['n'], x['format']) for x in s['files']]
    out('mixed_at_once', len(s['files']) == 8 and not r['errors'], f"開けたもの {names}、知らせ {s['msgs'][-3:]}、ページのエラー {r['errors'][:2]}")
for nm, idx, cid in (('local_then_utm', 1, 'las/utm_1mm'), ('utm_then_local', 1, 'pcd/xyz_f4_bin'), ('local_utm_at_once', 1, 'las/utm_1mm')):
    r = load(nm)
    if not r: continue
    s = r['steps'][-1]
    if len(s['files']) < 2: out(nm, False, f"ファイルが {len(s['files'])} 個"); continue
    which = 1 if nm != 'utm_then_local' else 1
    e, na, ne = err_vs(s['files'][which], cid)
    out(nm, e <= 1e-3, f"2 つ目（{s['files'][which]['name']}）の最大誤差 {e*1000:.1f} mm（S.offset = {s['offset']}）")
r = load('close_then_utm')
if r:
    s = r['steps'][0]; e, _, _ = err_vs(s['files'][0], 'las/utm_1mm')
    out('close_then_utm', e <= 1e-3, f"閉じたあとの UTM の最大誤差 {e*1000:.3f} mm、S.offset = {s['offset']}")
for nm in ('utm_cloud_traj', 'local_cloud_traj'):
    r = load(nm)
    if not r: continue
    s = r['steps'][0]
    if not s['files'] or not s['trajs']: out(nm, False, f"点群 {len(s['files'])}・軌跡 {len(s['trajs'])}"); continue
    cmin, cmax = np.array(s['files'][0]['worldMin']), np.array(s['files'][0]['worldMax'])
    tmin, tmax = np.array(s['trajs'][0]['worldMin']), np.array(s['trajs'][0]['worldMax'])
    cc, tc = (cmin + cmax) / 2, (tmin + tmax) / 2
    dist = float(np.linalg.norm(cc[:2] - tc[:2]))
    out(nm, dist < 100, f"画面の座標での点群の中心 {cc.round(1).tolist()}・軌跡の中心 {tc.round(1).tolist()}（水平の距離 {dist:.1f} m、S.offset = {s['offset']}）")
r = load('traj_via_fileinput')
if r:
    s = r['steps'][0]
    out('traj_via_fileinput', len(s['trajs']) == 1 or (not s['files']), f"点群 {[(x['name'], x['n'], x['format']) for x in s['files']]}・軌跡 {[(t['name'], t['count']) for t in s['trajs']]}・S.offset {s['offset']}・知らせ {s['msgs']}")
r = load('drop_traj_and_cloud')
if r:
    st = r['steps']
    k = lambda s: f"点群 {[(x['name'], x['n']) for x in s['files']]} 軌跡 {[(t['name'], t['count']) for t in s['trajs']]} 知らせ {s['msgs'][-2:]}"
    ok = len(st) == 3 and len(st[0]['trajs']) == 1 and len(st[1]['files']) == 1 and len(st[2]['files']) == 1
    out('drop_traj_and_cloud', ok, ' ｜ '.join(k(s) for s in st))
r = load('drop_misdetect')
if r:
    st = r['steps']
    ok = all(len(s['files']) == 1 and not s['trajs'] for s in st)
    out('drop_misdetect', ok, ' ｜ '.join(f"{s.get('dropped')}: 点群 {[(x['name'], x['n']) for x in s['files']]} 軌跡 {[(t['name'], t['count']) for t in s['trajs']]} 知らせ {s['msgs'][-1:] }" for s in st))
r = load('tall_then_next')
if r:
    st = r['steps']
    out('tall_then_next', len(st) == 2 and len(st[1]['files']) == 2 and not r['errors'], f"1 つ目の後: ファイル {len(st[0]['files'])}・知らせ {st[0]['msgs']}／2 つ目の後: ファイル {[x['name'] for x in st[1]['files']]}・知らせ {st[1]['msgs']}・進み具合の表示が消えている={st[1]['progressHidden']}／ページのエラー {r['errors'][:2]}")
r = load('error_sequence')
if r:
    out('error_sequence', True, ' ｜ '.join(f"{[x['name'] for x in s['files']]}: {s['msgs']}" for s in r['steps']))
r = load('multi_with_errors')
if r:
    s = r['steps'][0]
    out('multi_with_errors', all(any(n in m for n in ('points0', 'points_more')) for m in s['msgs'] if m.startswith('[赤]')), f"開けたもの {[x['name'] for x in s['files']]}、知らせの移り変わり {s['msgs']}、最後 {s['msg']!r}")
r = load('bin_with_obj')
if r:
    s = r['steps'][0]
    names = [x['name'] for x in s['files']]
    out('bin_with_obj', 'cc_cloud.bin' in names, f"開けたもの {names}（選んだもの cc_cloud.bin, cc_mesh.obj, pcl_binary.pcd）、知らせ {s['msgs'][-3:]}")
r = load('html_field_name')
if r:
    s = r['steps'][0]; inj = s.get('inject', {})
    out('html_field_name', inj.get('anyH1', 0) == 0, f"ページの中の h1 の数 {inj.get('anyH1')}（情報の中 {inj.get('infoH1')}）、欄の選択肢の HTML {inj.get('fieldSelHtml', '')[:160]!r}")
r = load('no_extension')
if r:
    s = r['steps'][0]
    out('no_extension', True, f"開けたもの {[x['name'] for x in s['files']]}、知らせ {s['msgs']}")
r = load('small_cloud_message')
if r:
    s = r['steps'][0]
    out('small_cloud_message', not any(m.startswith('[赤]') for m in s['msgs']), f"知らせの移り変わり {s['msgs']}（最後: {s['msg']!r}）")
json.dump(res, open(os.path.join(OUT, 'summary.json'), 'w'), ensure_ascii=False, indent=1)
