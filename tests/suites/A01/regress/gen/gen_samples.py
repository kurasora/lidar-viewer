# 同梱のサンプル（/home/claude/pcd-viewer/sample/formats）のうち、担当の形式の点群を、点数と平均・最小・最大で確かめる
#   data/sample_formats は元のフォルダへの記号リンク（読むだけ）
import os, numpy as np
from common import *

SRC = '/home/claude/pcd-viewer/sample/formats'
CLOUDS = {
    # 名前: (付属ファイル, シフト（足す値）)
    'pcl_ascii.pcd': ([], None), 'pcl_binary.pcd': ([], None), 'pcl_binary_compressed.pcd': ([], None),
    'laspy_utm.las': ([], UTM), 'laspy_14.laz': ([], None), 'pye57_2scans.e57': ([], None),
    'cc_cloud_ascii.ply': ([], None), 'cc_cloud_binary.ply': ([], None), 'handmade_2scans.ptx': ([], None),
    'cc_cloud.txt': ([], None), 'cc_cloud.asc': ([], None), 'cc_cloud.neu': ([], None), 'cc_cloud.xyz': ([], None), 'cc_cloud.pts': ([], None), 'cc_cloud.csv': ([], None),
    'cc_cloud.bin': ([], None), 'cc_cloud_shift.bin': ([], 'any'), 'cc_cloud_normals.bin': ([], None),
    'cc_cloud.sbf': (['cc_cloud.sbf.data'], None), 'handmade_cloud.pn': ([], None), 'handmade_cloud.pv': ([], None),
    'handmade_2scans.soi': ([], None), 'handmade_bundler.out': ([], None),
    'pyshp_points.shp': (['pyshp_points.shx', 'pyshp_points.dbf'], 'any'),  # GIS は A02 の担当。試作ページの試験の正解に使うだけ
}


def gen():
    link = os.path.join(DATA, 'sample_formats')
    if not os.path.islink(link): os.symlink(SRC, link)
    for nm, (comp, shift) in CLOUDS.items():
        if not os.path.exists(os.path.join(SRC, nm)): continue
        files = [f'sample_formats/{nm}'] + [f'sample_formats/{c}' for c in comp]
        st = {'mean': P0.mean(0).tolist(), 'min': P0.min(0).tolist(), 'max': P0.max(0).tolist(), 'shift': None if shift is None else ('any' if isinstance(shift, str) else list(shift))}
        if nm.endswith('.shp'):
            case(f'sample/{nm}', files, f'同梱のサンプル {nm}（試作ページの試験の正解用）', node=True)
            continue
        case(f'sample/{nm}', files, f'同梱のサンプル {nm}', n=5000, total=5000, node=not nm.endswith('.laz'), extra={'stats': st})
