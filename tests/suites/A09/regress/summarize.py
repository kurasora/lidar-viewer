#!/usr/bin/env python3
# perf_load.js の結果（jsonl）から、報告用の表（Markdown）を作る
#   python3 summarize.py out/b2.jsonl [out/b3.jsonl ...]
import json, sys

def mb(d, *ks):
    for k in ks:
        if d is None: return None
        d = d.get(k) if isinstance(d, dict) else None
    return d

rows = []
for fn in sys.argv[1:]:
    for line in open(fn):
        try: d = json.loads(line)
        except Exception: continue
        if d.get('test') or 'ph' not in d: continue
        rows.append(d)

print('| 形式 | アプリ | 点数（読んだ/全体） | 上限 | 大きさ MB | 読み取り s | 表示まで s | 索引まで s | 全部 s | MB/s | 万点/s | 画面 最大 RSS MB | 画面 最大 PSS MB | GPU 最大 RSS MB | 合計 最大 PSS MB | 落ち着いた後 画面/GPU RSS MB | 閉じた後 画面/GPU RSS MB | 最長タスク ms | 進み 0% のまま最長 ms | 知らせ |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for d in rows:
    t = dict(d['ph']['t'])
    # 「表示まで」: 'loaded' を受けた処理（長いタスク）が終わった時刻。古い結果は rAF の時刻なので、長いタスクの終わりで補う
    lt = [x for x in d['ph']['longTasks'].get('list', []) if t.get('loaded') is not None and x[0] >= t['loaded'] - 50]
    if lt and t.get('shown') is not None: t['shown'] = max(t['shown'], lt[0][0] + lt[0][1])
    f = (d.get('result') or {}).get('files') or [{}]
    f = f[0] if f else {}
    s = lambda v: '' if v is None else f'{v / 1000:.1f}'
    base_r = mb(d, 'base', 'mem', 'rss', 'renderer') or 0
    base_g = mb(d, 'base', 'mem', 'rss', 'gpu') or 0
    after = d.get('afterLoadGc') or {}
    close = d.get('afterClose') or {}
    msg = ((d.get('result') or {}).get('msg') or '') if not d['ph'].get('workerErrors') else ('ワーカーの誤り: ' + '; '.join(str(e[2]) for e in d['ph']['workerErrors']))
    if d.get('fatal'): msg = 'fatal: ' + d['fatal'][:80]
    print('| ' + ' | '.join(str(x) for x in [
        f.get('fmt', d['file']), d['app'], f"{f.get('n', 0):,} / {f.get('total', 0):,}" if f else '', f"{d.get('cap', 0):,}",
        round(d['bytes'] / 1048576), s(t.get('readEnd')), s(t.get('shown')), s(t.get('spacing')), s(t.get('lastMsg')),
        (d.get('speed') or {}).get('MBps', ''), round((d.get('speed') or {}).get('MptsPerSec', 0) * 100) if d.get('speed') else '',
        mb(d, 'peak', 'rss', 'renderer'), mb(d, 'peak', 'pss', 'renderer'), mb(d, 'peak', 'rss', 'gpu'), mb(d, 'peak', 'totalPss'),
        f"{mb(after, 'mem', 'rss', 'renderer')}/{mb(after, 'mem', 'rss', 'gpu')}", f"{mb(close, 'mem', 'rss', 'renderer')}/{mb(close, 'mem', 'rss', 'gpu')}" if close else '',
        d['ph']['longTasks']['maxMs'], d['ph'].get('barMaxStallMs'), msg[:60]]) + ' |')

# 1 点あたりのメモリ（落ち着いた後 − 起動直後）
print()
print('| 形式 | 点数 | 画面 JS の ArrayBuffer B/点 | ワーカー ArrayBuffer B/点 | 画面 PSS B/点 | GPU PSS B/点 | 合計 PSS B/点 | ピーク 画面 PSS B/点 |')
print('|---|---|---|---|---|---|---|---|')
for d in rows:
    f = ((d.get('result') or {}).get('files') or [{}])
    f = f[0] if f else {}
    n = f.get('n')
    if not n: continue
    a = d.get('afterLoadGc') or {}
    b = d.get('base') or {}
    def per(x, y):
        if x is None or y is None: return ''
        return f'{(x - y) * 1048576 / n:.1f}'
    print('| ' + ' | '.join(str(x) for x in [f.get('fmt'), f'{n:,}',
        per(mb(a, 'heap', 'main', 'ab'), mb(b, 'heap', 'main', 'ab')), per(mb(a, 'heap', 'worker', 'ab'), mb(b, 'heap', 'worker', 'ab')),
        per(mb(a, 'mem', 'pss', 'renderer'), mb(b, 'mem', 'pss', 'renderer')), per(mb(a, 'mem', 'pss', 'gpu'), mb(b, 'mem', 'pss', 'gpu')),
        per(mb(a, 'mem', 'totalPss'), mb(b, 'mem', 'totalPss')), per(mb(d, 'peak', 'pss', 'renderer'), mb(b, 'mem', 'pss', 'renderer'))]) + ' |')
