# Draco・IFC・STEP・PhotoScan（.psz）の変種
import math, io, zipfile, shutil
import numpy as np
from common import *

B = ('browser',)          # Draco・IFC は Node では動かない（wasm の作り）
BW = ('node', 'browser')
OCCT = '/home/claude/pcd-viewer/node_modules/occt-import-js/test/testfiles'


# ---------------------------------------------------------------- Draco
def gen_drc():
    import DracoPy
    rng = np.random.default_rng(5)
    Q = rng.uniform([0, 0, 0], [50, 20, 3], (2000, 3)).astype(np.float32)
    col = np.zeros((2000, 3), np.uint8); col[:1000] = [255, 0, 0]; col[1000:] = [0, 0, 255]
    Q[:1000, 0] *= 0.4  # 赤 x<20、青 x>=0（重なりを避けるため青は 25 以上へ）
    Q[1000:, 0] = 25 + Q[1000:, 0] * 0.5
    open(path('drc/cloud_rgb.drc'), 'wb').write(DracoPy.encode(Q, colors=col, quantization_bits=16))
    q = 50 / 65535 * 2
    parts = [{'name': 'red', 'box': [-q, -q, -q, 20 + q, 20 + q, 3 + q], 'color': [255, 0, 0], 'frac': [0.49, 0.51]}, {'name': 'blue', 'box': [25 - q, -q, -q, 50 + q, 20 + q, 3 + q], 'color': [0, 0, 255], 'frac': [0.49, 0.51]}]
    case('drc_cloud_rgb', ['drc/cloud_rgb.drc'], {'n': [2000, 2000], 'rgb': True, 'parts': parts, 'strayMax': 0.0, 'bbox': [Q.min(0).tolist(), Q.max(0).tolist()], 'tol': 2e-3, 'fmt': '点群'}, B, 'Draco 点群（色 uint8、16 bit 量子化）')
    open(path('drc/cloud_nocolor.drc'), 'wb').write(DracoPy.encode(Q, quantization_bits=14))
    case('drc_cloud_nocolor', ['drc/cloud_nocolor.drc'], {'n': [2000, 2000], 'rgb': False, 'bbox': [Q.min(0).tolist(), Q.max(0).tolist()], 'tol': 5e-3}, B, 'Draco 点群（色なし）')
    col4 = np.hstack([col, np.full((2000, 1), 255, np.uint8)])
    open(path('drc/cloud_rgba.drc'), 'wb').write(DracoPy.encode(Q, colors=col4, quantization_bits=16))
    case('drc_cloud_rgba', ['drc/cloud_rgba.drc'], {'n': [2000, 2000], 'rgb': True, 'parts': parts, 'strayMax': 0.0}, B, 'Draco 点群（RGBA）')
    # 強度などの任意の属性（generic）
    try:
        inten = np.linspace(0, 1000, 2000).astype(np.float32)
        b = DracoPy.encode(Q, generic_attributes={0: inten.reshape(-1, 1)}, quantization_bits=16)
        open(path('drc/cloud_generic.drc'), 'wb').write(b)
        case('drc_cloud_generic', ['drc/cloud_generic.drc'], {'n': [2000, 2000], 'fields': ['generic0']}, B, '（情報）Draco の任意の属性（強度など）を値の欄に出すか')
    except Exception as e:
        print('generic attr skip', e)
    # メッシュ（色・法線・UV つき）
    P = two_boxes()
    V, T, C, pid = merge(P)
    nrm = (V - V.mean(0)); nrm /= np.linalg.norm(nrm, axis=1)[:, None]
    uv = np.zeros((len(V), 2))
    open(path('drc/mesh_rgb.drc'), 'wb').write(DracoPy.encode(V.astype(np.float32), faces=T.astype(np.uint32), colors=C.astype(np.uint8), normals=nrm.astype(np.float64), tex_coord=uv, quantization_bits=16))
    e = mesh_expect(P, extra={'rgb': True, 'fmt': 'メッシュ'}); e['tol'] = 2e-3
    case('drc_mesh_rgb', ['drc/mesh_rgb.drc'], e, B, 'Draco メッシュ（色・法線・UV）')
    # 大きな座標
    off = np.array([539000.0, 3836000.0, 30.0])
    Qb = (Q.astype(np.float64) + off)
    open(path('drc/cloud_big.drc'), 'wb').write(DracoPy.encode(Qb.astype(np.float32), colors=col, quantization_bits=16))
    case('drc_cloud_big', ['drc/cloud_big.drc'], {'n': [2000, 2000], 'bbox': [Qb.min(0).tolist(), Qb.max(0).tolist()], 'tol': 0.3}, B, 'Draco 点群（UTM 風の大きな座標。float32 の限界 ≈0.25 m は Draco 側の制約）')


