# 結果（*.jsonl）をまとめて、試験ごとの合否の表を出す
#   使い方: python3 summarize.py <出力フォルダ> [--md 表.md]
#   既知の問題（known.json の id → 報告の ID）と照らして「既知の失敗」「新しい失敗」「直った」を分ける
import json, sys, os, glob, collections

d = sys.argv[1]
md = sys.argv[sys.argv.index('--md') + 1] if '--md' in sys.argv else None
HERE = os.path.dirname(os.path.abspath(__file__))
known = json.load(open(os.path.join(HERE, 'known.json'))) if os.path.exists(os.path.join(HERE, 'known.json')) else {}
cases = {c['id']: c for c in json.load(open(os.path.join(HERE, 'data', 'cases.json')))}
res = collections.defaultdict(dict)
for f in sorted(glob.glob(os.path.join(d, '*.jsonl'))):
    for line in open(f, errors='replace'):
        try: r = json.loads(line)
        except Exception: continue
        if 'id' not in r: continue
        mode = r.get('mode', 'node')
        res[r['id']][mode] = r
modes = ['node', 'browser', 'electron', 'artifact']
rows, new_fail, fixed, known_fail = [], [], [], []
for cid in sorted(res):
    k = known.get(cid)
    cells = []
    for m in modes:
        r = res[cid].get(m)
        if not r: cells.append('-'); continue
        cells.append('OK' if r['ok'] else 'NG')
        if not r['ok'] and not k: new_fail.append((cid, m, r['bad']))
        if not r['ok'] and k: known_fail.append((cid, m, k))
        if r['ok'] and k: fixed.append((cid, m, k))
    bad = next((r['bad'] for r in res[cid].values() if not r['ok']), [])
    rows.append((cid, cells, k or '', '; '.join(bad)[:160], cases.get(cid, {}).get('desc', '')))
out = ['| 試験 | Node | Chromium | Electron | 試作 | 既知 | 食い違い | 内容 |', '|---|---|---|---|---|---|---|---|']
for cid, cells, k, bad, desc in rows:
    out.append(f'| {cid} | ' + ' | '.join(cells) + f' | {k} | {bad.replace("|", "／")} | {desc} |')
txt = '\n'.join(out)
print(txt)
print(f'\n新しい失敗 {len(new_fail)} 件 / 既知の失敗 {len(known_fail)} 件 / 直ったかもしれない既知の問題 {len(fixed)} 件')
for cid, m, bad in new_fail: print('  NEW', cid, m, '; '.join(bad)[:200])
for cid, m, k in fixed: print('  FIXED?', cid, m, k)
if md: open(md, 'w').write(txt + '\n')
