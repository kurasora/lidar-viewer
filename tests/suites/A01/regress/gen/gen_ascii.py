# 文字の点群（.txt .asc .neu .xyz .pts .csv）の試験用ファイル
import numpy as np
from common import *


def write_text(rel, lines, head=(), nl='\n', enc='utf-8', bom=b''):
    with open(path(rel), 'wb') as f:
        f.write(bom + (nl.join(list(head) + list(lines)) + nl).encode(enc))


def gen():
    n = N0
    X, Y, Z = P0.T
    rows6 = [f'{X[i]:.6f} {Y[i]:.6f} {Z[i]:.6f}' for i in range(n)]
    P6 = reparse(rows6)
    rgbi = [f'{RGB0[i,0]} {RGB0[i,1]} {RGB0[i,2]} {I0[i]:g}' for i in range(n)]
    # 1) 区切り（空白・タブ・カンマ・セミコロン・連続する空白・混在）× 拡張子
    seps = {'space': ' ', 'tab': '\t', 'comma': ',', 'semicolon': ';', 'multispace': '   ', 'mixed': ' ,\t'}
    for nm, sp in seps.items():
        for ext in ('txt', 'xyz', 'asc', 'neu', 'csv', 'pts'):
            if nm not in ('space', 'comma') and ext not in ('txt', 'csv'): continue
            lines = [sp.join(r.split(' ')) for r in rows6]
            write_text(f'ascii/sep_{nm}.{ext}', lines)
            case(f'ascii/sep_{nm}_{ext}', [f'ascii/sep_{nm}.{ext}'], f'x y z だけ、区切り {nm!s}（.{ext}）', P=P6, rgb=False)
    # 2) 7 列（x y z r g b intensity）と見出しの書き方
    lines7 = [r + ' ' + c for r, c in zip(rows6, rgbi)]
    heads = {
        'cc_slash': '//X Y Z R G B Intensity',
        'hash': '# x y z red green blue intensity',
        'plain_csv': 'X,Y,Z,Red,Green,Blue,Intensity',
        'quoted_csv': '"X","Y","Z","R","G","B","Intensity"',
        'none': None,
        'east_north': 'Easting Northing Elevation R G B Intensity',
        'slash_space': '// X Y Z R G B Intensity',
    }
    for nm, h in heads.items():
        csv = 'csv' in nm
        lines = [l.replace(' ', ',') for l in lines7] if csv else lines7
        write_text(f'ascii/head_{nm}.{"csv" if csv else "txt"}', lines, head=[h] if h else [])
        case(f'ascii/head_{nm}', [f'ascii/head_{nm}.{"csv" if csv else "txt"}'], f'7 列（x y z r g b 強度）、見出し: {h!r}', P=P6, C=RGB0, F={'intensity': I0}, rgb=True)
    # 見出しの名前に空白が入る（CSV。"Point X" など）
    lines = [l.replace(' ', ',') for l in lines7]
    write_text('ascii/head_spaces.csv', lines, head=['Point X,Point Y,Point Z,Red,Green,Blue,Scalar field'])
    case('ascii/head_spaces', ['ascii/head_spaces.csv'], 'CSV の見出しの名前に空白（Point X,Point Y,Point Z,Red,Green,Blue,Scalar field）', P=P6, C=RGB0, rgb=True)
    write_text('ascii/head_sf_space.asc', [r + f' {I0[i]:g}' for i, r in enumerate(rows6)], head=['//X Y Z Scalar field'])
    case('ascii/head_sf_space', ['ascii/head_sf_space.asc'], 'CloudCompare の見出し //X Y Z Scalar field（値の欄の名前に空白）', P=P6, F={'scalar field': I0}, rgb=False, extra={'note': '欄の名前は「Scalar field」が期待'})
    # CloudCompare が CSV（カンマ区切り）で書いたもの: 値の欄の名前の空白はそのまま（CloudCompare は区切り文字だけを _ にする）
    rn = (np.arange(n) % 3 + 1); cl = (np.arange(n) % 7)
    lines = [f'{X[i]:.6f},{Y[i]:.6f},{Z[i]:.6f},{RGB0[i,0]},{RGB0[i,1]},{RGB0[i,2]},{I0[i]:g},{rn[i]},{cl[i]}' for i in range(n)]
    write_text('ascii/cc_csv_las_fields.csv', lines, head=['//X,Y,Z,R,G,B,Intensity,Return Number,Classification'])
    case('ascii/cc_csv_las_fields', ['ascii/cc_csv_las_fields.csv'], 'CloudCompare の CSV 書き出し（LAS 由来の欄 Return Number・Classification、名前に空白）', P=P6, C=RGB0,
         F={'intensity': I0, 'return number': rn, 'classification': cl}, rgb=True, extra={'note': '欄の名前と値の対応'})
    # CloudCompare の float の色（Rf Gf Bf、0〜1）
    lines = [f'{r} {RGB0[i,0]/255:.6f} {RGB0[i,1]/255:.6f} {RGB0[i,2]/255:.6f}' for i, r in enumerate(rows6)]
    write_text('ascii/head_rf_gf_bf.txt', lines, head=['//X Y Z Rf Gf Bf'])
    case('ascii/head_rf_gf_bf', ['ascii/head_rf_gf_bf.txt'], 'CloudCompare の float の色の見出し //X Y Z Rf Gf Bf（0〜1）', P=P6, C=RGB0, rgb=True, extra={'color_tol': 1, 'note': 'CloudCompare は Rf Gf Bf を 0〜1 の色として読む'})
    # 色が 0〜1 の小数（見出しは R G B）
    write_text('ascii/rgb_float01.txt', lines, head=['//X Y Z R G B'])
    case('ascii/rgb_float01', ['ascii/rgb_float01.txt'], '見出し //X Y Z R G B で値は 0〜1 の小数', P=P6, C=RGB0, rgb=True, extra={'color_tol': 1, 'note': '色として読むか、少なくとも黒にならないこと'})
    # 3) PTS（先頭行が点数、x y z 強度 r g b。強度は -2048〜2047）
    Ipts = (I0 * 24 - 2048).astype(int)
    lines = [f'{r} {Ipts[i]} {RGB0[i,0]} {RGB0[i,1]} {RGB0[i,2]}' for i, r in enumerate(rows6)]
    write_text('ascii/leica.pts', lines, head=[str(n)])
    case('ascii/leica_pts', ['ascii/leica.pts'], 'PTS（先頭行 = 点数、x y z 強度(-2048〜2047) r g b）', P=P6, C=RGB0, F={'intensity': Ipts}, rgb=True)
    write_text('ascii/pts_count_wrong.pts', lines, head=['4000'])
    case('ascii/pts_count_wrong', ['ascii/pts_count_wrong.pts'], 'PTS の点数の行が 4000（実際は 5000 行）', P=P6, C=RGB0, rgb=True, extra={'note': '5000 点を読むのは CloudCompare と同じ'})
    lines4 = [f'{r} {Ipts[i]}' for i, r in enumerate(rows6)]
    write_text('ascii/pts4.pts', lines4, head=[str(n)])
    case('ascii/pts4', ['ascii/pts4.pts'], 'PTS（x y z 強度 の 4 列）', P=P6, F={'intensity': Ipts}, rgb=False)
    # PTS で強度が 0〜255 の整数（x y z i r g b）。強度の列を色と取り違えないか
    I255 = np.round(I0).astype(int)
    lines = [f'{r} {I255[i]} {RGB0[i,0]} {RGB0[i,1]} {RGB0[i,2]}' for i, r in enumerate(rows6)]
    write_text('ascii/pts_i255.pts', lines, head=[str(n)])
    case('ascii/pts_i255', ['ascii/pts_i255.pts'], 'PTS（x y z 強度 r g b、強度が 0〜255 の整数）', P=P6, C=RGB0, F={'intensity': I255}, rgb=True)
    write_text('ascii/xyzirgb_i255.txt', lines)
    case('ascii/xyzirgb_i255', ['ascii/xyzirgb_i255.txt'], '7 列（x y z 強度 r g b、強度が 0〜255 の整数、見出しなし）', P=P6, C=RGB0, rgb=True, extra={'note': '見出しがないので推測。CloudCompare の推測と比べる'})
    # 4) 指数表記・余分な列・空行・途中の注釈・行頭の空白・行末の区切り
    lines = [f'  {X[i]:.8e} {Y[i]:.8e} {Z[i]:.8e} {I0[i]:g} 1 2 3 4 5,' for i in range(n)]
    lines.insert(1000, ''); lines.insert(2000, '# comment in the middle'); lines.insert(3000, '// another comment'); lines.insert(4000, '   ')
    write_text('ascii/exp_extra.txt', lines)
    Pe = np.array([[float(w) for w in l.strip().split()[:3]] for l in lines if l.strip() and not l.strip().startswith(('#', '//'))])
    case('ascii/exp_extra', ['ascii/exp_extra.txt'], '指数表記・余分な列（9 列）・空行・途中の注釈 # と //・行頭の空白・行末のカンマ', P=Pe, rgb=False)
    # 5) BOM・UTF-16・CRLF・CR だけ
    write_text('ascii/bom_utf8.txt', rows6, bom=b'\xef\xbb\xbf')
    case('ascii/bom_utf8', ['ascii/bom_utf8.txt'], '先頭に UTF-8 の BOM（見出しなし）', P=P6, rgb=False)
    write_text('ascii/bom_utf8_head.txt', rows6, head=['//X Y Z'], bom=b'\xef\xbb\xbf')
    case('ascii/bom_utf8_head', ['ascii/bom_utf8_head.txt'], '先頭に UTF-8 の BOM + 見出し //X Y Z', P=P6, rgb=False)
    write_text('ascii/utf16le.txt', rows6, head=['//X Y Z'], enc='utf-16-le', bom=b'\xff\xfe')
    case('ascii/utf16le', ['ascii/utf16le.txt'], 'UTF-16 LE（BOM 付き。Windows のメモ帳の「Unicode」）', P=P6, rgb=False, extra={'note': '読めるか、少なくとも分かりやすい知らせ'})
    write_text('ascii/crlf.txt', [r + ' ' + c for r, c in zip(rows6, rgbi)], head=['//X Y Z R G B Intensity'], nl='\r\n')
    case('ascii/crlf', ['ascii/crlf.txt'], 'CRLF の改行', P=P6, C=RGB0, F={'intensity': I0}, rgb=True)
    write_text('ascii/cr_only.txt', rows6, nl='\r')
    case('ascii/cr_only', ['ascii/cr_only.txt'], '改行が CR だけ（古い Mac）', P=P6, rgb=False, extra={'note': '読めるか、少なくとも分かりやすい知らせ'})
    # 6) 欧州式の小数点カンマ（区切りはセミコロン）
    lines = [f'{X[i]:.6f};{Y[i]:.6f};{Z[i]:.6f}'.replace('.', ',') for i in range(n)]
    write_text('ascii/decimal_comma.csv', lines, head=['X;Y;Z'])
    case('ascii/decimal_comma', ['ascii/decimal_comma.csv'], '小数点がカンマ・区切りがセミコロン（欧州の Excel の CSV）', P=P6, rgb=False, extra={'note': '正しく読むか、読めない旨を知らせる（黙って違う座標にしない）'})
    # 7) 列数ごとの推測（見出しなし）: 4 列 = 強度、6 列 = 色、6 列 = 法線、6 列だが 0〜255 の整数の別の値
    write_text('ascii/cols4.xyz', [f'{r} {I0[i]:g}' for i, r in enumerate(rows6)])
    case('ascii/cols4', ['ascii/cols4.xyz'], '4 列（x y z 強度）見出しなし', P=P6, F={'intensity': I0}, rgb=False)
    write_text('ascii/cols6_rgb.xyz', [f'{r} {RGB0[i,0]} {RGB0[i,1]} {RGB0[i,2]}' for i, r in enumerate(rows6)])
    case('ascii/cols6_rgb', ['ascii/cols6_rgb.xyz'], '6 列（x y z r g b）見出しなし', P=P6, C=RGB0, rgb=True)
    nrm = np.tile([0.0, 0.6, 0.8], (n, 1))
    write_text('ascii/cols6_normals.xyz', [f'{r} {nrm[i,0]:.6f} {nrm[i,1]:.6f} {nrm[i,2]:.6f}' for i, r in enumerate(rows6)])
    case('ascii/cols6_normals', ['ascii/cols6_normals.xyz'], '6 列（x y z nx ny nz）見出しなし', P=P6, rgb=False)
    write_text('ascii/cols9.txt', [f'{r} {RGB0[i,0]} {RGB0[i,1]} {RGB0[i,2]} {nrm[i,0]:.6f} {nrm[i,1]:.6f} {nrm[i,2]:.6f}' for i, r in enumerate(rows6)])
    case('ascii/cols9', ['ascii/cols9.txt'], '9 列（x y z r g b nx ny nz）見出しなし', P=P6, C=RGB0, rgb=True)
    # 8) CSV の点群で 8 列以上（見出しあり）。高さの表（CSV matrix）と見分けられるか
    cls = (np.arange(n) % 7)
    lines = [f'{X[i]:.6f},{Y[i]:.6f},{Z[i]:.6f},{RGB0[i,0]},{RGB0[i,1]},{RGB0[i,2]},{I0[i]:g},{cls[i]}' for i in range(n)]
    write_text('ascii/csv8_points.csv', lines, head=['X,Y,Z,R,G,B,Intensity,Classification'])
    case('ascii/csv8_points', ['ascii/csv8_points.csv'], 'CSV の点群 8 列（X,Y,Z,R,G,B,Intensity,Classification、見出しあり）', P=P6, C=RGB0, F={'intensity': I0, 'classification': cls}, rgb=True)
    write_text('ascii/csv8_noheader.csv', lines)
    case('ascii/csv8_noheader', ['ascii/csv8_noheader.csv'], 'CSV の点群 8 列（見出しなし）', P=P6, C=RGB0, rgb=True)
    # ファイル名に dem / grid / matrix を含む CSV の点群（3 列）
    lines3 = [l.replace(' ', ',') for l in rows6]
    for nm in ('demo_scan', 'academic_lab', 'grid_room'):
        write_text(f'ascii/{nm}.csv', lines3, head=['X,Y,Z'])
        case(f'ascii/name_{nm}', [f'ascii/{nm}.csv'], f'ファイル名が {nm}.csv の普通の点群（3 列）', P=P6, rgb=False)
    # 9) 大きな座標（UTM、mm まで）・平面直角座標（負）・最初の点が 0 0 0
    Q = P0 + UTM
    rowsU = [f'{Q[i,0]:.3f} {Q[i,1]:.3f} {Q[i,2]:.3f}' for i in range(n)]
    write_text('ascii/utm_mm.txt', rowsU)
    case('ascii/utm_mm', ['ascii/utm_mm.txt'], 'UTM の座標（小数 3 桁 = mm）', P=reparse(rowsU), rgb=False, mm=True)
    J = P0 + [-37000.0, -12000.0, 40.0]
    rowsJ = [f'{J[i,0]:.4f},{J[i,1]:.4f},{J[i,2]:.4f}' for i in range(n)]
    write_text('ascii/jgd_plane.csv', rowsJ, head=['X,Y,Z'])
    case('ascii/jgd_plane', ['ascii/jgd_plane.csv'], '平面直角座標（-37000, -12000 付近）', P=reparse(rowsJ, ','), rgb=False, mm=True)
    rowsZ = ['0.000 0.000 0.000'] + rowsU[1:]
    write_text('ascii/first_origin_utm.txt', rowsZ)
    case('ascii/first_origin_utm', ['ascii/first_origin_utm.txt'], '最初の行だけ 0 0 0、残りは UTM', P=reparse(rowsZ), rgb=False, mm=True)
    # 10) 文字の列（ラベル）がある・nan が混ざる・見出しと列数が違う
    lab = ['wall', 'floor', 'ceiling']
    write_text('ascii/text_column.txt', [f'{r} {lab[i % 3]}' for i, r in enumerate(rows6)], head=['//X Y Z Label'])
    case('ascii/text_column', ['ascii/text_column.txt'], '4 列目が文字（wall/floor/ceiling）', P=P6, rgb=False, extra={'note': '読めるか、少なくとも分かりやすい知らせ'})
    rowsN = list(rows6); rowsN[10] = 'nan nan nan'; rowsN[20] = '1.0 nan 2.0'
    write_text('ascii/with_nan.txt', rowsN)
    keep = np.ones(n, bool); keep[[10, 20]] = False
    case('ascii/with_nan', ['ascii/with_nan.txt'], 'nan の行が 2 つ', P=P6[keep], n=n - 2, total=n - 2, skipped=2, rgb=False)
    rowsN0 = list(rows6); rowsN0[0] = 'nan nan nan'
    write_text('ascii/first_nan.txt', rowsN0)
    case('ascii/first_nan', ['ascii/first_nan.txt'], '最初の行が nan nan nan', P=P6[1:], n=n - 1, total=n - 1, skipped=None, rgb=False)
    # 日本語の見出し（UTF-8 と Shift_JIS。日本語版 Excel の CSV は Shift_JIS）
    lines = [f'{X[i]:.6f},{Y[i]:.6f},{Z[i]:.6f},{I0[i]:g}' for i in range(n)]
    write_text('ascii/jp_header_utf8.csv', lines, head=['X座標,Y座標,Z座標,強度'])
    case('ascii/jp_header_utf8', ['ascii/jp_header_utf8.csv'], '日本語の見出し（UTF-8）X座標,Y座標,Z座標,強度', P=P6, F={'強度': I0}, rgb=False)
    write_text('ascii/jp_header_sjis.csv', lines, head=['X座標,Y座標,Z座標,強度'], enc='shift_jis')
    case('ascii/jp_header_sjis', ['ascii/jp_header_sjis.csv'], '日本語の見出し（Shift_JIS、日本語版 Excel の CSV）', P=P6, F={'強度': I0}, rgb=False, extra={'note': '欄の名前が文字化けしないか'})
    # 見出しにない名前で始まる語（id, index など）。i で始まる語は inf と読まれないか
    write_text('ascii/head_id.csv', [f'{i},{X[i]:.6f},{Y[i]:.6f},{Z[i]:.6f}' for i in range(n)], head=['id,x,y,z'])
    case('ascii/head_id', ['ascii/head_id.csv'], '見出し id,x,y,z（x が 2 列目）', P=P6, F={'id': np.arange(n).astype(float)}, rgb=False)
