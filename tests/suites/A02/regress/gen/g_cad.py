# DXF・シェープファイル・PDMS の変種
import math, struct
import numpy as np
import ezdxf
import ezdxf.path as epath
from ezdxf import colors as ecolors
import shapefile
from common import *

BW = ('node', 'browser')
EPS = 1e-6


def aci(c):
    r = ecolors.aci2rgb(c)
    return [r.r, r.g, r.b]


def bb(pts, eps=1e-4):
    a = np.asarray(pts, float)
    return np.concatenate([a.min(0) - eps, a.max(0) + eps]).tolist()


def flat(e, d=1e-3):
    return np.array([tuple(v) for v in epath.make_path(e).flattening(d)], float)


def gen_dxf():
    # 1 点（画層の色・個別の色・BYLAYER）
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    doc.layers.add('L1', color=1); doc.layers.add('L3', color=3)
    pts = {'red': ([0, 0, 0], 'L1', None), 'green': ([5, 0, 0], 'L3', None), 'blue': ([10, 0, 0], 'L1', 5), 'bylayer': ([15, 0, 0], 'L3', 256)}
    for k, (p, lay, col) in pts.items():
        at = {'layer': lay}
        if col is not None: at['color'] = col
        msp.add_point(p, dxfattribs=at)
    doc.saveas(path('dxf/points.dxf'))
    cols = {'red': aci(1), 'green': aci(3), 'blue': aci(5), 'bylayer': aci(3)}
    e = {'n': [4, 4], 'rgb': True, 'parts': [{'name': k, 'box': bb([p], 1e-6), 'color': cols[k], 'minCount': 1} for k, (p, l, c) in pts.items()], 'strayMax': 0.0, 'note': r'^(?!.*線と面).*$'}
    case('dxf_points', ['dxf/points.dxf'], e, BW, 'POINT（画層の色・個別の色・BYLAYER）。点だけなら注記に「線と面」が出ないこと')
    # 2 線・LWPOLYLINE（閉じた・高さ）・3D ポリライン
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    msp.add_line((0, 0, 0), (10, 0, 0), dxfattribs={'color': 1})
    lw = msp.add_lwpolyline([(0, 5), (4, 5), (4, 8), (0, 8)], close=True, dxfattribs={'color': 3, 'elevation': 2.0})
    msp.add_polyline3d([(20, 0, 0), (20, 0, 5), (25, 0, 5)], dxfattribs={'color': 5})
    doc.saveas(path('dxf/lines.dxf'))
    e = {'n': [290000, 300020], 'rgb': True, 'parts': [
        {'name': 'line', 'box': [-EPS, -EPS, -EPS, 10 + EPS, EPS, EPS], 'color': aci(1), 'minCount': 10},
        {'name': 'lwpoly', 'box': [-EPS, 5 - EPS, 2 - EPS, 4 + EPS, 8 + EPS, 2 + EPS], 'color': aci(3), 'minCount': 10},
        {'name': 'poly3d', 'box': [20 - EPS, -EPS, -EPS, 25 + EPS, EPS, 5 + EPS], 'color': aci(5), 'minCount': 10}], 'strayMax': 0.0}
    case('dxf_lines', ['dxf/lines.dxf'], e, BW, 'LINE・LWPOLYLINE（閉じた・高さ 2）・3D POLYLINE')
    # 3 ふくらみ（bulge）のある LWPOLYLINE: (0,0)→(2,0) が半円
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    lw = msp.add_lwpolyline([(0, 0, 0, 0, 1), (2, 0, 0, 0, 0)], format='xyseb')
    doc.saveas(path('dxf/bulge.dxf'))
    F = flat(lw)
    e = {'n': [290000, 300020], 'bbox': [F.min(0).tolist(), F.max(0).tolist()], 'tol': 2e-3}
    case('dxf_bulge', ['dxf/bulge.dxf'], e, BW, 'LWPOLYLINE のふくらみ（bulge=1 の半円）')
    # 4 押し出し方向 (0,0,-1)（AutoCAD で鏡写しにした円・円弧・LWPOLYLINE）
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    c = msp.add_circle((10, 5, 0), 1, dxfattribs={'extrusion': (0, 0, -1), 'color': 1})
    a = msp.add_arc((20, 5, 0), 1, 0, 90, dxfattribs={'extrusion': (0, 0, -1), 'color': 3})
    lw = msp.add_lwpolyline([(30, 5), (32, 5), (32, 7)], dxfattribs={'extrusion': (0, 0, -1), 'color': 5})
    doc.saveas(path('dxf/ocs.dxf'))
    parts = [{'name': n, 'box': bb(flat(x), 1e-2), 'minCount': 100} for n, x in [('circle', c), ('arc', a), ('lwpoly', lw)]]
    case('dxf_ocs', ['dxf/ocs.dxf'], {'n': [290000, 300030], 'parts': parts, 'strayMax': 0.0}, BW, '押し出し方向 (0,0,-1) の CIRCLE・ARC・LWPOLYLINE（鏡写しの図形）')
    # 5 ブロック（基点・回転・拡大・入れ子・BYBLOCK の色）
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    doc.layers.add('BL', color=6)
    blk = doc.blocks.new('B', base_point=(1, 1, 0))
    blk.add_line((1, 1, 0), (2, 1, 0), dxfattribs={'color': 0})  # BYBLOCK
    blk.add_3dface([(1, 2, 0), (2, 2, 0), (2, 3, 0), (1, 3, 0)], dxfattribs={'color': 2})
    nb = doc.blocks.new('N', base_point=(0, 0, 0))
    nb.add_blockref('B', (0, 5, 0), dxfattribs={'color': 0})
    i1 = msp.add_blockref('B', (10, 0, 0), dxfattribs={'rotation': 90, 'xscale': 2, 'yscale': 2, 'color': 1})
    i2 = msp.add_blockref('N', (0, 0, 5), dxfattribs={'rotation': 45, 'color': 5})
    doc.saveas(path('dxf/insert.dxf'))

    def virt(ins, out):
        for v in ins.virtual_entities():
            if v.dxftype() == 'INSERT': virt(v, out)
            else: out.append(v)
        return out
    parts = []
    for name, ins, col in [('i1', i1, aci(1)), ('i2', i2, aci(5))]:
        for v in virt(ins, []):
            if v.dxftype() == 'LINE':
                parts.append({'name': name + '_line', 'box': bb([tuple(v.dxf.start), tuple(v.dxf.end)], 1e-3), 'color': col, 'minCount': 10})
            elif v.dxftype() == '3DFACE':
                parts.append({'name': name + '_face', 'box': bb([tuple(v.dxf.vtx0), tuple(v.dxf.vtx1), tuple(v.dxf.vtx2), tuple(v.dxf.vtx3)], 1e-3), 'color': aci(2), 'minCount': 10})
    case('dxf_insert', ['dxf/insert.dxf'], {'parts': parts, 'strayMax': 0.0, 'rgb': True}, BW, 'INSERT（基点・回転・拡大・入れ子・BYBLOCK）')
    # 6 R12（POLYLINE・LINE・POINT・3DFACE・CIRCLE）
    doc = ezdxf.new('R12'); msp = doc.modelspace()
    msp.add_polyline3d([(0, 0, 0), (5, 0, 0), (5, 5, 0)], dxfattribs={'color': 1})
    msp.add_line((10, 0, 0), (15, 0, 0), dxfattribs={'color': 3})
    msp.add_point((20, 0, 0), dxfattribs={'color': 5})
    msp.add_3dface([(30, 0, 0), (31, 0, 0), (31, 1, 0)], dxfattribs={'color': 2})
    c = msp.add_circle((40, 0, 0), 1, dxfattribs={'color': 4})
    doc.saveas(path('dxf/r12.dxf'))
    parts = [{'name': 'poly', 'box': [-EPS, -EPS, -EPS, 5 + EPS, 5 + EPS, EPS], 'minCount': 10}, {'name': 'line', 'box': [10 - EPS, -EPS, -EPS, 15 + EPS, EPS, EPS], 'minCount': 10},
             {'name': 'point', 'box': [20 - EPS, -EPS, -EPS, 20 + EPS, EPS, EPS], 'minCount': 1}, {'name': 'face', 'box': [30 - EPS, -EPS, -EPS, 31 + EPS, 1 + EPS, EPS], 'minCount': 10},
             {'name': 'circle', 'box': bb(flat(c), 1e-2), 'minCount': 10}]
    case('dxf_r12', ['dxf/r12.dxf'], {'parts': parts, 'strayMax': 0.0}, BW, 'R12 形式')
    # 7 バイナリ DXF
    doc = ezdxf.new('R2010'); doc.modelspace().add_line((0, 0, 0), (1, 0, 0))
    doc.saveas(path('dxf/binary.dxf'), fmt='bin')
    case('dxf_binary', ['dxf/binary.dxf'], {'error': 'バイナリ形式の DXF', 'nfiles': 0}, BW, 'バイナリ DXF（対応外の知らせ）')
    # 8 SPLINE・ELLIPSE・MESH（読まれずに消えないか）
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    sp = msp.add_spline([(0, 0, 0), (2, 3, 0), (4, -1, 0), (6, 2, 0)])
    el = msp.add_ellipse((20, 0, 0), major_axis=(3, 0, 0), ratio=0.5)
    msp.add_line((40, 0, 0), (41, 0, 0))
    mesh = msp.add_mesh()
    with mesh.edit_data() as md:
        md.vertices = [(50, 0, 0), (51, 0, 0), (51, 1, 0), (50, 1, 0)]
        md.faces = [(0, 1, 2, 3)]
    doc.saveas(path('dxf/curves.dxf'))
    parts = [{'name': 'spline', 'box': bb(flat(sp), 1e-2), 'minCount': 100}, {'name': 'ellipse', 'box': bb(flat(el), 1e-2), 'minCount': 100},
             {'name': 'line', 'box': [40 - EPS, -EPS, -EPS, 41 + EPS, EPS, EPS], 'minCount': 10}, {'name': 'mesh', 'box': [50 - EPS, -EPS, -EPS, 51 + EPS, 1 + EPS, EPS], 'minCount': 100}]
    case('dxf_curves', ['dxf/curves.dxf'], {'parts': parts, 'strayMax': 0.0}, BW, 'SPLINE・ELLIPSE・MESH（黙って消えないこと）')
    # 9 ポリフェースメッシュとポリゴンメッシュ（M×N）
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    pf = msp.add_polyface()
    pf.append_face([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)])
    doc.saveas(path('dxf/polyface.dxf'))
    case('dxf_polyface', ['dxf/polyface.dxf'], mesh_expect([(np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], float), np.array([[0, 1, 2], [0, 2, 3]]), None, 'f')], extra={'note': '.'}), BW, 'ポリフェースメッシュ')
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    pm = msp.add_polymesh(size=(3, 3))
    for m in range(3):
        for n in range(3):
            pm.set_mesh_vertex((m, n), (m, n, 0))
    doc.saveas(path('dxf/polymesh.dxf'))
    sq = quad([0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0])
    e = mesh_expect([(sq[0], sq[1], None, 'surf')], extra={'note': '.'})
    e['n'] = [900000, 1000010]
    case('dxf_polymesh', ['dxf/polymesh.dxf'], e, BW, 'ポリゴンメッシュ（POLYLINE の M×N 格子。面として散らすこと）')
    # 10 ACI の色（10〜255）。1 色 1 点
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    parts = []
    for c in range(1, 256):
        p = (c, 0, 0)
        msp.add_point(p, dxfattribs={'color': c})
        if c == 7: continue  # 7 は背景に合わせた白/黒（アプリは 230 の灰色）
        parts.append({'name': f'aci{c}', 'box': bb([p], 1e-3), 'color': aci(c), 'ctol': 12, 'minCount': 1})
    doc.saveas(path('dxf/aci.dxf'))
    case('dxf_aci', ['dxf/aci.dxf'], {'n': [255, 255], 'parts': parts}, BW, 'ACI の色 1〜255（AutoCAD の色表と比べる）')
    # 11 トゥルーカラー（420）
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    msp.add_point((0, 0, 0), dxfattribs={'color': 1, 'true_color': ezdxf.colors.rgb2int((10, 200, 30))})
    msp.add_point((1, 0, 0), dxfattribs={'color': 1})
    doc.saveas(path('dxf/truecolor.dxf'))
    case('dxf_truecolor', ['dxf/truecolor.dxf'], {'n': [2, 2], 'parts': [{'name': 'tc', 'box': bb([(0, 0, 0)], 1e-3), 'color': [10, 200, 30]}, {'name': 'aci', 'box': bb([(1, 0, 0)], 1e-3), 'color': aci(1)}]}, BW, 'トゥルーカラー（グループ 420）')
    # 12 用紙空間（レイアウト）の図形
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    msp.add_line((0, 0, 0), (10, 0, 0))
    doc.layouts.get('Layout1').add_line((500, 500, 0), (600, 500, 0))
    doc.saveas(path('dxf/paperspace.dxf'))
    case('dxf_paperspace', ['dxf/paperspace.dxf'], {'parts': [{'name': 'model', 'box': [-EPS, -EPS, -EPS, 10 + EPS, EPS, EPS], 'minCount': 10}], 'strayMax': 0.0}, BW, '用紙空間（Layout1）の図形を混ぜないこと')
    # 13 ブロックの中の画層 0 の図形は INSERT の画層の色になる
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    doc.layers.add('RED', color=1)
    b = doc.blocks.new('Z'); b.add_line((0, 0, 0), (1, 0, 0), dxfattribs={'layer': '0'})
    msp.add_blockref('Z', (0, 0, 0), dxfattribs={'layer': 'RED'})
    doc.saveas(path('dxf/layer0.dxf'))
    case('dxf_layer0', ['dxf/layer0.dxf'], {'rgb': True, 'parts': [{'name': 'l', 'box': [-EPS, -EPS, -EPS, 1 + EPS, EPS, EPS], 'color': aci(1)}]}, BW, 'ブロック内の画層 0 の図形 → INSERT の画層（赤）の色')
    # 14 MINSERT（列 3 個）
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    b = doc.blocks.new('M'); b.add_line((0, 0, 0), (1, 0, 0))
    ins = msp.add_blockref('M', (0, 0, 0)); ins.dxf.column_count = 3; ins.dxf.column_spacing = 5
    doc.saveas(path('dxf/minsert.dxf'))
    parts = [{'name': f'c{k}', 'box': [5 * k - EPS, -EPS, -EPS, 5 * k + 1 + EPS, EPS, EPS], 'minCount': 10} for k in range(3)]
    case('dxf_minsert', ['dxf/minsert.dxf'], {'parts': parts, 'strayMax': 0.0}, BW, 'MINSERT（列 3 個の配列）')
    # 15 大きな座標・CRLF
    doc = ezdxf.new('R2010'); msp = doc.modelspace()
    msp.add_3dface([(539000, 3836000, 30), (539010, 3836000, 30), (539010, 3836010, 30)])
    doc.saveas(path('dxf/big.dxf'))
    s = open(path('dxf/big.dxf'), 'rb').read().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
    open(path('dxf/big_crlf.dxf'), 'wb').write(s)
    tri = (np.array([[539000, 3836000, 30], [539010, 3836000, 30], [539010, 3836010, 30]], float), np.array([[0, 1, 2]]), None, 't')
    e = mesh_expect([tri], extra={'offset': [539000, 3836000, 0]}); e['tol'] = 2e-3; e['note'] = '.'
    case('dxf_big_crlf', ['dxf/big_crlf.dxf'], e, BW, '大きな座標の 3DFACE・CRLF')