# ---------------------------------------------------------------- IFC
def ifc_truth(fn, skip=('IfcSpace', 'IfcOpeningElement')):
    """ifcopenshell の形状（世界座標・m）で部材ごとの三角形を返す"""
    import ifcopenshell, ifcopenshell.geom
    f = ifcopenshell.open(fn)
    s = ifcopenshell.geom.settings(); s.set('use-world-coords', True)
    it = ifcopenshell.geom.iterator(s, f)
    parts = []
    if it.initialize():
        while True:
            sh = it.get()
            el = f.by_id(sh.id)
            if el.is_a() not in skip:
                V = np.array(sh.geometry.verts).reshape(-1, 3); T = np.array(sh.geometry.faces).reshape(-1, 3)
                parts.append((V, T, None, f'{el.is_a()}#{sh.id}'))
            if not it.next(): break
    return parts


def gen_ifc():
    import ifcopenshell, ifcopenshell.api
    run = ifcopenshell.api.run

    def build(version='IFC4', unit_mm=False, site_xyz=(0, 0, 0), with_space=False, with_opening=False, color=False, mapped=False, big_geom=False, minimal=False):
        f = run('project.create_file', version=version)
        if version == 'IFC2X3':
            import ifcopenshell.api.owner.settings as ows
            person = f.createIfcPerson(); org = f.createIfcOrganization(Name='A02')
            user = f.createIfcPersonAndOrganization(person, org)
            app = f.createIfcApplication(org, '1', 'A02', 'A02')
            ows.get_user = lambda f: user; ows.get_application = lambda f: app
        proj = run('root.create_entity', f, ifc_class='IfcProject', name='P')
        # 長さの単位を明示（m または mm）。API の寸法は SI（m）で渡し、手で作る形状だけ単位 u を掛ける
        lu = run('unit.add_si_unit', f, unit_type='LENGTHUNIT', prefix='MILLI') if unit_mm else run('unit.add_si_unit', f, unit_type='LENGTHUNIT')
        run('unit.assign_unit', f, units=[lu])
        u = 1000.0 if unit_mm else 1.0
        ctx = run('context.add_context', f, context_type='Model')
        body = run('context.add_context', f, context_type='Model', context_identifier='Body', target_view='MODEL_VIEW', parent=ctx)
        site = run('root.create_entity', f, ifc_class='IfcSite', name='S')
        bld = run('root.create_entity', f, ifc_class='IfcBuilding', name='B')
        st = run('root.create_entity', f, ifc_class='IfcBuildingStorey', name='1F')
        run('aggregate.assign_object', f, relating_object=proj, products=[site])
        run('aggregate.assign_object', f, relating_object=site, products=[bld])
        run('aggregate.assign_object', f, relating_object=bld, products=[st])
        M = np.eye(4); M[:3, 3] = np.array(site_xyz, float)
        run('geometry.edit_object_placement', f, product=site, matrix=M, is_si=True)

        def place(el, x, y, z):
            M = np.eye(4); M[:3, 3] = np.array([x, y, z], float) + np.array(site_xyz, float)
            run('geometry.edit_object_placement', f, product=el, matrix=M, is_si=True)
        if not minimal:
            w = run('root.create_entity', f, ifc_class='IfcWall', name='W')
            rep = run('geometry.add_wall_representation', f, context=body, length=10.0, height=3.0, thickness=0.2)
            run('geometry.assign_representation', f, product=w, representation=rep); place(w, 0, 0, 0)
            run('spatial.assign_container', f, relating_structure=st, products=[w])
            sl = run('root.create_entity', f, ifc_class='IfcSlab', name='F')
            rep = run('geometry.add_slab_representation', f, context=body, depth=0.2)
            run('geometry.assign_representation', f, product=sl, representation=rep); place(sl, 20, 0, 0)
            run('spatial.assign_container', f, relating_structure=st, products=[sl])
        if color:
            style = run('style.add_style', f, name='red')
            run('style.add_surface_style', f, style=style, ifc_class='IfcSurfaceStyleShading', attributes={'SurfaceColour': {'Name': None, 'Red': 1.0, 'Green': 0.0, 'Blue': 0.0}})
            run('style.assign_representation_styles', f, shape_representation=rep, styles=[style])
        if with_space:
            sp = run('root.create_entity', f, ifc_class='IfcSpace', name='Room')
            rep = run('geometry.add_wall_representation', f, context=body, length=4.0, height=2.5, thickness=4.0)
            run('geometry.assign_representation', f, product=sp, representation=rep); place(sp, 40, 0, 0)
            run('aggregate.assign_object', f, relating_object=st, products=[sp])
        if with_opening:
            op = run('root.create_entity', f, ifc_class='IfcOpeningElement', name='O')
            rep = run('geometry.add_wall_representation', f, context=body, length=2.0, height=2.0, thickness=1.0)
            run('geometry.assign_representation', f, product=op, representation=rep); place(op, 4, -0.4, 0.5)
            run('feature.add_feature', f, feature=op, element=w)
        if big_geom:
            # 形状そのものが大きな座標（敷地の座標をそのまま断面の点に書く書き出し方）
            pts = [(539000.0, 3836000.0), (539010.0, 3836000.0), (539010.0, 3836010.0), (539000.0, 3836010.0)]
            poly = f.createIfcPolyline([f.createIfcCartesianPoint((x * u, y * u)) for x, y in pts + [pts[0]]])
            prof = f.createIfcArbitraryClosedProfileDef('AREA', None, poly)
            solid = f.createIfcExtrudedAreaSolid(prof, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 0.0))), f.createIfcDirection((0.0, 0.0, 1.0)), 0.3 * u)
            rep = f.createIfcShapeRepresentation(body, 'Body', 'SweptSolid', [solid])
            sl2 = run('root.create_entity', f, ifc_class='IfcSlab', name='BigSlab')
            run('geometry.assign_representation', f, product=sl2, representation=rep)
            M = np.eye(4); run('geometry.edit_object_placement', f, product=sl2, matrix=M, is_si=True)
            run('spatial.assign_container', f, relating_structure=st, products=[sl2])
        if mapped:
            ct = run('root.create_entity', f, ifc_class='IfcColumnType', name='CT')
            prof = f.create_entity('IfcRectangleProfileDef', ProfileType='AREA', XDim=0.4 * u, YDim=0.4 * u)
            rep = run('geometry.add_profile_representation', f, context=body, profile=prof, depth=3.0)
            run('geometry.assign_representation', f, product=ct, representation=rep)
            for i, x in enumerate((30, 33)):
                c = run('root.create_entity', f, ifc_class='IfcColumn', name=f'C{i}')
                run('type.assign_type', f, related_objects=[c], relating_type=ct)
                place(c, x, 0, 0)
                run('spatial.assign_container', f, relating_structure=st, products=[c])
        return f

    variants = [
        ('ifc4_basic', dict(), 'IFC4・壁と床'),
        ('ifc2x3_basic', dict(version='IFC2X3'), 'IFC2X3・壁と床'),
        ('ifc_mm', dict(unit_mm=True), '単位が mm の IFC（m に直して表示）'),
        ('ifc_big_site', dict(site_xyz=(539000, 3836000, 30)), '敷地が UTM 風の大きな座標'),
        ('ifc_space_opening', dict(with_space=True, with_opening=True), 'IfcSpace（部屋の空間）と開口（IfcOpeningElement）を点にしないこと'),
        ('ifc_color', dict(color=True), '材質の色（赤）'),
        ('ifc_mapped', dict(mapped=True), '型（IfcMappedItem）を 2 本の柱で共有'),
        ('ifc_big_geom', dict(big_geom=True, minimal=True), '形状の点そのものが UTM 風の大きな座標（大きな板だけ。float32 の丸めで 3〜6 cm ずれないか）'),
        ('ifc_big_mixed', dict(big_geom=True), '原点付近の壁・床と、形状の点が大きな座標の板が同じファイルに（シフトの決め方）'),
    ]
    for cid, kw, desc in variants:
        fn = path(f'ifc/{cid}.ifc')
        try:
            f = build(**kw)
            f.write(fn)
            parts = ifc_truth(fn)
        except Exception as ex:
            print('IFC skip', cid, ex); continue
        e = mesh_expect(parts, ctol=10)
        e['tol'] = 0.02; e['mtol'] = 0.1
        for p in e['parts']: p['frac'] = [max(0, p['frac'][0] - 0.02), p['frac'][1] + 0.02]
        if kw.get('site_xyz'): e['offset'] = [539000, 3836000, 0]
        if kw.get('big_geom'):
            # 大きな板の点は ifcopenshell の形状の範囲 ±1 mm に収まること（原点付近の壁・床は広い箱で別に数える）
            big = [p for p in parts if p[0][:, 0].max() > 1e5]
            lo = np.min([p[0].min(0) for p in big], 0); hi = np.max([p[0].max(0) for p in big], 0)
            e = {'parts': [{'name': 'big_slab', 'box': (np.concatenate([lo - 0.001, hi + 0.001])).tolist(), 'minCount': 1000, 'minDistinctX': 5000},
                           {'name': 'near_origin', 'box': [-1, -1, -1, 30, 5, 5]}], 'strayMax': 0.0, 'offset': [539000, 3836000, 0]}
        if kw.get('color'):
            for p in e['parts']:
                if p['name'].startswith('IfcSlab'): p['color'] = [255, 0, 0]; p['ctol'] = 3
        if kw.get('with_opening'):
            # 開口の中（壁の x 4〜6・z 0.5〜2.5）に点がないこと
            e['parts'].insert(0, {'name': 'opening_hole', 'box': [4.05, -0.5, 0.55, 5.95, 0.5, 2.45], 'maxCount': 0})
        case(cid, [f'ifc/{cid}.ifc'], e, B, desc)


