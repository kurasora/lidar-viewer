# LAS / LAZ の試験用ファイル（laspy 2.7 + lazrs で作る。正解は laspy で読み戻した値）
import numpy as np, laspy
from common import *

RGB_FMTS = {2, 3, 5, 7, 8, 10}
GPS_FMTS = {1, 3, 4, 5, 6, 7, 8, 9, 10}


def fill(las, P, pf, n, rgb16=True, idx=None):
    i = np.arange(n) if idx is None else idx
    las.x, las.y, las.z = P[:, 0], P[:, 1], P[:, 2]
    las.intensity = (np.arange(n) * 7 % 65536).astype(np.uint16)
    if pf >= 6:
        las.return_number = (1 + i % 15).astype(np.uint8); las.number_of_returns = np.full(n, 15, np.uint8)
        las.classification = (i % 256).astype(np.uint8)
    else:
        las.return_number = (1 + i % 7).astype(np.uint8); las.number_of_returns = np.full(n, 7, np.uint8)
        las.classification = (i % 32).astype(np.uint8)
    las.point_source_id = (i % 65536).astype(np.uint16)
    if pf in GPS_FMTS: las.gps_time = 1.7e9 + i * 1e-4
    if pf in RGB_FMTS:
        if rgb16: las.red, las.green, las.blue = RGB0[:n, 0].astype(np.uint16) * 257, RGB0[:n, 1].astype(np.uint16) * 257, RGB0[:n, 2].astype(np.uint16) * 257
        else: las.red, las.green, las.blue = RGB0[:n, 0].astype(np.uint16), RGB0[:n, 1].astype(np.uint16), RGB0[:n, 2].astype(np.uint16)
    if pf in (8, 10): las.nir = np.full(n, 1234, np.uint16)


def expected(fn, pf, rgbshift=8):
    r = laspy.read(fn)
    P = np.stack([r.x, r.y, r.z], 1).astype(np.float64)
    F = {'intensity': np.asarray(r.intensity, float), 'classification': np.asarray(r.classification, float),
         'return_number': np.asarray(r.return_number, float), 'point_source_id': np.asarray(r.point_source_id, float)}
    if pf in GPS_FMTS:
        g = np.asarray(r.gps_time, float); F['gps_time'] = g - g[0]
    C = None
    if pf in RGB_FMTS:
        C = (np.stack([r.red, r.green, r.blue], 1).astype(np.int64) >> rgbshift).astype(np.uint8)
    return P, C, F


