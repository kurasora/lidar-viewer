# A12 の再現用の入力ファイルを作る: python3 gen_data.py <出力フォルダ>
#   元のサンプル（/home/claude/pcd-viewer/sample/formats）は読むだけ。作ったものは出力フォルダへ
import sys, os, struct, io, zipfile, shutil
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(OUT, exist_ok=True)
S = '/home/claude/pcd-viewer/sample/formats'
p = lambda n: os.path.join(OUT, n)

# 廊下の 5,000 点（x y z r g b intensity）
rows = [l.split(',') for l in open(f'{S}/cc_cloud.csv').read().splitlines()[1:]]
XYZ = np.array([[float(v) for v in r[:3]] for r in rows])
RGB = np.array([[int(v) for v in r[3:6]] for r in rows])
INT = np.array([float(r[6]) for r in rows])

# 1) 名前に dem を含むだけの、ふつうの CSV 点群（中身は cc_cloud.csv と同じ）
shutil.copy(f'{S}/cc_cloud.csv', p('demo.csv'))
# 2) 9 列の CSV 点群（x y z r g b nx ny nz）
with open(p('cloud_9cols.csv'), 'w') as f:
    f.write('//X,Y,Z,R,G,B,Nx,Ny,Nz\n')
    for (x, y, z), (r, g, b) in zip(XYZ, RGB): f.write(f'{x:.6f},{y:.6f},{z:.6f},{r},{g},{b},0,0,1\n')
# 3) 色が float（0〜1）の PLY
with open(p('ply_float_rgb.ply'), 'w') as f:
    f.write(f'ply\nformat ascii 1.0\nelement vertex {len(XYZ)}\nproperty float x\nproperty float y\nproperty float z\nproperty float red\nproperty float green\nproperty float blue\nend_header\n')
    for (x, y, z), (r, g, b) in zip(XYZ, RGB): f.write(f'{x:.5f} {y:.5f} {z:.5f} {r/255:.4f} {g/255:.4f} {b/255:.4f}\n')