# ---------------------------------------------------------------- シェープファイル
def gen_shp():
    rng = np.random.default_rng(3)
    Q = rng.uniform(0, 100, (50, 3))
    base = {'point': shapefile.POINT, 'pointz': shapefile.POINTZ, 'pointm': shapefile.POINTM}
    for nm, st in base.items():
        w = shapefile.Writer(path(f'shp/{nm}'), shapeType=st)
        w.field('val', 'N', 10, 3); w.field('name', 'C', 10); w.field('flag', 'L'); w.field('when', 'D'); w.field('ratio', 'F', 12, 6)
        for i, q in enumerate(Q):
            if st == shapefile.POINT: w.point(q[0], q[1])
            elif st == shapefile.POINTZ: w.pointz(q[0], q[1], q[2], 7.0)
            else: w.pointm(q[0], q[1], q[2])
            w.record(i * 1.5, f'p{i}', True, '20260101', i / 10)
        w.close()
        z = Q[:, 2] if st == shapefile.POINTZ else np.zeros(50)
        lo = [Q[:, 0].min(), Q[:, 1].min(), z.min()]; hi = [Q[:, 0].max(), Q[:, 1].max(), z.max()]
        e = {'n': [50, 50], 'bbox': [lo, hi], 'tol': 1e-4, 'fields': ['val', 'ratio'], 'fieldRange': {'val': [0, 49 * 1.5, 1e-3], 'ratio': [0, 4.9, 1e-4]}}
        case(f'shp_{nm}', [f'shp/{nm}.shp', f'shp/{nm}.shx', f'shp/{nm}.dbf'], e, BW, f'{nm}（属性 N/C/L/D/F）')
    case('shp_pointz_nodbf', ['shp/pointz.shp'], {'n': [50, 50], 'bbox': [[Q[:, 0].min(), Q[:, 1].min(), Q[:, 2].min()], [Q[:, 0].max(), Q[:, 1].max(), Q[:, 2].max()]], 'tol': 1e-4}, BW, '.shp だけ（.dbf なし）')
    case('shp_pointz_drop', ['shp/pointz.shp', 'shp/pointz.shx', 'shp/pointz.dbf'], {'n': [50, 50], 'fields': ['val']}, ('browser',), '.shp + .shx + .dbf をドラッグ＆ドロップ', drop=True)
    # 大文字の拡張子
    import shutil
    for ext in ['shp', 'shx', 'dbf']: shutil.copy(path(f'shp/pointz.{ext}'), path(f'shp/upper/POINTZ.{ext.upper()}'))
    case('shp_upper', ['shp/upper/POINTZ.SHP', 'shp/upper/POINTZ.SHX', 'shp/upper/POINTZ.DBF'], {'n': [50, 50], 'fields': ['val']}, BW, '大文字の拡張子（.SHP .DBF）')
    # 複数点
    for nm, st in [('multipoint', shapefile.MULTIPOINT), ('multipointz', shapefile.MULTIPOINTZ), ('multipointm', shapefile.MULTIPOINTM)]:
        w = shapefile.Writer(path(f'shp/{nm}'), shapeType=st); w.field('id', 'N', 5, 0)
        for k in range(5):
            pts = Q[10 * k:10 * k + 10]
            if st == shapefile.MULTIPOINT: w.multipoint(pts[:, :2].tolist())
            elif st == shapefile.MULTIPOINTZ: w.multipointz(pts.tolist())
            else: w.multipointm(pts.tolist())
            w.record(k)
        w.close()
        z = Q[:, 2] if st == shapefile.MULTIPOINTZ else np.zeros(50)
        case(f'shp_{nm}', [f'shp/{nm}.shp', f'shp/{nm}.dbf'], {'n': [50, 50], 'bbox': [[Q[:, 0].min(), Q[:, 1].min(), z.min()], [Q[:, 0].max(), Q[:, 1].max(), z.max()]], 'tol': 1e-4}, BW, nm)
    # 線・多角形（穴あり）・Z・M
    L1 = [(0, 0, 1), (10, 0, 2), (10, 10, 3)]
    L2 = [(20, 0, 0), (25, 0, 0)]
    poly_out = [(30, 0, 5), (40, 0, 5), (40, 10, 5), (30, 10, 5), (30, 0, 5)]
    poly_hole = [(33, 3, 5), (33, 7, 5), (37, 7, 5), (37, 3, 5), (33, 3, 5)]
    for nm, st in [('polyline', shapefile.POLYLINE), ('polylinez', shapefile.POLYLINEZ), ('polylinem', shapefile.POLYLINEM)]:
        w = shapefile.Writer(path(f'shp/{nm}'), shapeType=st); w.field('id', 'N', 5, 0)
        if st == shapefile.POLYLINE: w.line([[p[:2] for p in L1], [p[:2] for p in L2]])
        elif st == shapefile.POLYLINEZ: w.linez([L1, L2])
        else: w.linem([L1, L2])
        w.record(1)
        w.null(); w.record(2)  # 空の図形（null shape）
        w.close()
        zz = st == shapefile.POLYLINEZ
        parts = [{'name': 'L1a', 'box': [-EPS, -EPS, (1 if zz else 0) - EPS, 10 + EPS, EPS, (2 if zz else 0) + EPS], 'minCount': 10},
                 {'name': 'L1b', 'box': [10 - EPS, -EPS, (2 if zz else 0) - EPS, 10 + EPS, 10 + EPS, (3 if zz else 0) + EPS], 'minCount': 10},
                 {'name': 'L2', 'box': [20 - EPS, -EPS, -EPS, 25 + EPS, EPS, EPS], 'minCount': 10}]
        case(f'shp_{nm}', [f'shp/{nm}.shp', f'shp/{nm}.dbf', f'shp/{nm}.shx'], {'parts': parts, 'strayMax': 0.0, 'note': '線の上に'}, BW, f'{nm}（2 部分＋ null shape）')
    for nm, st in [('polygon', shapefile.POLYGON), ('polygonz', shapefile.POLYGONZ)]:
        w = shapefile.Writer(path(f'shp/{nm}'), shapeType=st); w.field('id', 'N', 5, 0)
        if st == shapefile.POLYGON: w.poly([[p[:2] for p in poly_out], [p[:2] for p in poly_hole]])
        else: w.polyz([poly_out, poly_hole])
        w.record(1); w.close()
        z = 5 if st == shapefile.POLYGONZ else 0
        parts = [{'name': 'outer', 'box': [30 - EPS, -EPS, z - EPS, 40 + EPS, 10 + EPS, z + EPS], 'minCount': 10}]
        e = {'parts': parts, 'strayMax': 0.0, 'bbox': [[30, 0, z], [40, 10, z]], 'tol': 1e-6}
        case(f'shp_{nm}', [f'shp/{nm}.shp', f'shp/{nm}.dbf'], e, BW, f'{nm}（穴あり）')
    # マルチパッチ（三角形の帯・扇・外周）
    w = shapefile.Writer(path('shp/multipatch'), shapeType=shapefile.MULTIPATCH); w.field('id', 'N', 5, 0)
    strip = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0)]
    fan = [(5, 5, 1), (6, 5, 1), (6, 6, 1), (5, 6, 1)]
    ring = [(10, 0, 0), (11, 0, 0), (11, 1, 0), (10, 0, 0)]
    w.multipatch([strip, fan, ring], partTypes=[shapefile.TRIANGLE_STRIP, shapefile.TRIANGLE_FAN, shapefile.OUTER_RING])
    w.record(1); w.close()
    parts = [{'name': 'strip', 'box': [-EPS, -EPS, -EPS, 1 + EPS, 1 + EPS, EPS], 'minCount': 1000}, {'name': 'fan', 'box': [5 - EPS, 5 - EPS, 1 - EPS, 6 + EPS, 6 + EPS, 1 + EPS], 'minCount': 1000},
             {'name': 'ring', 'box': [10 - EPS, -EPS, -EPS, 11 + EPS, 1 + EPS, EPS], 'minCount': 10}]
    case('shp_multipatch', ['shp/multipatch.shp', 'shp/multipatch.dbf'], {'parts': parts, 'strayMax': 0.0}, BW, 'マルチパッチ（帯・扇・外周）')
    # 2 組を一度に
    case('shp_two', ['shp/pointz.shp', 'shp/pointz.dbf', 'shp/polylinez.shp', 'shp/polylinez.dbf'], {'nfiles': 2, 'perFile': [{'name': 'pointz.shp', 'expect': {'n': [50, 50], 'fields': ['val']}}, {'name': 'polylinez.shp', 'expect': {'n': [290000, 300050]}}]}, BW, '2 組のシェープファイルを一度に')