def gen():
    n = N0
    # 1) 版 × 点の形式（座標はそのまま、scale 0.001）
    combos = [('1.1', pf) for pf in (0, 1)] + [('1.2', pf) for pf in range(4)] + [('1.3', pf) for pf in range(6)] + [('1.4', pf) for pf in range(11)]
    for ver, pf in combos:
        h = laspy.LasHeader(point_format=pf, version=ver); h.scales = [0.001] * 3; h.offsets = [0, 0, 0]
        las = laspy.LasData(h); fill(las, P0, pf, n)
        fn = path(f'las/v{ver}_pf{pf}.las'); las.write(fn)
        P, C, F = expected(fn, pf)
        case(f'las/v{ver}_pf{pf}', [f'las/v{ver}_pf{pf}.las'], f'LAS {ver} 点の形式 {pf}', P=P, C=C, F=F, rgb=pf in RGB_FMTS)
        # LAZ も同じ（Node では展開器が動かないので画面だけ）
        fz = path(f'laz/v{ver}_pf{pf}.laz'); las.write(fz, laz_backend=laspy.LazBackend.Lazrs)
        case(f'laz/v{ver}_pf{pf}', [f'laz/v{ver}_pf{pf}.laz'], f'LAZ {ver} 点の形式 {pf}', P=P, C=C, F=F, rgb=pf in RGB_FMTS, node=False)
    # LAS 1.0（1.1 の版の数字だけ 1.0 にしたもの。頭書きの形は同じ 227 バイト）
    for pf in (0, 1):
        src = open(path(f'las/v1.1_pf{pf}.las'), 'rb').read()
        b = bytearray(src); b[25] = 0
        open(path(f'las/v1.0_pf{pf}.las'), 'wb').write(bytes(b))
        P, C, F = expected(path(f'las/v1.1_pf{pf}.las'), pf)
        case(f'las/v1.0_pf{pf}', [f'las/v1.0_pf{pf}.las'], f'LAS 1.0 点の形式 {pf}', P=P, C=C, F=F, rgb=False)

    # 2) 色が 8 bit（0〜255 のまま書いたもの）
    for pf in (2, 3, 7):
        ver = '1.4' if pf >= 6 else '1.2'
        h = laspy.LasHeader(point_format=pf, version=ver); h.scales = [0.001] * 3
        las = laspy.LasData(h); fill(las, P0, pf, n, rgb16=False)
        fn = path(f'las/rgb8_pf{pf}.las'); las.write(fn)
        P, C, F = expected(fn, pf, rgbshift=0)
        case(f'las/rgb8_pf{pf}', [f'las/rgb8_pf{pf}.las'], f'色が 8 bit（0〜255）の LAS（点の形式 {pf}）', P=P, C=C, F=F, rgb=True)
    # 3) 16 bit の色だが、先頭 2 万点が 255 以下（色の付いていない 0,0,0 の点が先頭にある場合など）
    m = 25000
    rng = np.random.default_rng(3)
    PP = np.concatenate([P0, P0 + [0, 40, 0], P0 + [0, 80, 0], P0 + [0, 120, 0], P0 + [0, 160, 0]])
    for tag, first, rest in (('black', np.zeros((20000, 3), np.uint16), RGB0.astype(np.uint16) * 257),
                             ('black_x256', np.zeros((20000, 3), np.uint16), RGB0.astype(np.uint16) * 256),
                             ('black_raw16', np.zeros((20000, 3), np.uint16), (RGB0.astype(np.uint16) * 256 + rng.integers(0, 256, (5000, 3))).astype(np.uint16)),
                             ('dark', rng.integers(0, 256, (20000, 3)).astype(np.uint16), RGB0.astype(np.uint16) * 257)):
        h = laspy.LasHeader(point_format=3, version='1.2'); h.scales = [0.001] * 3
        las = laspy.LasData(h); las.x, las.y, las.z = PP.T
        rgb = np.concatenate([first, rest]).astype(np.uint16)
        las.red, las.green, las.blue = rgb.T
        las.gps_time = np.arange(m) * 1e-3
        fn = path(f'las/rgb16_first20k_{tag}.las'); las.write(fn)
        P = np.stack([las.x, las.y, las.z], 1)
        r = laspy.read(fn); P = np.stack([r.x, r.y, r.z], 1)
        C = (rgb.astype(np.int64) >> 8).astype(np.uint8)
        case(f'las/rgb16_first20k_{tag}', [f'las/rgb16_first20k_{tag}.las'],
             f'16 bit の色。先頭 2 万点が{"暗い（0〜255/65535）" if tag == "dark" else "色なし（0,0,0）"}、残り 5,000 点は普通の色（{ {"black": "8 bit×257", "dark": "8 bit×257", "black_x256": "8 bit×256", "black_raw16": "16 bit の生の値"}[tag] }）', P=P, C=C, rgb=True)
    # 境界: 先頭 2 万点の最大がちょうど 255 / 256
    for mx in (255, 256):
        h = laspy.LasHeader(point_format=2, version='1.2'); h.scales = [0.001] * 3
        las = laspy.LasData(h); las.x, las.y, las.z = P0.T
        rgb = np.zeros((n, 3), np.uint16); rgb[:, 0] = mx; rgb[1:, 1] = 100
        las.red, las.green, las.blue = rgb.T
        fn = path(f'las/rgb_max{mx}.las'); las.write(fn)
        r = laspy.read(fn); P = np.stack([r.x, r.y, r.z], 1)
        # 仕様（16 bit）どおりなら >>8。8 bit とみなすなら そのまま
        C = (rgb >> 8).astype(np.uint8) if mx > 255 else rgb.astype(np.uint8)
        case(f'las/rgb_max{mx}', [f'las/rgb_max{mx}.las'], f'色の最大値がちょうど {mx}（8 bit／16 bit の判定の境界）', P=P, C=C, rgb=True)

    # 4) extra bytes（点の記録の後ろに独自の欄）
    h = laspy.LasHeader(point_format=3, version='1.4'); h.scales = [0.001] * 3
    h.add_extra_dims([laspy.ExtraBytesParams(name='reflectance', type=np.float32), laspy.ExtraBytesParams(name='deviation', type=np.uint16),
                      laspy.ExtraBytesParams(name='vec', type='3f8')])
    las = laspy.LasData(h); fill(las, P0, 3, n)
    las.reflectance = np.arange(n, dtype=np.float32) * 0.5; las.deviation = np.arange(n) % 100; las.vec = np.ones((n, 3))
    fn = path('las/extrabytes.las'); las.write(fn)
    P, C, F = expected(fn, 3)
    case('las/extrabytes', ['las/extrabytes.las'], 'extra bytes（reflectance f4・deviation u2・vec 3×f8）つきの LAS 1.4 点の形式 3', P=P, C=C, F=F, rgb=True,
         extra={'info_fields': ['reflectance', 'deviation']})
    fz = path('laz/extrabytes.laz'); las.write(fz, laz_backend=laspy.LazBackend.Lazrs)
    case('laz/extrabytes', ['laz/extrabytes.laz'], 'extra bytes つきの LAZ', P=P, C=C, F=F, rgb=True, node=False)

    # 5) ごく小さい scale・巨大な offset（UTM）→ グローバルシフトと 1 mm
    for tag, scale, off, add in [('utm_1e-7', 1e-7, UTM, UTM), ('utm_1mm', 1e-3, UTM, UTM), ('utm_neg', 1e-3, -UTM, -UTM),
                                 ('jgd_plane', 1e-4, [-37000.0, -12000.0, 40.0], np.array([-37000.0, -12000.0, 40.0])), ('scale1', 1.0, [0, 0, 0], np.zeros(3))]:
        h = laspy.LasHeader(point_format=1, version='1.2'); h.scales = [scale] * 3; h.offsets = off
        las = laspy.LasData(h); fill(las, P0 + add, 1, n)
        fn = path(f'las/{tag}.las'); las.write(fn)
        P, C, F = expected(fn, 1)
        case(f'las/{tag}', [f'las/{tag}.las'], f'scale {scale}・offset {list(np.round(off, 3))}', P=P, F=F, rgb=False, mm=True)
        if tag == 'utm_1mm':
            fz = path(f'laz/{tag}.laz'); las.write(fz, laz_backend=laspy.LazBackend.Lazrs)
            case(f'laz/{tag}', [f'laz/{tag}.laz'], f'LAZ: scale {scale}・offset UTM', P=P, F=F, rgb=False, mm=True, node=False)

    # 6) 最初の点が原点（0,0,0）で、残りが UTM（グローバルシフトが最初の点だけで決まると精度が落ちる）
    h = laspy.LasHeader(point_format=1, version='1.2'); h.scales = [0.01] * 3; h.offsets = [0, 0, 0]
    las = laspy.LasData(h)
    Q = np.concatenate([[[0.0, 0.0, 0.0]], P0[1:] + UTM])
    fill(las, Q, 1, n)
    fn = path('las/first_origin_then_utm.las'); las.write(fn)
    P, C, F = expected(fn, 1)
    case('las/first_origin_then_utm', ['las/first_origin_then_utm.las'], '最初の点だけ (0,0,0)、残り 4,999 点は UTM（座標は cm 単位で書いたもの）', P=P, F=F, rgb=False, mm=True)

    # 7) LAS 1.4: 古い点数の欄（32 bit）が 0 で 64 bit の点数だけがある（点の形式 6 は必ずこう）→ 1) で済み
    #    古い点数の欄と 64 bit の点数が違う（壊れ気味）は A03 の範囲なので作らない
