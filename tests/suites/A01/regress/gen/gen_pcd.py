# PCD の試験用ファイル（PCL 1.14 の pcl_convert_pcd_ascii_binary で ascii / binary_compressed に変換したものも使う）
import subprocess, numpy as np, os
from common import *

NP = {('F', 4): '<f4', ('F', 8): '<f8', ('U', 1): 'u1', ('U', 2): '<u2', ('U', 4): '<u4', ('I', 1): 'i1', ('I', 2): '<i2', ('I', 4): '<i4', ('U', 8): '<u8', ('I', 8): '<i8'}


def header(fields, sizes, types, counts, n, data, width=None, height=1, viewpoint='0 0 0 1 0 0 0', version='0.7', points=True, extra_lines=(), nl='\n', sep=' '):
    L = ['# .PCD v0.7 - Point Cloud Data file format', f'VERSION {version}', 'FIELDS' + sep + sep.join(fields), 'SIZE' + sep + sep.join(map(str, sizes)),
         'TYPE' + sep + sep.join(types)]
    if counts is not None: L.append('COUNT' + sep + sep.join(map(str, counts)))
    L.append(f'WIDTH{sep}{width if width is not None else n}')
    L.append(f'HEIGHT{sep}{height}')
    if viewpoint is not None: L.append(f'VIEWPOINT{sep}{viewpoint}')
    if points is True: L.append(f'POINTS{sep}{n}')
    elif points is not None and points is not False: L.append(f'POINTS{sep}{points}')
    L.extend(extra_lines)
    L.append(f'DATA{sep}{data}')
    return (nl.join(L) + nl).encode()


def recarray(fields, sizes, types, counts, n):
    dt = []
    for nm, s, t, c in zip(fields, sizes, types, counts):
        if nm == '_': nm = f'_pad{len(dt)}'
        dt.append((nm, NP[(t, s)], (c,)) if c > 1 else (nm, NP[(t, s)]))
    return np.zeros(n, dtype=dt)


def write_binary(fn, fields, sizes, types, counts, rec, **kw):
    with open(fn, 'wb') as f:
        f.write(header(fields, sizes, types, counts, len(rec), 'binary', **kw))
        f.write(rec.tobytes())


