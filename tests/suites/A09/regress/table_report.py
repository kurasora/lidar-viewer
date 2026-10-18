#!/usr/bin/env python3
# 報告用の短い表（形式・点数・大きさ・時間・最大メモリ）を jsonl から作る
#   python3 table_report.py out/b2.jsonl out/b3.jsonl out/b4.jsonl
import json, sys
rows = []
for fn in sys.argv[1:]:
    for line in open(fn):
        try: d = json.loads(line)
        except Exception: continue
        if d.get('test') or 'ph' not in d: continue
        rows.append(d)
def g(d, *ks):
    for k in ks:
        if not isinstance(d, dict): return None
        d = d.get(k)
    return d
print('| 形式 | アプリ | 読んだ点 / 全体 | 上限 | 大きさ MB | 読み取り s | 表示 s | 全部（索引・水平補正）s | 読み取り MB/s | 全体 万点/s | 画面 最大 RSS MB | GPU 最大 RSS MB | 合計 最大 PSS MB | 「並べ替え中 0%」の停止 s | 最長の固まり s |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for d in rows:
    t = dict(d['ph']['t'])
    lt = [x for x in d['ph']['longTasks'].get('list', []) if t.get('loaded') is not None and x[0] >= t['loaded'] - 50]
    if lt and t.get('shown') is not None: t['shown'] = max(t['shown'], lt[0][0] + lt[0][1])
    f = (g(d, 'result', 'files') or [{}])
    f = f[0] if f else {}
    s = lambda v: '' if v is None else f'{v / 1000:.1f}'
    n = f.get('total') or 0
    read_mbps = round(d['bytes'] / 1048576 / (t['readEnd'] / 1000), 0) if t.get('readEnd') else ''
    pts = round(n / 1e4 / (t['lastMsg'] / 1000)) if t.get('lastMsg') and n else ''
    fmt = (f.get('fmt') or d['file']).replace('（点の形式 3）', ' 形式3').replace('文字の点群（7 列: x y z r g b sf1）', 'XYZ 文字（7 列）')
    print('| ' + ' | '.join(str(x) for x in [fmt, d['app'], f"{f.get('n', 0) / 1e6:g}M / {n / 1e6:g}M", f"{d.get('cap', 0) / 1e6:g}M", round(d['bytes'] / 1048576),
        s(t.get('readEnd')), s(t.get('shown')), s(t.get('lastMsg')), read_mbps, pts,
        g(d, 'peak', 'rss', 'renderer'), g(d, 'peak', 'rss', 'gpu'), g(d, 'peak', 'totalPss'), s(d['ph'].get('barMaxStallMs')), s(d['ph']['longTasks']['maxMs'])]) + ' |')
