# メーカー専用形式の断り・付属ファイルの組み合わせ
import shutil
import numpy as np
from common import *

BW = ('node', 'browser')
SAMPLES = '/home/claude/pcd-viewer/sample/formats'


def gen():
    # メーカー専用形式（理由つきで断る）
    for ext, maker in [('rdb', 'RIEGL'), ('rdbx', 'RIEGL RDB'), ('rsp', 'RIEGL'), ('rds', 'RIEGL'), ('vxls', 'RIEGL RDB'), ('ptch', 'RIEGL RDB'), ('mtch', 'RIEGL RDB'), ('dp', 'DotProduct')]:
        open(path(f'vendor/scan.{ext}'), 'wb').write(b'\0' * 64)
        case(f'vendor_{ext}', [f'vendor/scan.{ext}'], {'error': f'{maker} の形式（\\.{ext}）は、メーカーの専用ライブラリが必要', 'nfiles': 0}, BW, f'.{ext} を理由つきで断る')
    open(path('vendor/SCAN.RDBX'), 'wb').write(b'\0' * 64)
    case('vendor_upper', ['vendor/SCAN.RDBX'], {'error': 'RIEGL RDB の形式', 'nfiles': 0}, BW, '大文字の拡張子 .RDBX')
    # 他のメーカー専用形式（FARO .fls・Leica .lgs・Trimble .tzf・Z+F .zfs）の扱い（情報）
    for ext in ['fls', 'lgs', 'tzf', 'zfs']:
        open(path(f'vendor/scan.{ext}'), 'wb').write(b'\0' * 64)
        case(f'vendor_other_{ext}', [f'vendor/scan.{ext}'], {'error': 'メーカー|専用', 'nfiles': 0}, BW, f'（情報）.{ext}（よくあるメーカー専用形式）も理由つきで断るか')
    # 付属ファイルの扱い
    shutil.copy(os.path.join(SAMPLES, 'cc_cloud.bin'), path('combo/cc_cloud.bin'))
    shutil.copy(os.path.join(SAMPLES, 'cc_mesh.obj'), path('combo/cc_mesh.obj'))
    shutil.copy(os.path.join(SAMPLES, 'trimesh_mesh.gltf'), path('combo/trimesh_mesh.gltf'))
    shutil.copy(os.path.join(SAMPLES, 'tifffile_dem.tif'), path('combo/tifffile_dem.tif'))
    shutil.copy(os.path.join(SAMPLES, 'handmade_project.psz'), path('combo/handmade_project.psz'))
    case('combo_obj_ccbin', ['combo/cc_mesh.obj', 'combo/cc_cloud.bin'], {'nfiles': 2, 'perFile': [{'name': 'cc_mesh.obj', 'expect': {}}, {'name': 'cc_cloud.bin', 'expect': {'n': [5000, 5000]}}]}, BW, 'OBJ と無関係な CloudCompare の .bin を一緒に選ぶ（.bin が黙って消えないこと）')
    case('combo_gltf_ccbin', ['combo/trimesh_mesh.gltf', 'combo/cc_cloud.bin'], {'nfiles': 2, 'perFile': [{'name': 'trimesh_mesh.gltf', 'expect': {}}, {'name': 'cc_cloud.bin', 'expect': {'n': [5000, 5000]}}]}, BW, '埋め込みの glTF と無関係な .bin を一緒に選ぶ')
    case('combo_psz_ccbin', ['combo/handmade_project.psz', 'combo/cc_cloud.bin'], {'nfiles': 2, 'perFile': [{'name': 'handmade_project.psz', 'expect': {}}, {'name': 'cc_cloud.bin', 'expect': {'n': [5000, 5000]}}]}, BW, 'PhotoScan と無関係な .bin を一緒に選ぶ')
    case('combo_obj_tif', ['combo/cc_mesh.obj', 'combo/tifffile_dem.tif'], {'nfiles': 2, 'perFile': [{'name': 'cc_mesh.obj', 'expect': {}}, {'name': 'tifffile_dem.tif', 'expect': {'n': [29800, 29800]}}]}, BW, 'OBJ と GeoTIFF の高さを一緒に選ぶ（GeoTIFF が黙って消えないこと）')
    case('combo_obj_ccbin_drop', ['combo/cc_mesh.obj', 'combo/cc_cloud.bin'], {'nfiles': 2}, ('browser',), 'OBJ と .bin をドラッグ＆ドロップ', drop=True)
    open(path('combo/only.mtl'), 'w').write('newmtl a\nKd 1 0 0\n')
    case('combo_mtl_only', ['combo/only.mtl'], {'error': '.', 'nfiles': 0}, ('browser',), '.mtl だけを選ぶ（何も起きないのではなく知らせる）')
    shutil.copy(os.path.join(SAMPLES, 'pyshp_points.dbf'), path('combo/pyshp_points.dbf'))
    case('combo_dbf_only', ['combo/pyshp_points.dbf'], {'error': '\\.dbf', 'nfiles': 0}, BW, '.dbf だけを選ぶ')
    open(path('combo/gltfbuf.bin'), 'wb').write(np.arange(96, dtype='<f4').tobytes())
    case('combo_gltfbin_only', ['combo/gltfbuf.bin'], {'error': '.', 'nfiles': 0}, BW, 'glTF の .bin だけを選ぶ（CloudCompare の .bin として読まれる → 分かる知らせ）')


def gen_special():
    """個別の試験スクリプト用のファイル（cases.json には入れない）"""
    # 値の欄の名前に HTML（VTK の SCALARS 名・DBF の欄名）
    rng = np.random.default_rng(9); Q = rng.uniform(0, 10, (200, 3))
    name = '<img/src=x/onerror=window.__xss=(window.__xss||0)+1>'
    s = '# vtk DataFile Version 3.0\nx\nASCII\nDATASET POLYDATA\nPOINTS 200 float\n' + '\n'.join(' '.join('%.4f' % v for v in q) for q in Q) + f'\nPOINT_DATA 200\nSCALARS {name} float 1\nLOOKUP_TABLE default\n' + '\n'.join('%d' % i for i in range(200)) + '\n'
    open(path('special/xss_field.vtk'), 'w').write(s)
    import shapefile
    w = shapefile.Writer(path('special/xss_dbf'), shapeType=shapefile.POINT)
    w.field('<s>ab</s>', 'N', 6, 0)
    for i, q in enumerate(Q[:20]): w.point(q[0], q[1]); w.record(i)
    w.close()
    dom = {'domAbsent': ['#info img', '#info s', '#legend img', '#legend s'], 'noGlobal': '__xss'}
    case('sec_vtk_fieldname', ['special/xss_field.vtk'], {'n': [200, 200], **dom}, ('browser', 'electron', 'artifact'), 'VTK の値の欄の名前に HTML（<img onerror>）→ 文字として表示され、要素にならないこと')
    case('sec_dbf_fieldname', ['special/xss_dbf.shp', 'special/xss_dbf.dbf'], {'n': [20, 20], **dom}, ('browser', 'electron', 'artifact'), 'DBF の欄の名前に HTML（<s>）→ 文字として表示されること')