def pcl_convert(src, dst, mode):
    # mode 0 = ascii, 1 = binary, 2 = binary_compressed
    subprocess.run(['pcl_convert_pcd_ascii_binary', src, dst, str(mode)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def parse_pcd_ascii(fn):
    """PCL が書いた ascii の PCD を読む（欄ごとの先頭の値）。正解づくり用"""
    lines = open(fn).read().split('\n')
    h = {}
    k = 0
    while True:
        w = lines[k].split(); k += 1
        if not w or w[0].startswith('#'): continue
        h[w[0]] = w[1:]
        if w[0] == 'DATA': break
    names = h['FIELDS']; counts = [int(c) for c in h.get('COUNT', ['1'] * len(names))]
    first = np.cumsum([0] + counts[:-1])
    rows = [l.split() for l in lines[k:] if l.strip()]
    out = {}
    for nm, f0 in zip(names, first):
        if nm in out: continue
        out[nm] = np.array([float(r[f0]) for r in rows])
    return out


def three(base, fields, sizes, types, counts, rec, desc, ascii_own=None, **expect):
    """binary を自分で書き、PCL で ascii と binary_compressed に変換して 3 つの試験にする
    ascii の正解は、PCL が書いた文字（PCL は 7 桁でしか書かない）から作り直す。ascii_own を渡すと ascii は自分で書く"""
    fb = path(f'pcd/{base}_bin.pcd'); write_binary(fb, fields, sizes, types, counts, rec)
    fa = path(f'pcd/{base}_ascii.pcd')
    if ascii_own: ascii_own(fa)
    else: pcl_convert(fb, fa, 0)
    fc = path(f'pcd/{base}_bc.pcd'); pcl_convert(fb, fc, 2)
    for tag, nm in (('binary', 'bin'), ('ascii', 'ascii'), ('binary_compressed', 'bc')):
        ex = dict(expect)
        if nm == 'ascii' and not ascii_own:
            got = parse_pcd_ascii(fa)
            if ex.get('P') is not None and 'x' in got and not ex.get('keepP'):
                gx = np.stack([got['x'], got['y'], got['z']], 1)
                ok = np.isfinite(gx).all(1)
                if ok.sum() == len(ex['P']):
                    ex['P'] = gx[ok]
                    if ex.get('F'):
                        ex['F'] = {k: (got[k][ok] if k in got else v) for k, v in ex['F'].items()}
        ex.pop('keepP', None)
        case(f'pcd/{base}_{nm}', [f'pcd/{base}_{nm}.pcd'], f'{desc}（{tag}）', **ex)


def gen():
    n = N0
    P32 = f32(P0)
    # 1) 基本: x y z だけ（F4）
    F, S, T, C = ['x', 'y', 'z'], [4, 4, 4], ['F', 'F', 'F'], [1, 1, 1]
    rec = recarray(F, S, T, C, n); rec['x'], rec['y'], rec['z'] = P0.T
    three('xyz_f4', F, S, T, C, rec, 'x y z（F4）だけ', P=P32, rgb=False)

    # 2) 型の全種類（値の欄）: 各型の最小・最大を含む
    names = ['f_u1', 'f_u2', 'f_u4', 'f_i1', 'f_i2', 'f_i4', 'f_f4', 'f_f8', 'f_u8', 'f_i8']
    tys = [('U', 1), ('U', 2), ('U', 4), ('I', 1), ('I', 2), ('I', 4), ('F', 4), ('F', 8), ('U', 8), ('I', 8)]
    lims = {('U', 1): (0, 255), ('U', 2): (0, 65535), ('U', 4): (0, 4294967295), ('I', 1): (-128, 127), ('I', 2): (-32768, 32767), ('I', 4): (-2147483648, 2147483647),
            ('F', 4): (-1e30, 1e30), ('F', 8): (-123456.789, 98765.4321), ('U', 8): (0, 2 ** 53), ('I', 8): (-2 ** 53, 2 ** 53)}
    F2 = ['x', 'y', 'z'] + names; S2 = [4, 4, 4] + [s for _, s in tys]; T2 = ['F', 'F', 'F'] + [t for t, _ in tys]; C2 = [1] * len(F2)
    rec = recarray(F2, S2, T2, C2, n); rec['x'], rec['y'], rec['z'] = P0.T
    rng = np.random.default_rng(5)
    exp = {}
    for nm, ty in zip(names, tys):
        lo, hi = lims[ty]
        if ty[0] == 'F': v = rng.uniform(lo, hi, n)
        else: v = rng.integers(lo, hi, n, endpoint=True, dtype=np.int64 if ty != ('U', 8) else np.uint64)
        v[0], v[1] = lo, hi
        rec[nm] = v
        exp[nm] = rec[nm].astype(np.float64)
    three('types', F2, S2, T2, C2, rec, '値の欄に全部の型（U1 U2 U4 I1 I2 I4 F4 F8 U8 I8、最小・最大を含む）', P=P32, F=exp, rgb=False)

    # 3) 座標そのものの型（F8・整数）
    for (t, s), scale, add in [(('F', 8), 1, 0), (('I', 2), 100, 0), (('I', 4), 1000, 0), (('U', 2), 100, 12), (('U', 4), 1000, 12), (('I', 1), 1, 0), (('U', 1), 1, 12), (('I', 8), 1e3, 0), (('U', 8), 1e3, 12)]:
        F3, S3, T3, C3 = ['x', 'y', 'z'], [s] * 3, [t] * 3, [1, 1, 1]
        rec = recarray(F3, S3, T3, C3, n)
        q = np.round((P0 + add) * scale) if t != 'F' else P0.copy()
        for k, nm in enumerate('xyz'): rec[nm] = q[:, k]
        Pexp = q.astype(np.float64) if t != 'F' else P0.copy()
        three(f'coord_{t}{s}', F3, S3, T3, C3, rec, f'座標の型が {t}{s}', P=Pexp, rgb=False)

    # 4) COUNT > 1・x の前の欄・詰め物（_）
    F4_, S4, T4, C4 = ['normal', 'x', 'y', 'z', 'rgb', 'fpfh', '_', 'intensity'], [4, 4, 4, 4, 4, 4, 1, 2], ['F', 'F', 'F', 'F', 'U', 'F', 'U', 'U'], [3, 1, 1, 1, 1, 33, 4, 1]
    rec = recarray(F4_, S4, T4, C4, n)
    rec['normal'] = np.tile([0.0, 0.0, 1.0], (n, 1)); rec['x'], rec['y'], rec['z'] = P0.T
    rec['rgb'] = (255 << 24) | (RGB0[:, 0].astype(np.uint32) << 16) | (RGB0[:, 1].astype(np.uint32) << 8) | RGB0[:, 2]
    rec['fpfh'] = rng.uniform(0, 100, (n, 33)); rec['intensity'] = I0.astype(np.uint16) * 3
    three('count_gt1', F4_, S4, T4, C4, rec, 'COUNT>1 の欄（normal×3 を x の前、fpfh×33、詰め物 _×4）＋ rgb(U4)＋ intensity(U2)', P=P32, C=RGB0, F={'intensity': I0 * 3}, rgb=True)

    # 5) 色: rgb を float に詰めたもの（PCL の PointXYZRGB の書き方。α=255）
    packed = ((255 << 24) | (RGB0[:, 0].astype(np.uint32) << 16) | (RGB0[:, 1].astype(np.uint32) << 8) | RGB0[:, 2]).astype(np.uint32)
    F5, S5, T5, C5 = ['x', 'y', 'z', 'rgb'], [4, 4, 4, 4], ['F', 'F', 'F', 'F'], [1, 1, 1, 1]
    rec = recarray(F5, S5, T5, C5, n); rec['x'], rec['y'], rec['z'] = P0.T; rec['rgb'] = packed.view(np.float32)
    three('rgb_float', F5, S5, T5, C5, rec, 'rgb を float に詰めたもの（TYPE F、α=255。PCL は ascii に書くとき TYPE U の整数にする）', P=P32, C=RGB0, rgb=True)
    # ascii で TYPE F のまま float の値を書いたもの（Open3D・古い PCL の書き方。α=0 にすると NaN にならない）
    packed0 = ((RGB0[:, 0].astype(np.uint32) << 16) | (RGB0[:, 1].astype(np.uint32) << 8) | RGB0[:, 2]).astype(np.uint32)
    fl = packed0.view(np.float32)
    rows = [f'{float(P32[i,0])!r} {float(P32[i,1])!r} {float(P32[i,2])!r} {np.format_float_scientific(fl[i], unique=True)}' for i in range(n)]
    with open(path('pcd/rgb_float_text_ascii.pcd'), 'wb') as f:
        f.write(header(F5, S5, T5, C5, n, 'ascii')); f.write(('\n'.join(rows) + '\n').encode())
    case('pcd/rgb_float_text_ascii', ['pcd/rgb_float_text_ascii.pcd'], 'ascii で rgb を float の文字（2.34e-38 など、TYPE F）で書いたもの（Open3D の書き方）', P=P32, C=RGB0, rgb=True)
    # rgb を U4、rgba を U4
    for nm in ('rgb', 'rgba'):
        F6, S6, T6, C6 = ['x', 'y', 'z', nm], [4, 4, 4, 4], ['F', 'F', 'F', 'U'], [1, 1, 1, 1]
        rec = recarray(F6, S6, T6, C6, n); rec['x'], rec['y'], rec['z'] = P0.T; rec[nm] = packed
        three(f'{nm}_u4', F6, S6, T6, C6, rec, f'{nm} を U4（α=255）', P=P32, C=RGB0, rgb=True)

    # 6) 整列した点群（WIDTH × HEIGHT、NaN の穴）
    W_, H_ = 100, 50
    hole = np.zeros(n, bool); hole[rng.choice(n, 1234, replace=False)] = True
    F7, S7, T7, C7 = ['x', 'y', 'z', 'intensity'], [4, 4, 4, 4], ['F', 'F', 'F', 'F'], [1, 1, 1, 1]
    rec = recarray(F7, S7, T7, C7, n); rec['x'], rec['y'], rec['z'] = P0.T; rec['intensity'] = I0
    for nm in 'xyz': rec[nm][hole] = np.nan
    fb = path('pcd/organized_bin.pcd')
    with open(fb, 'wb') as f: f.write(header(F7, S7, T7, C7, n, 'binary', width=W_, height=H_)); f.write(rec.tobytes())
    pcl_convert(fb, path('pcd/organized_ascii.pcd'), 0); pcl_convert(fb, path('pcd/organized_bc.pcd'), 2)
    for nm in ('bin', 'ascii', 'bc'):
        Pe, Fe = P32[~hole], I0[~hole]
        if nm == 'ascii':
            got = parse_pcd_ascii(path('pcd/organized_ascii.pcd')); gx = np.stack([got['x'], got['y'], got['z']], 1); ok = np.isfinite(gx).all(1)
            Pe, Fe = gx[ok], got['intensity'][ok]
        case(f'pcd/organized_{nm}', [f'pcd/organized_{nm}.pcd'], f'整列した点群 100×50、NaN の穴 1,234 個（{nm}）', P=Pe, F={'intensity': Fe}, n=n - 1234, total=n - 1234, skipped=1234, rgb=False)
    # 穴の一部は x だけ NaN（y z は値あり）
    rec2 = rec.copy(); rec2['x'], rec2['y'], rec2['z'] = P0.T
    only_x = np.zeros(n, bool); only_x[:50] = True
    rec2['x'][only_x] = np.nan
    write_binary(path('pcd/nan_x_only_bin.pcd'), F7, S7, T7, C7, rec2)
    case('pcd/nan_x_only_bin', ['pcd/nan_x_only_bin.pcd'], 'x だけ NaN の点 50 個', P=P32[~only_x], n=n - 50, total=n - 50, skipped=50, rgb=False)

    # 7) VIEWPOINT が単位でない（PCL は点を変換しない。点は書かれたまま）
    F8_, S8, T8, C8 = ['x', 'y', 'z'], [4, 4, 4], ['F', 'F', 'F'], [1, 1, 1]
    rec = recarray(F8_, S8, T8, C8, n); rec['x'], rec['y'], rec['z'] = P0.T
    write_binary(path('pcd/viewpoint_bin.pcd'), F8_, S8, T8, C8, rec, viewpoint='10 20 30 0.7071068 0 0 0.7071068')
    case('pcd/viewpoint_bin', ['pcd/viewpoint_bin.pcd'], 'VIEWPOINT 10 20 30 + z 軸 90 度（PCL は点を変換しない）', P=P32, rgb=False)

    # 8) POINTS と実データの食い違い
    rows = [f'{float(P32[i,0])!r} {float(P32[i,1])!r} {float(P32[i,2])!r}' for i in range(n)]
    body = ('\n'.join(rows) + '\n').encode()
    for pts, tag in [(4000, 'less'), (6000, 'more')]:
        with open(path(f'pcd/points_{tag}_ascii.pcd'), 'wb') as f: f.write(header(F8_, S8, T8, C8, n, 'ascii', points=pts, width=pts)); f.write(body)
        with open(path(f'pcd/points_{tag}_bin.pcd'), 'wb') as f: f.write(header(F8_, S8, T8, C8, n, 'binary', points=pts, width=pts)); f.write(rec.tobytes())
    case('pcd/points_less_ascii', ['pcd/points_less_ascii.pcd'], 'ascii: POINTS 4000 なのにデータは 5000 行（PCL は 4000 点を読む）', P=P32[:4000], rgb=False)
    case('pcd/points_less_bin', ['pcd/points_less_bin.pcd'], 'binary: POINTS 4000 なのにデータは 5000 点分（PCL は 4000 点を読む）', P=P32[:4000], rgb=False)
    case('pcd/points_more_ascii', ['pcd/points_more_ascii.pcd'], 'ascii: POINTS 6000 なのにデータは 5000 行（PCL は読み込みエラー）', P=P32, rgb=False, extra={'note': '5000 点を黙って出すか、途中で切れている旨を知らせるか'})
    case('pcd/points_more_bin', ['pcd/points_more_bin.pcd'], 'binary: POINTS 6000 なのにデータは 5000 点分（PCL は読み込みエラー）', error='途中で切れ', extra={'note': '切れている旨のエラー、または読めた分を表示'})
    with open(path('pcd/no_points_line.pcd'), 'wb') as f: f.write(header(F8_, S8, T8, C8, n, 'binary', points=None)); f.write(rec.tobytes())
    case('pcd/no_points_line', ['pcd/no_points_line.pcd'], 'POINTS 行がない（WIDTH×HEIGHT を使う）', P=P32, rgb=False)
    with open(path('pcd/points0.pcd'), 'wb') as f: f.write(header(F8_, S8, T8, C8, 0, 'binary', width=0))
    case('pcd/points0', ['pcd/points0.pcd'], 'POINTS 0（空の点群。PCL では正しいファイル）', error='.', extra={'note': '「点がありません」などの分かりやすい知らせが期待'})

    # 9) 頭書きの揺れ
    h = (b'# .PCD v0.7 - Point Cloud Data file format\r\n# comment line\r\nVERSION 0.7\r\nFIELDS\tx\ty\tz\r\n#another comment\r\nSIZE 4  4   4\r\nTYPE F F F \r\nCOUNT 1 1 1\r\nWIDTH 5000\r\nHEIGHT 1\r\nVIEWPOINT 0 0 0 1 0 0 0\r\nPOINTS 5000\r\nDATA ascii\r\n')
    with open(path('pcd/hdr_crlf_tabs_ascii.pcd'), 'wb') as f: f.write(h); f.write(('\r\n'.join(r.replace(' ', '\t') for r in rows) + '\r\n').encode())
    case('pcd/hdr_crlf_tabs_ascii', ['pcd/hdr_crlf_tabs_ascii.pcd'], 'CRLF・タブ区切り・頭書きの途中のコメント・余分な空白（ascii）', P=P32, rgb=False)
    with open(path('pcd/hdr_crlf_bin.pcd'), 'wb') as f: f.write(h.replace(b'DATA ascii', b'DATA binary')); f.write(rec.tobytes())
    case('pcd/hdr_crlf_bin', ['pcd/hdr_crlf_bin.pcd'], 'CRLF の頭書き（binary）', P=P32, rgb=False)
    with open(path('pcd/hdr_v05.pcd'), 'wb') as f: f.write(header(F8_, S8, T8, None, n, 'ascii', version='.5', viewpoint=None)); f.write(body)
    case('pcd/hdr_v05', ['pcd/hdr_v05.pcd'], 'VERSION .5（COUNT・VIEWPOINT なし）', P=P32, rgb=False)
    with open(path('pcd/hdr_v06.pcd'), 'wb') as f: f.write(header(F8_, S8, T8, C8, n, 'ascii', version='.6', viewpoint=None)); f.write(body)
    case('pcd/hdr_v06', ['pcd/hdr_v06.pcd'], 'VERSION .6（VIEWPOINT なし）', P=P32, rgb=False)
    with open(path('pcd/hdr_columns.pcd'), 'wb') as f: f.write(header(F8_, S8, T8, C8, n, 'ascii').replace(b'FIELDS', b'COLUMNS')); f.write(body)
    case('pcd/hdr_columns', ['pcd/hdr_columns.pcd'], 'FIELDS の代わりに COLUMNS（古い書き方）', P=P32, rgb=False)
    with open(path('pcd/hdr_bom.pcd'), 'wb') as f: f.write(b'\xef\xbb\xbf' + header(F8_, S8, T8, C8, n, 'binary')); f.write(rec.tobytes())
    case('pcd/hdr_bom', ['pcd/hdr_bom.pcd'], '先頭に BOM', P=P32, rgb=False)
    with open(path('pcd/hdr_upper_xyz.pcd'), 'wb') as f: f.write(header(['X', 'Y', 'Z'], S8, T8, C8, n, 'binary')); f.write(rec.tobytes())
    case('pcd/hdr_upper_xyz', ['pcd/hdr_upper_xyz.pcd'], '欄の名前が大文字 X Y Z', P=P32, rgb=False)
    # 指数表記・空行・行末の空白
    rows_e = [f'{P32[i,0]:.8e} {P32[i,1]:.8e}  {P32[i,2]:.8e} ' for i in range(n)]
    with open(path('pcd/ascii_exp.pcd'), 'wb') as f: f.write(header(F8_, S8, T8, C8, n, 'ascii')); f.write(('\n'.join(rows_e[:2500]) + '\n\n' + '\n'.join(rows_e[2500:]) + '\n').encode())
    case('pcd/ascii_exp', ['pcd/ascii_exp.pcd'], 'ascii: 指数表記・途中の空行・行末の空白', P=reparse(rows_e), rgb=False)

    # 10) 欄の順序（z y x の逆順、intensity が先頭）
    F9, S9, T9, C9 = ['intensity', 'z', 'y', 'x'], [4, 4, 4, 4], ['F', 'F', 'F', 'F'], [1, 1, 1, 1]
    rec = recarray(F9, S9, T9, C9, n); rec['x'], rec['y'], rec['z'] = P0.T; rec['intensity'] = I0
    three('order_zyx', F9, S9, T9, C9, rec, '欄の順序が intensity z y x', P=P32, F={'intensity': I0}, rgb=False)

    # 11) 大きな座標（UTM、F8）→ グローバルシフト。1 mm 以内か
    Q = P0 + UTM
    F10, S10, T10, C10 = ['x', 'y', 'z', 'intensity'], [8, 8, 8, 4], ['F', 'F', 'F', 'F'], [1, 1, 1, 1]
    rec = recarray(F10, S10, T10, C10, n); rec['x'], rec['y'], rec['z'] = Q.T; rec['intensity'] = I0
    def utm_ascii(fn):
        with open(fn, 'wb') as f:
            f.write(header(F10, S10, T10, C10, n, 'ascii'))
            f.write(('\n'.join(f'{Q[i,0]:.6f} {Q[i,1]:.6f} {Q[i,2]:.6f} {I0[i]:g}' for i in range(n)) + '\n').encode())
    three('utm_f8', F10, S10, T10, C10, rec, 'UTM の大きな座標（F8）', ascii_own=utm_ascii, P=Q, F={'intensity': I0}, rgb=False, mm=True)

    # 12) 絶対時刻の欄（F8、1.7e9 秒台。Livox などの timestamp）→ 値の欄の精度
    F11, S11, T11, C11 = ['x', 'y', 'z', 'timestamp'], [4, 4, 4, 8], ['F', 'F', 'F', 'F'], [1, 1, 1, 1]
    rec = recarray(F11, S11, T11, C11, n); rec['x'], rec['y'], rec['z'] = P0.T
    ts = 1.7e9 + np.arange(n) * 0.01
    rec['timestamp'] = ts
    write_binary(path('pcd/timestamp_f8_bin.pcd'), F11, S11, T11, C11, rec)
    case('pcd/timestamp_f8_bin', ['pcd/timestamp_f8_bin.pcd'], '絶対時刻の欄 timestamp（F8、1.7e9 秒 + 0.01 秒刻み）', P=P32, F={'timestamp': ts}, rgb=False, extra={'field_tol': {'timestamp': 0.01}})

    # 13) 同じ名前の欄が 2 つ
    F12, S12, T12, C12 = ['x', 'y', 'z', 'intensity', 'intensity'], [4, 4, 4, 4, 4], ['F', 'F', 'F', 'F', 'F'], [1, 1, 1, 1, 1]
    rec = np.zeros(n, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('i1', '<f4'), ('i2', '<f4')]); rec['x'], rec['y'], rec['z'] = P0.T; rec['i1'] = I0; rec['i2'] = -1
    with open(path('pcd/dup_field_bin.pcd'), 'wb') as f: f.write(header(F12, S12, T12, C12, n, 'binary')); f.write(rec.tobytes())
    case('pcd/dup_field_bin', ['pcd/dup_field_bin.pcd'], '同じ名前の欄 intensity が 2 つ（1 つ目を使う）', P=P32, F={'intensity': I0}, rgb=False)

    # 14) FAST-LIO の scans.pcd と同じ欄（PointXYZINormal: x y z intensity normal_x normal_y normal_z curvature、詰め物つき）
    #     PCL の PointXYZINormal の binary は 48 バイト（_ 詰め物を含む）
    F13 = ['x', 'y', 'z', '_', 'intensity', 'normal_x', 'normal_y', 'normal_z', '_', 'curvature', '_']
    S13 = [4, 4, 4, 1, 4, 4, 4, 4, 1, 4, 1]; T13 = ['F', 'F', 'F', 'U', 'F', 'F', 'F', 'F', 'U', 'F', 'U']; C13 = [1, 1, 1, 4, 1, 1, 1, 1, 4, 1, 8]
    rec = recarray(F13, S13, T13, C13, n); rec['x'], rec['y'], rec['z'] = P0.T; rec['intensity'] = I0; rec['normal_z'] = 1; rec['curvature'] = np.arange(n) * 1e-3
    three('fastlio_xyzinormal', F13, S13, T13, C13, rec, 'FAST-LIO の地図と同じ PointXYZINormal（詰め物 _ が 3 か所）', P=P32, F={'intensity': I0, 'curvature': f32(np.arange(n) * 1e-3)}, rgb=False)

    # 15) Livox の点（x y z intensity tag line timestamp。livox_ros_driver2 の PointXYZRTLT）
    F14 = ['x', 'y', 'z', 'intensity', 'tag', 'line', 'timestamp']; S14 = [4, 4, 4, 4, 1, 1, 8]; T14 = ['F', 'F', 'F', 'F', 'U', 'U', 'F']; C14 = [1] * 7
    rec = recarray(F14, S14, T14, C14, n); rec['x'], rec['y'], rec['z'] = P0.T; rec['intensity'] = I0; rec['tag'] = 16; rec['line'] = np.arange(n) % 4; rec['timestamp'] = 1.7e18 + np.arange(n) * 1e5
    three('livox_xyzrtlt', F14, S14, T14, C14, rec, 'Livox の PointXYZRTLT（timestamp は ns の F8、1.7e18）', P=P32, F={'intensity': I0, 'tag': np.full(n, 16.0), 'line': (np.arange(n) % 4).astype(float)}, rgb=False)
