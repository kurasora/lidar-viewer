# 結果（node_check.mjs / bcheck.js の出力）を正解と比べる
#   使い方: python3 compare.py <manifest.json> <結果フォルダ> [ラベル] [id の正規表現]
#   出力: 標準出力に 1 件 1 行（OK / NG / ERR / SKIP と理由）、<結果フォルダ>/summary.json
import sys, os, json, base64, re
import numpy as np
from scipy.spatial import cKDTree

man, resdir = sys.argv[1], sys.argv[2]
label = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(resdir.rstrip('/'))
filt = re.compile(sys.argv[4]) if len(sys.argv) > 4 else None
DATA = os.path.dirname(man)
cases = json.load(open(man))


def dec(s, dt):
    return np.frombuffer(base64.b64decode(s), dt) if s else None


def check(c, r):
    why = []   # NG の理由
    info = []  # 参考
    exp = c
    pe = [e for e in (r.get('errors') or []) if e.startswith('pageerror')]
    if pe: why.append('ページで例外: ' + ' / '.join(pe[:2]))
    if r.get('timedOut'): why.append('時間切れ（読み込みが終わらない）')
    if c.get('error'):
        if r.get('ok'):
            why.append(f"エラーになるはずが {r['n']} 点で開けた")
        elif not re.search(c['error'], r.get('error') or r.get('msg') or ''):
            why.append(f"エラーの文言が違う: {r.get('error') or r.get('msg')}")
        return why, info
    if not r.get('ok'):
        why.append(f"開けない: {r.get('error') or r.get('msg')}")
        return why, info
    for k in ('n', 'total', 'skipped'):
        if exp.get(k) is not None and r.get(k) != exp[k]:
            why.append(f"{k}={r.get(k)}（正解 {exp[k]}）")
    if exp.get('rgb') is not None and bool(r.get('rgb')) != exp['rgb']:
        why.append(f"色の有無={r.get('rgb')}（正解 {exp['rgb']}）")
    if exp.get('extra', {}).get('lines'):
        return check_lines(exp, r, why, info)
    if exp.get('extra', {}).get('stats'):
        st = exp['extra']['stats']; A = dec(r['P'], '<f8').reshape(-1, 3)
        m, lo, hi = A.mean(0), A.min(0), A.max(0)
        sh = st['shift']
        if sh == 'any': sh = np.round(m - np.array(st['mean']), 2)
        elif sh is None: sh = np.zeros(3)
        sh = np.asarray(sh, float)
        d = max(np.abs(m - st['mean'] - sh).max(), np.abs(lo - st['min'] - sh).max(), np.abs(hi - st['max'] - sh).max())
        info.append(f'平均 {np.round(m, 4).tolist()}・ずれ {sh.tolist()}・最大差 {d:.3g}')
        if d > 2e-3: why.append(f'平均・最小・最大が合わない（最大差 {d:.4g}）')
        return why, info
    if not exp.get('expect') or exp.get('nocheck_points'):
        return why, info
    if exp.get('kind') == 'traj':
        return check_traj(exp, r, why, info)
    E = np.load(os.path.join(DATA, exp['expect']))
    if 'P' not in E: return why, info
    A = dec(r['P'], '<f8').reshape(-1, 3)
    P = E['P']
    off = np.array(r.get('offset') or [0, 0, 0], float)
    if len(A) == 0:
        why.append('点が 0'); return why, info
    # 許容誤差: float32 の丸め（シフトを引いた値の 1 ulp）+ 1e-6
    tol = exp.get('tol')
    if tol is None:
        tol_pt = np.abs(P - off) * 2.0 ** -23 + 1e-6
    else:
        tol_pt = np.full(P.shape, float(tol))
    dup = len(np.unique(P.view([('', P.dtype)] * 3))) < len(P)
    sampled = exp.get('extra', {}).get('sampled', exp.get('cap') is not None)
    if exp.get('cap') is not None and bool(r.get('sampled')) != bool(sampled):
        why.append(f"sampled={r.get('sampled')}（正解 {sampled}）")
    if dup: info.append('正解に同じ点が複数ある（1 対 1 の確認はしない）')
    tree = cKDTree(P)
    dist, idx = tree.query(A, k=1)
    d = np.abs(A - P[idx])
    over = (d > tol_pt[idx]).any(1)
    maxd = d.max()
    info.append(f'最大誤差 {maxd:.3g} m')
    if exp.get('mm'):
        info.append(f"1 mm 以内: {'はい' if maxd <= 1e-3 else 'いいえ'}（最大 {maxd*1000:.3f} mm）")
        if maxd > 1e-3: why.append(f'1 mm を超える誤差（最大 {maxd*1000:.2f} mm）')
    if over.sum():
        k = np.argmax(d.max(1))
        why.append(f'座標が合わない点 {over.sum()} 個（最大 {maxd:.4g} m、例: 読んだ {A[k].round(6).tolist()} 正解 {P[idx[k]].round(6).tolist()}）')
    uniq = len(np.unique(idx))
    if not sampled and not dup and uniq != len(P):
        why.append(f'正解の点と 1 対 1 にならない（対応 {uniq} / {len(P)}）')
    if sampled and not dup and uniq != len(A):
        why.append(f'間引いた点に重複がある（{len(A) - uniq} 個）')
    # 間引きの偏り: 正解の点を y で strata 組に分け、それぞれの割合が n/strata に近いか
    st = exp.get('extra', {}).get('strata')
    if sampled and st:
        grp = (np.argsort(np.argsort(P[:, 1], kind='stable'), kind='stable') * st // len(P))[idx]
        cnt = np.bincount(grp, minlength=st); e_ = len(A) / st
        dev = np.abs(cnt - e_).max()
        info.append(f'組ごとの点数 {cnt.tolist()}（期待 {e_:.0f}）')
        if dev > 4 * np.sqrt(e_) + 1: why.append(f'間引きが偏っている（組ごとの点数 {cnt.tolist()}）')
    # 平均・最小・最大
    if not sampled:
        dm = np.abs(A.mean(0) - P.mean(0)).max()
        if dm > 1e-4 + np.abs(P - off).max() * 2.0 ** -22: why.append(f'平均がずれる {dm:.4g} m')
    # 色
    if 'C' in E and not dup:
        Cexp = E['C']
        if r.get('C') is None:
            why.append('色がない')
        else:
            Ca = dec(r['C'], 'u1').reshape(-1, 3)
            dc = np.abs(Ca.astype(int) - Cexp[idx].astype(int))
            badc = (dc > exp.get('extra', {}).get('color_tol', 0)).any(1).sum()
            if badc:
                k = np.argmax(dc.max(1))
                why.append(f'色が違う点 {badc} 個（最大差 {dc.max()}、例: 読んだ {Ca[k].tolist()} 正解 {Cexp[idx[k]].tolist()}）')
    # 欄
    ftol = exp.get('extra', {}).get('field_tol', {})
    for key in E.files:
        if not key.startswith('F_') or dup: continue
        nm = key[2:]
        Fa = r.get('F') or {}
        cand = [k for k in Fa if k == nm] or [k for k in Fa if k.lower() == nm.lower()]
        if not cand:
            why.append(f'欄 {nm} がない（ある欄: {list(Fa)}）'); continue
        va = dec(Fa[cand[0]], '<f4').astype(np.float64)
        ve = E[key][idx]
        if nm in ftol:
            dv = np.abs(va - ve); bad = (dv > ftol[nm]).sum()
            info.append(f'欄 {nm} の最大誤差 {dv.max():.4g}')
            if bad: why.append(f'欄 {nm} の値が {ftol[nm]} より大きくずれる点 {bad} 個（最大 {dv.max():.4g}）')
        else:
            ve32 = ve.astype(np.float32).astype(np.float64)
            ok = np.isclose(va, ve32, rtol=1e-6, atol=1e-6) | (np.isnan(va) & np.isnan(ve32))
            bad = (~ok).sum()
            if bad:
                k = np.argmax(~ok)
                why.append(f'欄 {nm} の値が違う点 {bad} 個（例: 読んだ {va[k]} 正解 {ve[k]}）')
    return why, info


def seg_dist(A, S):
    # A: 点 (n,3)、S: 線分 (m,6) → 各点から最も近い線分までの距離
    a, b = S[:, :3], S[:, 3:]
    ab = b - a; L2 = np.maximum((ab * ab).sum(1), 1e-30)
    best = np.full(len(A), np.inf)
    for i in range(0, len(A), 2000):
        p = A[i:i + 2000, None, :]
        t = np.clip(((p - a) * ab).sum(2) / L2, 0, 1)
        d = np.linalg.norm(p - (a + t[..., None] * ab), axis=2).min(1)
        best[i:i + 2000] = d
    return best


def check_lines(exp, r, why, info):
    S = np.load(os.path.join(DATA, exp['extra']['lines']))
    A = dec(r['P'], '<f8').reshape(-1, 3)
    d = seg_dist(A, S)
    off = np.array(r.get('offset') or [0, 0, 0], float)
    tol = 1e-6 + np.abs(A - off).max() * 2.0 ** -22
    info.append(f'点 {len(A):,}・線分 {len(S)}・線からの最大距離 {d.max():.3g} m')
    if (d > tol).sum(): why.append(f'線の上にない点 {(d > tol).sum()} 個（最大 {d.max():.4g} m）')
    V = np.unique(np.concatenate([S[:, :3], S[:, 3:]]), axis=0)
    dv, _ = cKDTree(A).query(V)
    if (dv > tol).sum(): why.append(f'線の頂点が点になっていない {(dv > tol).sum()} 個')
    # 閉じた線の最後の辺（最後の頂点 → 最初の頂点）の上にも点があるか: 線分ごとの点の数
    dd = seg_dist(A, S)  # 参考
    return why, info


def check_traj(exp, r, why, info):
    E = np.load(os.path.join(DATA, exp['expect']))['poses']
    if r.get('poses'):  # Node: [t x y z qx qy qz qw] × n
        A = dec(r['poses'], '<f8').reshape(-1, 8)
        if len(A) != len(E): why.append(f'姿勢の数 {len(A)}（正解 {len(E)}）'); return why, info
        dt = np.abs(A[:, 0] - E[:, 0]).max(); dp = np.abs(A[:, 1:4] - E[:, 1:4]).max(); dq = np.abs(A[:, 4:8] - E[:, 4:8]).max()
        info.append(f'時刻の最大差 {dt:.3g}・位置 {dp:.3g} m・姿勢 {dq:.3g}・トピック {r.get("topic")}')
        if dt > 1e-6 * max(1, np.abs(E[:, 0]).max() * 1e-9) and dt > 1e-3: why.append(f'時刻が違う（最大差 {dt:.4g}）')
        if dp > 1e-5: why.append(f'位置が違う（最大差 {dp:.4g} m、例: 読んだ {A[np.argmax(np.abs(A[:,1:4]-E[:,1:4]).max(1)),1:4].round(4).tolist()} 正解 {E[np.argmax(np.abs(A[:,1:4]-E[:,1:4]).max(1)),1:4].round(4).tolist()}）')
        if dq > 1e-5: why.append(f'姿勢（四元数）が違う（最大差 {dq:.3g}）')
        return why, info
    t = (r.get('trajs') or [None])[0]
    if not t: why.append('軌跡がない'); return why, info
    A = dec(t['P'], '<f4').astype(np.float64).reshape(-1, 3)
    if len(A) != len(E): why.append(f'姿勢の数 {len(A)}（正解 {len(E)}）'); return why, info
    off = np.array(r.get('offset') or [0, 0, 0], float)
    dp = np.abs(A - E[:, 1:4]).max()
    info.append(f'位置の最大差 {dp:.3g} m（画面の座標そのまま）・長さ {t.get("length"):.2f} m・時間 {t.get("duration"):.3f} 秒・トピック {t.get("topic")}')
    if dp > 1e-3: why.append(f'位置が違う（最大差 {dp:.4g} m）')
    dur = E[-1, 0] - E[0, 0]
    if abs(t.get('duration', 0) - dur) > 1e-3 * max(1, dur): why.append(f'時間 {t.get("duration")}（正解 {dur}）')
    return why, info


rows = []
for c in cases:
    if filt and not filt.search(c['id']): continue
    fn = os.path.join(resdir, c['id'] + '.json')
    if not os.path.exists(fn):
        continue
    r = json.load(open(fn))
    try:
        why, info = check(c, r)
    except Exception as e:
        why, info = [f'比較でエラー: {e!r}'], []
    st = 'OK' if not why else 'NG'
    msg = r.get('msg', '')
    rows.append({'id': c['id'], 'status': st, 'why': why, 'info': info, 'n': r.get('n'), 'total': r.get('total'), 'skipped': r.get('skipped'),
                 'format': r.get('format'), 'note': r.get('note'), 'msg': msg, 'error': r.get('error'), 'desc': c['desc']})
    print(f"[{label}] {st:2} {c['id']}: {'; '.join(why) if why else ''}{' ｜ ' + '; '.join(info) if info else ''}{' ｜ 知らせ: ' + msg if msg else ''}")
json.dump(rows, open(os.path.join(resdir, 'summary.json'), 'w'), ensure_ascii=False, indent=1)
ng = sum(r['status'] != 'OK' for r in rows)
print(f'[{label}] 合計 {len(rows)} 件、NG {ng} 件')
