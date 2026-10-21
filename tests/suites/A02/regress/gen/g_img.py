# 画像（1 画素 = 1 点）と TIFF/GeoTIFF の変種
import io, gzip, struct, math
import numpy as np
from PIL import Image
import tifffile
from common import *

B = ('browser',)          # createImageBitmap を使う形式は Node では動かない
BW = ('node', 'browser')
W, H = 16, 12
RED, GRN, BLU, WHT = (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)


def quad_rgb():
    a = np.zeros((H, W, 3), np.uint8)
    a[:H // 2, :W // 2] = RED; a[:H // 2, W // 2:] = GRN; a[H // 2:, :W // 2] = BLU; a[H // 2:, W // 2:] = WHT
    return a


def quad_parts(colors=(RED, GRN, BLU, WHT), ctol=4, off=0.0, skip_last_col=False, scale=1.0):
    """画素 (列 c, 行 r) → 点 (c, -r)。TIFF（位置情報なし）は +0.5 ずれる（off=0.5）"""
    e = 0.25 * scale
    lastc = W - 2 if skip_last_col else W - 1
    q = [(0, W // 2 - 1, 0, H // 2 - 1), (W // 2, lastc, 0, H // 2 - 1), (0, W // 2 - 1, H // 2, H - 1), (W // 2, lastc, H // 2, H - 1)]
    out = []
    for (c0, c1, r0, r1), col, nm in zip(q, colors, ['TL', 'TR', 'BL', 'BR']):
        if col is None: continue
        out.append({'name': nm, 'box': [(c0 + off) * scale - e, -(r1 + off) * scale - e, -e, (c1 + off) * scale + e, -(r0 + off) * scale + e, e], 'color': list(col), 'ctol': ctol,
                    'frac': [((c1 - c0 + 1) * (r1 - r0 + 1)) / ((lastc + 1) * H) - 0.001, ((c1 - c0 + 1) * (r1 - r0 + 1)) / ((lastc + 1) * H) + 0.001]})
    return out


def img_expect(ctol=4, colors=(RED, GRN, BLU, WHT), skip_last_col=False, extra=None):
    n = (W - (1 if skip_last_col else 0)) * H
    e = {'n': [n, n], 'rgb': True, 'parts': quad_parts(colors, ctol, skip_last_col=skip_last_col), 'strayMax': 0.0,
         'bbox': [[0, -(H - 1), 0], [W - (2 if skip_last_col else 1), 0, 0]], 'tol': 1e-6}
    if extra: e.update(extra)
    return e


def gen_images():
    a = quad_rgb()
    im = Image.fromarray(a)
    # PNG のいろいろ
    im.save(path('img/rgb.png'))
    case('png_rgb', ['img/rgb.png'], img_expect(), B, 'PNG（RGB 8 bit）')
    rgba = np.dstack([a, np.full((H, W), 255, np.uint8)]); rgba[:, -1, 3] = 0
    Image.fromarray(rgba, 'RGBA').save(path('img/rgba.png'))
    case('png_rgba', ['img/rgba.png'], img_expect(skip_last_col=True), B, 'PNG（RGBA。右端の列が透明 → 点にしない）')
    a16 = (a.astype(np.uint16) * 257)
    import png_writer
    png_writer.write_png16(path('img/rgb16.png'), a16)
    case('png_rgb16', ['img/rgb16.png'], img_expect(), B, 'PNG（RGB 16 bit）')
    im.quantize(4).save(path('img/palette.png'))
    case('png_palette', ['img/palette.png'], img_expect(), B, 'PNG（パレット）')
    g = np.zeros((H, W), np.uint8); g[:, :W // 2] = 50; g[:, W // 2:] = 200
    Image.fromarray(g, 'L').save(path('img/gray.png'))
    case('png_gray', ['img/gray.png'], img_expect(colors=((50,) * 3, (200,) * 3, (50,) * 3, (200,) * 3)), B, 'PNG（グレー）')
    # 半透明（アルファ 128）: 色は元の値のまま
    semi = np.dstack([a, np.full((H, W), 128, np.uint8)])
    Image.fromarray(semi, 'RGBA').save(path('img/semi.png'))
    case('png_semi', ['img/semi.png'], img_expect(ctol=2), B, 'PNG（アルファ 128 の半透明）: 色の値が変わらないこと')
    # gAMA（γ=1.0）付き → 色の管理で値が変わるか（情報）
    png_writer.write_png8_gamma(path('img/gamma.png'), np.full((H, W, 3), 128, np.uint8), 100000)
    case('png_gamma', ['img/gamma.png'], {'n': [W * H, W * H], 'color': [128, 128, 128], 'ctol': 2}, B, '（情報）gAMA チャンクつき PNG の色の値（元の画素値 128）')
    # JPEG（画質 95、ブロックの境目の色は許容を広く）
    big = np.kron(a, np.ones((2, 2, 1), np.uint8))  # 32×24
    Image.fromarray(big).save(path('img/q.jpg'), quality=95)
    e = img_expect(ctol=40)
    for p in e['parts']:  # 2 倍の大きさ
        p['box'] = [p['box'][0] * 2, p['box'][1] * 2 - 1, -0.5, p['box'][3] * 2 + 1, p['box'][4] * 2, 0.5]
    e.update({'n': [W * H * 4, W * H * 4], 'bbox': [[0, -(2 * H - 1), 0], [2 * W - 1, 0, 0]]})
    case('jpg_q95', ['img/q.jpg'], e, B, 'JPEG（画質 95）')
    # EXIF の向き（6 = 右に 90°回転）
    exif = Image.Exif(); exif[0x0112] = 6
    Image.fromarray(big).save(path('img/exif6.jpg'), quality=95, exif=exif.tobytes())
    case('jpg_exif6', ['img/exif6.jpg'], {'n': [W * H * 4, W * H * 4], 'bbox': [[0, -(2 * H - 1), 0], [2 * W - 1, 0, 0]], 'tol': 1e-6}, B, '（情報）EXIF の向き 6 の JPEG（画素の並びのまま／回転のどちらか）')
    # BMP: 24 bit・32 bit（アルファ）・8 bit パレット・1 bit・上から下（高さが負）
    im.save(path('img/rgb24.bmp'))
    case('bmp_24', ['img/rgb24.bmp'], img_expect(), B, 'BMP 24 bit')
    Image.fromarray(rgba, 'RGBA').save(path('img/rgba32.bmp'))
    case('bmp_32', ['img/rgba32.bmp'], img_expect(skip_last_col=True), B, 'BMP 32 bit（アルファ。右端の列が透明）')
    im.quantize(4).save(path('img/pal8.bmp'))
    case('bmp_pal8', ['img/pal8.bmp'], img_expect(), B, 'BMP 8 bit パレット')
    bw = np.zeros((H, W), bool); bw[:, W // 2:] = True
    Image.fromarray(bw).convert('1').save(path('img/bw1.bmp'))
    case('bmp_1bit', ['img/bw1.bmp'], img_expect(colors=((0,) * 3, (255,) * 3, (0,) * 3, (255,) * 3)), B, 'BMP 1 bit')
    raw = open(path('img/rgb24.bmp'), 'rb').read()
    hh = struct.unpack('<i', raw[22:26])[0]
    rows = [raw[54 + r * (W * 3):54 + (r + 1) * (W * 3)] for r in range(H)][::-1]
    open(path('img/topdown.bmp'), 'wb').write(raw[:22] + struct.pack('<i', -hh) + raw[26:54] + b''.join(rows))
    case('bmp_topdown', ['img/topdown.bmp'], img_expect(), B, 'BMP（上から下に並ぶ。高さが負）')
    # GIF（透明色）
    p = im.quantize(4)
    pal = p.getpalette()[:12]
    idx = np.array(p); tcol = int(idx[0, -1])
    pa = idx.copy(); pa[:, -1] = 4  # 透明用の 5 色目
    gim = Image.fromarray(pa.astype(np.uint8), 'P'); gim.putpalette(pal + [1, 2, 3] + [0] * (768 - 15))
    gim.save(path('img/transp.gif'), transparency=4)
    case('gif_transp', ['img/transp.gif'], img_expect(skip_last_col=True), B, 'GIF（透明色。右端の列）')
    # WebP（可逆・アルファ）
    Image.fromarray(rgba, 'RGBA').save(path('img/lossless.webp'), lossless=True)
    case('webp_alpha', ['img/lossless.webp'], img_expect(skip_last_col=True), B, 'WebP（可逆・アルファ）')
    # TGA: 24 bit・32 bit・RLE・パレット・グレー・下から上
    im.save(path('img/rgb24.tga'))
    case('tga_24', ['img/rgb24.tga'], img_expect(), BW, 'TGA 24 bit')
    im.save(path('img/rle.tga'), compression='tga_rle')
    case('tga_rle', ['img/rle.tga'], img_expect(), BW, 'TGA（RLE 圧縮）')
    Image.fromarray(rgba, 'RGBA').save(path('img/rgba32.tga'))
    case('tga_32', ['img/rgba32.tga'], img_expect(skip_last_col=True), BW, 'TGA 32 bit（アルファ）')
    im.quantize(4).save(path('img/pal.tga'))
    case('tga_pal', ['img/pal.tga'], img_expect(), BW, 'TGA（パレット＝カラーマップ）')
    Image.fromarray(g, 'L').save(path('img/gray.tga'))
    case('tga_gray', ['img/gray.tga'], img_expect(colors=((50,) * 3, (200,) * 3, (50,) * 3, (200,) * 3)), BW, 'TGA（グレー）')
    # 32 bit だがアルファの使用ビット数 0（アルファは 0 のまま）→ 全部見えるべき
    t = bytearray(open(path('img/rgba32.tga'), 'rb').read())
    t[17] = t[17] & 0xF0
    body = bytearray(t)
    hdr = 18 + body[0]
    for i in range(W * H): body[hdr + 4 * i + 3] = 0
    open(path('img/alpha0.tga'), 'wb').write(bytes(body))
    case('tga_alpha0', ['img/alpha0.tga'], img_expect(), BW, 'TGA 32 bit・アルファのビット数 0（アルファ欄は使わない）')
    hdr_desc = open(path('img/rgb24.tga'), 'rb').read()[17]
    # 下から上（desc の bit5 = 0）を手で作る
    raw = bytearray(18); raw[2] = 2; raw[12:14] = struct.pack('<H', W); raw[14:16] = struct.pack('<H', H); raw[16] = 24; raw[17] = 0
    px = a[::-1, :, ::-1].tobytes()
    open(path('img/bottomup.tga'), 'wb').write(bytes(raw) + px)
    case('tga_bottomup', ['img/bottomup.tga'], img_expect(), BW, f'TGA（下から上の並び。Pillow の書いた TGA の desc は {hdr_desc}）')
    # PNM: P1〜P6・16 bit・注釈
    im.save(path('img/p6.ppm'))
    case('ppm_p6', ['img/p6.ppm'], img_expect(), BW, 'PPM（P6）')
    txt = 'P3\n# comment\n%d %d\n255\n' % (W, H) + '\n'.join(' '.join(str(v) for v in row.ravel()) for row in a) + '\n'
    open(path('img/p3.ppm'), 'w').write(txt)
    case('ppm_p3', ['img/p3.ppm'], img_expect(), BW, 'PPM（P3 文字・注釈）')
    open(path('img/p6_16.ppm'), 'wb').write(b'P6\n%d %d\n65535\n' % (W, H) + a16.astype('>u2').tobytes())
    case('ppm_p6_16', ['img/p6_16.ppm'], img_expect(), BW, 'PPM（P6、16 bit）')
    Image.fromarray(g, 'L').save(path('img/p5.pgm'))
    case('pgm_p5', ['img/p5.pgm'], img_expect(colors=((50,) * 3, (200,) * 3, (50,) * 3, (200,) * 3)), BW, 'PGM（P5）')
    open(path('img/p2.pgm'), 'w').write('P2\n%d %d\n1000\n' % (W, H) + '\n'.join(' '.join(str(int(v) * 4) for v in row) for row in g) + '\n')
    case('pgm_p2_max1000', ['img/p2.pgm'], img_expect(colors=((51,) * 3, (204,) * 3, (51,) * 3, (204,) * 3), ctol=2), BW, 'PGM（P2、最大値 1000）')
    Image.fromarray(bw).convert('1').save(path('img/p4.pbm'))
    case('pbm_p4', ['img/p4.pbm'], img_expect(colors=((0,) * 3, (255,) * 3, (0,) * 3, (255,) * 3)), BW, 'PBM（P4）')
    p1 = 'P1\n%d %d\n' % (W, H) + '\n'.join(''.join('0' if v else '1' for v in row) for row in bw) + '\n'
    open(path('img/p1_nospace.pbm'), 'w').write(p1)
    case('pbm_p1_nospace', ['img/p1_nospace.pbm'], img_expect(colors=((0,) * 3, (255,) * 3, (0,) * 3, (255,) * 3)), BW, 'PBM（P1、数字の間に空白なし。仕様で許される書き方）')
    # ICO / CUR / ICNS
    sq = np.kron(a[:, :12], np.ones((1, 1, 1), np.uint8))
    # 新しい Pillow は画像より大きい大きさを書かない（16×12 の画像に 16×16 を指定すると、中身のない 6 バイトの ICO になっていた）。正方形にしてから書く
    ico_im = im.resize((16, 16), Image.NEAREST)
    ico_im.save(path('img/png.ico'), sizes=[(16, 16)])
    try:
        ico_im.save(path('img/bmp.ico'), sizes=[(16, 16)], bitmap_format='bmp')
        case('ico_bmp', ['img/bmp.ico'], {'n': [256, 256], 'rgb': True}, B, 'ICO（中身が BMP）')
    except Exception as ex:
        print('ico bmp skip', ex)
    case('ico_png', ['img/png.ico'], {'n': [256, 256], 'rgb': True}, B, 'ICO（中身が PNG、16×16 に縮小）')
    # XBM・XPM・WBMP
    Image.fromarray(bw).convert('1').save(path('img/bw.xbm'))
    case('xbm', ['img/bw.xbm'], img_expect(colors=((255,) * 3, (0,) * 3, (255,) * 3, (0,) * 3)), BW, 'XBM')
    chars = {RED: 'r', GRN: 'g', BLU: 'b', WHT: 'w'}

    def xpm(colors_lines, cpp=1, pix=None):
        rows = ['"' + ''.join((pix or chars)[tuple(int(x) for x in v)] for v in row) + '"' for row in a]
        return '/* XPM */\nstatic char *x[] = {\n"%d %d %d %d",\n' % (W, H, len(colors_lines), cpp) + ',\n'.join(colors_lines + rows) + '\n};\n'
    open(path('img/hex.xpm'), 'w').write(xpm(['"r c #FF0000"', '"g c #00FF00"', '"b c #0000FF"', '"w c #FFFFFF"']))
    case('xpm_hex', ['img/hex.xpm'], img_expect(), BW, 'XPM（#RRGGBB）')
    open(path('img/short.xpm'), 'w').write(xpm(['"r c #F00"', '"g c #0F0"', '"b c #00F"', '"w c #FFF"']))
    case('xpm_short', ['img/short.xpm'], img_expect(), BW, 'XPM（#RGB の短い書き方）')
    open(path('img/long.xpm'), 'w').write(xpm(['"r c #FFFF00000000"', '"g c #0000FFFF0000"', '"b c #00000000FFFF"', '"w c #FFFFFFFFFFFF"']))
    case('xpm_long', ['img/long.xpm'], img_expect(), BW, 'XPM（#RRRRGGGGBBBB）')
    open(path('img/named.xpm'), 'w').write(xpm(['"r c red"', '"g c lime"', '"b c blue"', '"w c white"']))
    case('xpm_named', ['img/named.xpm'], img_expect(), BW, 'XPM（色の名前 red lime blue white）')
    pix2 = {RED: 'r.', GRN: 'g.', BLU: 'b.', WHT: 'w.'}
    open(path('img/cpp2.xpm'), 'w').write(xpm(['"r. c #FF0000"', '"g. c #00FF00"', '"b. c #0000FF"', '"w. s white c #FFFFFF"'], cpp=2, pix=pix2))
    case('xpm_cpp2', ['img/cpp2.xpm'], img_expect(), BW, 'XPM（1 画素 2 文字・s キー）')

    def mb(v):
        out = [v & 127]; v >>= 7
        while v: out.insert(0, (v & 127) | 128); v >>= 7
        return bytes(out)
    rows = b''.join(np.packbits(r).tobytes() for r in bw.astype(np.uint8))
    open(path('img/bw.wbmp'), 'wb').write(b'\0\0' + mb(W) + mb(H) + rows)
    case('wbmp', ['img/bw.wbmp'], img_expect(colors=((0,) * 3, (255,) * 3, (0,) * 3, (255,) * 3)), BW, 'WBMP')
    # SVG（画面側で画素にする）: 幅・高さあり／viewBox だけ／mm 単位／svgz
    def svg(attrs):
        return f'<svg xmlns="http://www.w3.org/2000/svg" {attrs} viewBox="0 0 {W} {H}"><rect x="0" y="0" width="{W // 2}" height="{H // 2}" fill="#f00"/><rect x="{W // 2}" y="0" width="{W // 2}" height="{H // 2}" fill="#0f0"/><rect x="0" y="{H // 2}" width="{W // 2}" height="{H // 2}" fill="#00f"/><rect x="{W // 2}" y="{H // 2}" width="{W // 2}" height="{H // 2}" fill="#fff"/></svg>'
    open(path('img/wh.svg'), 'w').write(svg(f'width="{W}" height="{H}"'))
    s4 = 4  # 小さな SVG は 4 倍で描く
    e = {'n': [W * H * 16, W * H * 16], 'rgb': True, 'parts': [dict(p, box=[p['box'][0] * s4 - 1, p['box'][1] * s4 - 2, -0.5, p['box'][3] * s4 + 2, p['box'][4] * s4 + 1, 0.5], ctol=4, frac=None) for p in quad_parts()], 'strayMax': 0.0}
    for p in e['parts']: p.pop('frac')
    case('svg_wh', ['img/wh.svg'], e, ('browser', 'electron'), 'SVG（幅・高さあり）')
    open(path('img/viewbox.svg'), 'w').write(svg(''))
    case('svg_viewbox', ['img/viewbox.svg'], {'rgb': True, 'n': [1000, 5000000]}, ('browser', 'electron'), 'SVG（viewBox だけで幅・高さなし）')
    open(path('img/mm.svg'), 'w').write(svg('width="16mm" height="12mm"'))
    case('svg_mm', ['img/mm.svg'], {'rgb': True, 'n': [1000, 5000000]}, ('browser', 'electron'), 'SVG（幅・高さが mm）')
    open(path('img/z.svgz'), 'wb').write(gzip.compress(svg(f'width="{W}" height="{H}"').encode()))
    case('svgz', ['img/z.svgz'], e, ('browser', 'electron'), 'SVGZ（gzip 圧縮）')
    # 外部の画像を参照する SVG（読みに行かないこと・落ちないこと）
    open(path('img/extref.svg'), 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#00f"/><image href="http://127.0.0.1:8721/leak.png" width="{W}" height="{H}"/><script>window.top.__svgScript = 1</script></svg>')
    case('svg_extref', ['img/extref.svg'], {'rgb': True, 'n': [W * H * 16, W * H * 16], 'color': [0, 0, 255], 'ctol': 2}, ('browser', 'electron'), 'SVG の外部参照・script（読みに行かない・動かない）')
    # 全部透明
    Image.fromarray(np.zeros((H, W, 4), np.uint8), 'RGBA').save(path('img/alltransparent.png'))
    case('png_alltransparent', ['img/alltransparent.png'], {'error': '点がありません|透明', 'nfiles': 0}, B, '全部透明な PNG → 分かる知らせ')


def gen_tiff():
    a = quad_rgb()
    X = np.arange(W)[None, :].repeat(H, 0); Y = np.arange(H)[:, None].repeat(W, 1)
    dem = (10 + 0.5 * X + 0.25 * Y).astype(np.float32)

    def dem_e(z, off=0.5, origin=(0, 0), res=(1, -1), skip=None, extra=None):
        zz = z.astype(np.float64)
        m = np.ones_like(zz, bool) if skip is None else ~skip
        xs = origin[0] + (X + off) * res[0]; ys = origin[1] + (Y + off) * res[1]
        e = {'n': [int(m.sum()), int(m.sum())], 'bbox': [[xs[m].min(), ys[m].min(), zz[m].min()], [xs[m].max(), ys[m].max(), zz[m].max()]], 'tol': 1e-3, 'fields': ['value']}
        if extra: e.update(extra)
        return e
    geo_tags = lambda ox, oy, sx, sy, raster_type=1: [(33550, 'd', 3, (sx, sy, 0.0), False), (33922, 'd', 6, (0, 0, 0, ox, oy, 0), False),
                                                     (34735, 'H', 16, (1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, raster_type, 3072, 0, 1, 32654), False)]
    tifffile.imwrite(path('tif/dem_f32.tif'), dem)
    case('tif_dem_f32', ['tif/dem_f32.tif'], dem_e(dem), BW, 'float32 の高さ（位置情報なし）')
    tifffile.imwrite(path('tif/dem_f64.tif'), dem.astype(np.float64))
    case('tif_dem_f64', ['tif/dem_f64.tif'], dem_e(dem), BW, 'float64 の高さ')
    d16 = (dem * 100).astype(np.uint16); d16[0, 0] = 0
    tifffile.imwrite(path('tif/dem_u16_nd0.tif'), d16, extratags=[(42113, 's', 0, '0', False)])
    sk = np.zeros_like(d16, bool); sk[0, 0] = True
    case('tif_dem_u16_nodata0', ['tif/dem_u16_nd0.tif'], dem_e(d16, skip=sk), BW, 'uint16・nodata 0')
    di = (dem * 10).astype(np.int16); di[1, 1] = -32768
    tifffile.imwrite(path('tif/dem_i16.tif'), di, extratags=[(42113, 's', 0, '-32768', False)])
    sk = np.zeros_like(di, bool); sk[1, 1] = True
    case('tif_dem_i16_nodata', ['tif/dem_i16.tif'], dem_e(di, skip=sk), BW, 'int16・nodata -32768')
    # nodata の文字列が float32 の最小値の近似（QGIS/ArcGIS などがよく書く）
    fmin = np.finfo(np.float32).min
    for nm, s in [('exact', '-3.4028234663852886e+38'), ('arcgis', '-3.40282346639e+038'), ('short', '-3.40282e+38')]:
        z = dem.copy(); z[2, 3] = fmin; z[5, 7] = fmin
        tifffile.imwrite(path(f'tif/nodata_{nm}.tif'), z, extratags=[(42113, 's', 0, s, False)] + geo_tags(539000, 3836300, 2, 2))
        sk = np.zeros_like(z, bool); sk[2, 3] = sk[5, 7] = True
        case(f'tif_nodata_{nm}', [f'tif/nodata_{nm}.tif'], dem_e(z, origin=(539000, 3836300), res=(2, -2), skip=sk, extra={'offset': [539000, 3836300, 0]}), BW, f'float32 の nodata が「{s}」（値は float32 の最小値）')
    # 位置情報: PixelIsArea と PixelIsPoint
    tifffile.imwrite(path('tif/geo_area.tif'), dem, extratags=geo_tags(1000.0, 2000.0, 0.5, 0.5, 1))
    case('tif_geo_area', ['tif/geo_area.tif'], dem_e(dem, origin=(1000, 2000), res=(0.5, -0.5)), BW, 'GeoTIFF（PixelIsArea、画素の中心に点）')
    tifffile.imwrite(path('tif/geo_point.tif'), dem, extratags=geo_tags(1000.0, 2000.0, 0.5, 0.5, 2))
    case('tif_geo_point', ['tif/geo_point.tif'], dem_e(dem, off=0.0, origin=(1000, 2000), res=(0.5, -0.5)), BW, 'GeoTIFF（PixelIsPoint: 結び点が画素の中心）')
    M = [0.5, 0, 0, 1000.0, 0, -0.5, 0, 2000.0, 0, 0, 1, 0, 0, 0, 0, 1]
    tifffile.imwrite(path('tif/geo_matrix.tif'), dem, extratags=[(34264, 'd', 16, tuple(M), False), (34735, 'H', 16, (1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 32654), False)])
    case('tif_geo_matrix', ['tif/geo_matrix.tif'], dem_e(dem, origin=(1000, 2000), res=(0.5, -0.5)), BW, 'GeoTIFF（ModelTransformation の行列）')
    # タイル・BigTIFF・複数ページ・面ごと（planar）
    big = np.tile(dem, (4, 4))  # 64×48
    tifffile.imwrite(path('tif/tiled.tif'), big, tile=(16, 16))
    Xb = np.arange(64)[None, :].repeat(48, 0); Yb = np.arange(48)[:, None].repeat(64, 1)
    case('tif_tiled', ['tif/tiled.tif'], {'n': [64 * 48, 64 * 48], 'bbox': [[0.5, -47.5, float(big.min())], [63.5, -0.5, float(big.max())]], 'tol': 1e-3}, BW, 'タイル分割（16×16）')
    tifffile.imwrite(path('tif/bigtiff.tif'), dem, bigtiff=True)
    case('tif_bigtiff', ['tif/bigtiff.tif'], dem_e(dem), BW, 'BigTIFF')
    with tifffile.TiffWriter(path('tif/multipage.tif')) as tw:
        tw.write(dem); tw.write(dem + 100)
    case('tif_multipage', ['tif/multipage.tif'], dem_e(dem), BW, '複数ページ（1 ページ目を使う）')
    tifffile.imwrite(path('tif/planar_rgb.tif'), np.moveaxis(a, 2, 0), planarconfig='separate', photometric='rgb')
    e = {'n': [W * H, W * H], 'rgb': True, 'parts': quad_parts(off=0.5), 'strayMax': 0.0}
    case('tif_planar_rgb', ['tif/planar_rgb.tif'], e, BW, 'RGB を面ごとに格納（planarconfig=2）')
    # 写真としての TIFF: RGB 8 bit・RGBA・RGB 16 bit・パレット・グレー
    tifffile.imwrite(path('tif/rgb8.tif'), a, photometric='rgb')
    case('tif_rgb8', ['tif/rgb8.tif'], e, BW, 'RGB 8 bit')
    rgba = np.dstack([a, np.full((H, W), 255, np.uint8)]); rgba[:, -1, 3] = 0
    tifffile.imwrite(path('tif/rgba8.tif'), rgba, photometric='rgb', extrasamples=['unassalpha'])
    e2 = {'n': [W * H - H, W * H - H], 'rgb': True, 'parts': quad_parts(off=0.5, skip_last_col=True), 'strayMax': 0.0}
    case('tif_rgba8', ['tif/rgba8.tif'], e2, BW, 'RGBA 8 bit（右端の列が透明）')
    tifffile.imwrite(path('tif/rgb16.tif'), a.astype(np.uint16) * 257, photometric='rgb')
    case('tif_rgb16', ['tif/rgb16.tif'], {**e, 'bbox': [[0.5, -11.5, 0], [15.5, -0.5, 0]], 'tol': 1e-6}, BW, 'RGB 16 bit（写真。色付きの平面になるべき）')
    Image.fromarray(a).quantize(4).save(path('tif/palette.tif'))
    case('tif_palette', ['tif/palette.tif'], {**e, 'bbox': [[0.5, -11.5, 0], [15.5, -0.5, 0]], 'tol': 1e-6}, BW, 'パレット（カラーマップ）の TIFF（色付きの平面になるべき）')
    g = np.zeros((H, W), np.uint8); g[:, W // 2:] = 200
    tifffile.imwrite(path('tif/gray8.tif'), g)
    case('tif_gray8', ['tif/gray8.tif'], {'n': [W * H, W * H], 'bbox': [[0.5, -11.5, 0], [15.5, -0.5, 200]], 'tol': 1e-6}, BW, '（情報）8 bit グレーの写真 TIFF → 値を高さにする（PNG のグレーは平面）')
    # 圧縮（Pillow: LZW・Deflate・PackBits・JPEG）
    for comp in ['tiff_lzw', 'tiff_adobe_deflate', 'packbits', 'jpeg']:
        try:
            Image.fromarray(a).save(path(f'tif/rgb_{comp}.tif'), compression=comp)
        except Exception as ex:
            print('tiff comp skip', comp, ex); continue
        ee = dict(e); ee['parts'] = quad_parts(off=0.5, ctol=40 if comp == 'jpeg' else 4)
        case(f'tif_rgb_{comp}', [f'tif/rgb_{comp}.tif'], ee, BW, f'RGB 8 bit・圧縮 {comp}')
    try:
        Image.fromarray(dem, 'F').save(path('tif/dem_lzw.tif'), compression='tiff_lzw')
        case('tif_dem_lzw', ['tif/dem_lzw.tif'], dem_e(dem), BW, 'float32 の高さ・LZW')
        Image.fromarray(dem, 'F').save(path('tif/dem_deflate.tif'), compression='tiff_adobe_deflate')
        case('tif_dem_deflate', ['tif/dem_deflate.tif'], dem_e(dem), BW, 'float32 の高さ・Deflate')
    except Exception as ex:
        print('dem comp skip', ex)


def gen():
    gen_images(); gen_tiff()