# 4) 16 bit の色の LAS: 先頭 20,000 点は色 0（色を付けられなかった点）、後ろ 1,000 点は (32768, 16384, 65535)
import laspy
h = laspy.LasHeader(point_format=2, version='1.2'); h.scales = [0.001] * 3; h.offsets = [0, 0, 0]
las = laspy.LasData(h)
n0, n1 = 20000, 1000
rng = np.random.default_rng(1)
las.x = rng.uniform(0, 10, n0 + n1); las.y = rng.uniform(0, 10, n0 + n1); las.z = rng.uniform(0, 3, n0 + n1)
r = np.zeros(n0 + n1, np.uint16); g = r.copy(); b = r.copy()
r[n0:] = 32768; g[n0:] = 16384; b[n0:] = 65535
las.red, las.green, las.blue = r, g, b
las.write(p('las16_dark_first.las'))
# 5) 途中で切れた LAS（laspy_utm.las の後ろ 30% を切り落とす）
d = open(f'{S}/laspy_utm.las', 'rb').read()
off = struct.unpack_from('<I', d, 96)[0]
open(p('las_truncated.las'), 'wb').write(d[:off + int((len(d) - off) * 0.7)])
# 6) 色付き STL（VisCAM/SolidView の決まり: bit15=1 が「色あり」、bit10〜14 が赤）。赤い三角形 1 枚
tri = struct.pack('<12f', 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0) + struct.pack('<H', 0x8000 | (31 << 10))
open(p('stl_viscam_red.stl'), 'wb').write(b'binary stl'.ljust(80, b' ') + struct.pack('<I', 1) + tri)
# 7) 図形の長さが負のシェープファイル（壊れたファイル）→ 読み込みが終わらない
import shapefile
w = shapefile.Writer(p('shp_badlen'), shapeType=shapefile.POINT); w.field('id', 'N')
for i in range(3): w.point(i, i); w.record(i)
w.close()
b = bytearray(open(p('shp_badlen.shp'), 'rb').read())
struct.pack_into('>i', b, 100 + 4, -16)   # 1 番目の図形の長さ（16 bit 語の数）を負に
open(p('shp_badlen.shp'), 'wb').write(b)
# 8) 縦横だけ大きい PGM（中身は 16 バイト）→ 小さなファイルで大きなメモリを確保する
open(p('pgm_bomb.pgm'), 'wb').write(b'P5\n20000 20000\n255\n' + bytes(16))
# 9) 中身が 1 GB のゼロの PSZ（zip 爆弾）
with zipfile.ZipFile(p('psz_bomb.psz'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('doc.xml', '<document><chunk><frame><point_cloud><points path="points.ply"/></point_cloud></frame></chunk></document>')
    z.writestr('points.ply', 'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n')
    with z.open('depth_maps.bin', 'w', force_zip64=True) as f:
        blk = bytes(1 << 20)
        for _ in range(1024): f.write(blk)
# 10) 値なし（nodata）が float32 の DEM。GDAL_NODATA の文字が短い（-3.40282e+38）
import tifffile
dem = np.linspace(10, 20, 64 * 64, dtype=np.float32).reshape(64, 64)
nod = np.float32(-3.40282e+38)
dem[:8, :8] = nod
tifffile.imwrite(p('dem_nodata.tif'), dem, extratags=[(42113, 's', 0, '-3.40282e+38', False)])
# 11) 先頭の 1 点だけ原点、残りは UTM 風の大きな座標（mm まで意味がある）
with open(p('first_origin.xyz'), 'w') as f:
    f.write('0 0 0\n')
    for x, y, z in XYZ: f.write(f'{x + 539000.123:.3f} {y + 3836000.456:.3f} {z + 30:.3f}\n')
with open(p('utm_only.xyz'), 'w') as f:
    for x, y, z in XYZ: f.write(f'{x + 539000.123:.3f} {y + 3836000.456:.3f} {z + 30:.3f}\n')
# 12) KITTI 形式の姿勢（3×4 行列 12 列）と、時刻のない 7 列（x y z qx qy qz qw）
T = [l.split() for l in open('/home/claude/pcd-viewer/sample/trajectory.txt').read().splitlines() if l and l[0].isdigit()]
with open(p('traj_kitti.txt'), 'w') as f:
    for t in T: f.write(f'1 0 0 {t[1]} 0 1 0 {t[2]} 0 0 1 {t[3]}\n')
with open(p('traj_xyzq.txt'), 'w') as f:
    for t in T: f.write(f'{t[1]} {t[2]} {t[3]} 0 0 0 1\n')
# 13) 分類の値が 63 より大きく離れた PCD（SemanticKITTI 風: 0 10 40 70 72 80）
labs = [0, 10, 40, 70, 72, 80]
with open(p('labels_far.pcd'), 'w') as f:
    n = 6 * 400
    f.write(f'# .PCD v0.7\nVERSION 0.7\nFIELDS x y z label\nSIZE 4 4 4 4\nTYPE F F F U\nCOUNT 1 1 1 1\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA ascii\n')
    for k, L in enumerate(labs):
        for i in range(400): f.write(f'{k * 3 + (i % 20) * 0.1:.2f} {(i // 20) * 0.1:.2f} 0 {L}\n')
# 14) 見出しが引用符つきの CSV（pandas の QUOTE_NONNUMERIC など）
with open(p('quoted_header.csv'), 'w') as f:
    f.write('"X","Y","Z","Intensity","Label"\n')
    for (x, y, z), i in zip(XYZ, INT): f.write(f'{x:.6f},{y:.6f},{z:.6f},{i:.1f},{int(i) % 5}\n')
# 15) 空の欄がある CSV（強度が抜けている行）
with open(p('empty_fields.csv'), 'w') as f:
    f.write('x,y,z,intensity,label\n')
    for k, ((x, y, z), i) in enumerate(zip(XYZ, INT)): f.write(f'{x:.6f},{y:.6f},{z:.6f},{"" if k % 2 else i},{7}\n')
# 16) 色が 0〜1 の CSV（見出しで r g b と分かる）
with open(p('float_rgb.csv'), 'w') as f:
    f.write('x,y,z,r,g,b\n')
    for (x, y, z), (r, g, b) in zip(XYZ, RGB): f.write(f'{x:.6f},{y:.6f},{z:.6f},{r/255:.4f},{g/255:.4f},{b/255:.4f}\n')
# 17) 途中で切れたバイナリ PLY
d = open(f'{S}/cc_cloud_binary.ply', 'rb').read()
open(p('ply_trunc_binary.ply'), 'wb').write(d[:len(d) * 2 // 3])
# 18) 高さの幅が 10 km の点群（mm 単位の CAD や山の DEM に相当）
with open(p('tall_10km.xyz'), 'w') as f:
    for i, (x, y, z) in enumerate(XYZ): f.write(f'{x:.3f} {y:.3f} {i * 2.0:.3f}\n')
# 19) VTK 5.1（OFFSETS / CONNECTIVITY）の四角形 1 枚
open(p('vtk51_quad.vtk'), 'w').write('# vtk DataFile Version 5.1\nvtk output\nASCII\nDATASET POLYDATA\nPOINTS 4 float\n0 0 0 1 0 0 1 1 0 0 1 0\nPOLYGONS 2 4\nOFFSETS vtktypeint64\n0 4\nCONNECTIVITY vtktypeint64\n0 1 2 3\n')
# 20) 項目名に HTML を含む PCD（項目名は空白を含められないので / で区切る）
with open(p('html_field.pcd'), 'w') as f:
    n = 200
    f.write(f'# .PCD v0.7\nVERSION 0.7\nFIELDS x y z <img/src=x/onerror=document.title="XSS"> label\nSIZE 4 4 4 4 4\nTYPE F F F F U\nCOUNT 1 1 1 1 1\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA ascii\n')
    for i in range(n): f.write(f'{i * 0.01:.2f} {(i % 7) * 0.1:.2f} {(i % 3) * 0.5:.2f} {i % 4} {i % 3}\n')
# 21) UTM の地図（laspy_utm.las と同じ廊下）に合わせた UTM 座標の軌跡
with open(p('traj_utm.txt'), 'w') as f:
    f.write('# t x y z qx qy qz qw\n')
    for t in T: f.write(f'{t[0]} {float(t[1]) + 539000:.4f} {float(t[2]) + 3836000:.4f} {float(t[3]) + 30:.4f} 0 0 0 1\n')
print('作りました:', OUT, len(os.listdir(OUT)), '個')