# ---------------------------------------------------------------- STEP
def gen_step():
    for nm, src in [('cube_mm', 'cube-units/cube-mm.step'), ('cube_m', 'cube-units/cube-m.step'), ('cube_in', 'cube-units/cube-in.step')]:
        shutil.copy(os.path.join(OCCT, src), path(f'step/{nm}.step'))
        b = box(0, 0, 0, 1000, 1000, 1000)
        e = mesh_expect([(b[0], b[1], None, 'cube')]); e['tol'] = 0.5; e['note'] = '.'
        case(f'step_{nm}', [f'step/{nm}.step'], e, BW, f'STEP の単位（{src}: 1 m の立方体 → mm で 1000）')
    # 組立品（同じ部品を複数配置・色）
    for nm in ['as1-oc-214.stp', 'as1_pe_203.stp']:
        shutil.copy(os.path.join(OCCT, 'cax-if', nm), path(f'step/{nm}'))
    import gmsh
    for nm in ['as1-oc-214.stp', 'as1_pe_203.stp']:
        gmsh.initialize(); gmsh.option.setNumber('General.Terminal', 0)
        gmsh.option.setString('Geometry.OCCTargetUnit', 'MM')
        gmsh.model.occ.importShapes(path(f'step/{nm}')); gmsh.model.occ.synchronize()
        bbx = gmsh.model.getBoundingBox(-1, -1)
        nvol = len(gmsh.model.getEntities(3))
        gmsh.finalize()
        lo, hi = bbx[:3], bbx[3:]
        case(f'step_{nm.split(".")[0].replace("-", "_")}', [f'step/{nm}'], {'bbox': [list(lo), list(hi)], 'tol': max(1.0, 0.002 * max(np.subtract(hi, lo))), 'rgb': True}, BW, f'CAx-IF の組立品 {nm}（部品 {nvol} 個、範囲は gmsh/OCC と比べる）')
    # .stp と .STEP（大文字）
    shutil.copy(os.path.join(OCCT, 'cube-units/cube-mm.step'), path('step/CUBE.STP'))
    b = box(0, 0, 0, 1000, 1000, 1000)
    e = mesh_expect([(b[0], b[1], None, 'cube')]); e['tol'] = 0.5; e['note'] = '.'
    case('step_upper_ext', ['step/CUBE.STP'], e, BW, '拡張子が大文字（.STP）')