# ---------------------------------------------------------------- PDMS
def pdms_expect_box(cx, cy, cz, dx, dy, dz, eps=1e-3):
    return [cx - dx / 2 - eps, cy - dy / 2 - eps, cz - dz / 2 - eps, cx + dx / 2 + eps, cy + dy / 2 + eps, cz + dz / 2 + eps]


def gen_pdms():
    # 箱と円柱（mm）。CloudCompare の読み方: 位置は部品の中心
    s = '''NEW EQUIPMENT /E1
  AT E 1000 N 2000 U 0
  NEW BOX /B1
    XLENGTH 1000
    YLENGTH 500
    ZLENGTH 200
    AT E 0 N 0 U 100
  END
  NEW CYLINDER /C1
    DIAMETER 400
    HEIGHT 1000
    AT E 3000 N 0 U 500
  END
END
'''
    for ext in ['pdms', 'pdmsmac', 'mac']:
        open(path(f'pdms/basic.{ext}'), 'w').write(s)
    parts = [{'name': 'box', 'box': pdms_expect_box(1.0, 2.0, 0.1, 1.0, 0.5, 0.2)}, {'name': 'cyl', 'box': pdms_expect_box(4.0, 2.0, 0.5, 0.4, 0.4, 1.0)}]
    e = {'bbox': [[0.5, 1.75, 0.0], [4.2, 2.25, 1.0]], 'tol': 0.01, 'parts': parts, 'strayMax': 0.0}
    for ext in ['pdms', 'pdmsmac', 'mac']:
        case(f'pdms_basic_{ext}', [f'pdms/basic.{ext}'], e, BW, f'PDMS の箱と円柱（.{ext}）')
    # 単位の宣言（METRE）
    s2 = 'METRE\n' + s.replace('1000', '1').replace('2000', '2').replace('3000', '3').replace(' 500', ' 0.5').replace(' 200', ' 0.2').replace(' 100', ' 0.1').replace(' 400', ' 0.4')
    open(path('pdms/metre.mac'), 'w').write(s2)
    case('pdms_metre', ['pdms/metre.mac'], {**e, 'note': r'^(?!.*mm を m に直して).*$'}, BW, '単位 METRE を宣言した PDMS（注記に「mm を m に」と出ないこと）')
    # 向き（ORIENTED Z IS N: 円柱の軸が北向き）
    s3 = '''NEW CYLINDER /C2
  DIAMETER 200
  HEIGHT 2000
  AT E 0 N 0 U 0
  ORIENTED X IS E AND Z IS N
END
'''
    open(path('pdms/orient.mac'), 'w').write(s3)
    case('pdms_orient', ['pdms/orient.mac'], {'bbox': [[-0.1, -1.0, -0.1], [0.1, 1.0, 0.1]], 'tol': 0.01}, BW, 'ORIENTED X IS E AND Z IS N（軸が北向きの円柱）')
    # 斜めの向き（X IS E 45 N）
    s4 = '''NEW BOX /B2
  XLENGTH 2000
  YLENGTH 100
  ZLENGTH 100
  AT E 0 N 0 U 0
  ORIENTED X IS E 45 N AND Z IS U
END
'''
    open(path('pdms/angle.mac'), 'w').write(s4)
    h = 1.0 / math.sqrt(2) + 0.05 / math.sqrt(2)
    case('pdms_angle', ['pdms/angle.mac'], {'bbox': [[-h, -h, -0.05], [h, h, 0.05]], 'tol': 0.02}, BW, 'ORIENTED X IS E 45 N（斜めの向き）')


def gen():
    gen_dxf(); gen_shp(); gen_pdms()