# ---------------------------------------------------------------- PhotoScan
def ply_bytes(Pt, C, faces=None):
    h = f"ply\nformat binary_little_endian 1.0\nelement vertex {len(Pt)}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\n"
    if faces is not None: h += f"element face {len(faces)}\nproperty list uchar int vertex_indices\n"
    h += "end_header\n"
    rec = np.zeros(len(Pt), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('r', 'u1'), ('g', 'u1'), ('b', 'u1')])
    rec['x'], rec['y'], rec['z'] = np.asarray(Pt).T; rec['r'], rec['g'], rec['b'] = np.asarray(C).T
    out = h.encode() + rec.tobytes()
    if faces is not None:
        fr = np.zeros(len(faces), dtype=[('n', 'u1'), ('i', '<i4', 3)]); fr['n'] = 3; fr['i'] = faces; out += fr.tobytes()
    return out


def zbytes(entries):
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED) as z:
        for n, b in entries.items(): z.writestr(n, b)
    return bio.getvalue()


def gen_psz():
    rng = np.random.default_rng(7)
    D = rng.uniform([0, 0, 0], [10, 10, 1], (3000, 3)); DC = np.tile([255, 0, 0], (3000, 1))
    S = rng.uniform([0, 0, 0], [10, 10, 1], (100, 3)); SC = np.tile([0, 255, 0], (100, 1))
    P = two_boxes(); V, T, C, pid = merge(P); V2 = V + [20, 0, 0]
    doc = '''<?xml version="1.0" encoding="UTF-8"?>
<document version="1.2.0"><chunks><chunk id="0" label="Chunk 1" enabled="true"><frames><frame id="0">
<point_cloud><points path="point_cloud/points0.ply"/></point_cloud>
<dense_cloud><points path="dense_cloud/dense_cloud.ply"/></dense_cloud>
<model><mesh path="model/mesh.ply"/></model>
</frame></frames></chunk></chunks></document>'''
    ent = {'doc.xml': doc, 'point_cloud/points0.ply': ply_bytes(S, SC), 'dense_cloud/dense_cloud.ply': ply_bytes(D, DC), 'model/mesh.ply': ply_bytes(V2, C, T)}
    open(path('psz/basic.psz'), 'wb').write(zbytes(ent))
    me = mesh_expect([(v + [20, 0, 0], t, c, n) for v, t, c, n in P])
    parts = [{'name': 'clouds', 'box': [-1e-3, -1e-3, -1e-3, 10.001, 10.001, 1.001]}] + me['parts']
    e = {'n': [1003090, 1003101], 'rgb': True, 'parts': [{'name': p['name'], 'box': p['box']} for p in parts], 'strayMax': 0.0, 'note': '面の上に点を散らして'}
    case('psz_basic', ['psz/basic.psz'], e, BW, 'PhotoScan（疎・密の点群とメッシュ）。メッシュを散らしたことの注記')
    # メッシュが OBJ
    obj = '\n'.join('v %.6f %.6f %.6f' % tuple(v) for v in V2) + '\n' + '\n'.join('f %d %d %d' % tuple(t + 1) for t in T) + '\n'
    doc2 = doc.replace('model/mesh.ply', 'model/mesh.obj')
    ent2 = {'doc.xml': doc2, 'point_cloud/points0.ply': ply_bytes(S, SC), 'dense_cloud/dense_cloud.ply': ply_bytes(D, DC), 'model/mesh.obj': obj}
    open(path('psz/obj.psz'), 'wb').write(zbytes(ent2))
    case('psz_obj', ['psz/obj.psz'], {**e, 'note': '.'}, BW, 'PhotoScan（メッシュが OBJ）')
    # 入れ子 1 段（chunk.zip の中の doc.xml）
    inner = '''<?xml version="1.0"?><chunk><frames><frame id="0"><dense_cloud><points path="dense_cloud.ply"/></dense_cloud></frame></frames></chunk>'''
    top = '''<?xml version="1.0"?><document version="1.4.0"><chunks><chunk id="0" path="0/chunk.zip"/></chunks></document>'''
    ent3 = {'doc.xml': top, '0/chunk.zip': zbytes({'doc.xml': inner, 'dense_cloud.ply': ply_bytes(D, DC)})}
    open(path('psz/nested1.psz'), 'wb').write(zbytes(ent3))
    case('psz_nested1', ['psz/nested1.psz'], {'n': [3000, 3000], 'rgb': True, 'color': [255, 0, 0]}, BW, 'PhotoScan（chunk.zip の入れ子 1 段）')
    # 入れ子 2 段（chunk.zip → frame.zip）
    frame = '''<?xml version="1.0"?><frame><dense_cloud><points path="dense_cloud.ply"/></dense_cloud></frame>'''
    chunk = '''<?xml version="1.0"?><chunk><frames><frame id="0" path="0/frame.zip"/></frames></chunk>'''
    ent4 = {'doc.xml': top, '0/chunk.zip': zbytes({'doc.xml': chunk, '0/frame.zip': zbytes({'doc.xml': frame, 'dense_cloud.ply': ply_bytes(D, DC)})})}
    open(path('psz/nested2.psz'), 'wb').write(zbytes(ent4))
    case('psz_nested2', ['psz/nested2.psz'], {'n': [3000, 3000], 'rgb': True, 'color': [255, 0, 0]}, BW, 'PhotoScan（chunk.zip → frame.zip の入れ子 2 段。コードの説明「frame.zip などの中にあっても探す」）')
    # doc.xml なし
    open(path('psz/nodoc.psz'), 'wb').write(zbytes({'a.ply': ply_bytes(D, DC)}))
    case('psz_nodoc', ['psz/nodoc.psz'], {'error': 'doc\\.xml', 'nfiles': 0}, BW, 'doc.xml のない .psz')
    # 参照先がない
    open(path('psz/missing.psz'), 'wb').write(zbytes({'doc.xml': doc}))
    case('psz_missing', ['psz/missing.psz'], {'error': '見つかりません|ありません', 'nfiles': 0}, BW, 'doc.xml が指すファイルが中にない')


def gen():
    gen_drc(); gen_ifc(); gen_step(); gen_psz()
