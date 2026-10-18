# FBX・COLLADA（画面側の three.js の読み込み部品で読む形式）
import struct, zlib, math
import numpy as np
from common import *

BE = ('browser', 'electron')
CA, CB = (200, 100, 50), (60, 180, 90)   # 中間の色（sRGB → 線形の変換があると暗くなる）


def srgb2lin(c):
    c = np.asarray(c, float) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4) * 255


# ---------------------------------------------------------------- FBX（文字 7.4・バイナリ 7.4）
def fbx_ascii(geoms, models, materials, conns, unit=100.0, up=2):
    a = lambda arr, fmt: ','.join(fmt % v for v in arr)
    objs = []
    for g in geoms:
        s = f'''	Geometry: {g["id"]}, "Geometry::{g["name"]}", "Mesh" {{
		Vertices: *{g["V"].size} {{
			a: {a(g["V"].ravel(), '%.6f')}
		}}
		PolygonVertexIndex: *{len(g["pvi"])} {{
			a: {a(g["pvi"], '%d')}
		}}
		GeometryVersion: 124
'''
        layers = []
        if g.get('C') is not None:
            cols = np.hstack([g['C'] / 255.0, np.ones((len(g['C']), 1))]).ravel()
            s += f'''		LayerElementColor: 0 {{
			Version: 101
			Name: "colors"
			MappingInformationType: "ByVertice"
			ReferenceInformationType: "Direct"
			Colors: *{cols.size} {{
				a: {a(cols, '%.6f')}
			}}
		}}
'''
            layers.append('LayerElementColor')
        if g.get('mat'):
            s += '''		LayerElementMaterial: 0 {
			Version: 101
			Name: ""
			MappingInformationType: "AllSame"
			ReferenceInformationType: "IndexToDirect"
			Materials: *1 {
				a: 0
			}
		}
'''
            layers.append('LayerElementMaterial')
        s += '		Layer: 0 {\n			Version: 100\n' + ''.join(f'			LayerElement:  {{\n				Type: "{t}"\n				TypedIndex: 0\n			}}\n' for t in layers) + '		}\n	}\n'
        objs.append(s)
    for m in models:
        props = ''
        for k, v in m.get('props', {}).items():
            props += f'			P: "{k}", "{k}", "", "A",{v[0]},{v[1]},{v[2]}\n'
        objs.append(f'	Model: {m["id"]}, "Model::{m["name"]}", "Mesh" {{\n		Version: 232\n		Properties70:  {{\n{props}		}}\n		Shading: T\n		Culling: "CullingOff"\n	}}\n')
    for mt in materials:
        c = mt['color']
        objs.append(f'	Material: {mt["id"]}, "Material::{mt["name"]}", "" {{\n		Version: 102\n		ShadingModel: "phong"\n		MultiLayer: 0\n		Properties70:  {{\n			P: "DiffuseColor", "Color", "", "A",{c[0] / 255:.6f},{c[1] / 255:.6f},{c[2] / 255:.6f}\n		}}\n	}}\n')
    return f'''; FBX 7.4.0 project file
FBXHeaderExtension:  {{
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}}
GlobalSettings:  {{
	Version: 1000
	Properties70:  {{
		P: "UpAxis", "int", "Integer", "",{up}
		P: "UpAxisSign", "int", "Integer", "",1
		P: "FrontAxis", "int", "Integer", "",1
		P: "FrontAxisSign", "int", "Integer", "",-1
		P: "CoordAxis", "int", "Integer", "",0
		P: "CoordAxisSign", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",{unit}
	}}
}}
Objects:  {{
{''.join(objs)}}}
Connections:  {{
{''.join(f'	C: "OO",{a_},{b_}' + chr(10) for a_, b_ in conns)}}}
'''


def prop(v):
    if isinstance(v, bool): return b'C' + struct.pack('<?', v)
    if isinstance(v, int): return (b'I' + struct.pack('<i', v)) if -2 ** 31 <= v < 2 ** 31 else (b'L' + struct.pack('<q', v))
    if isinstance(v, float): return b'D' + struct.pack('<d', v)
    if isinstance(v, str): b = v.encode(); return b'S' + struct.pack('<I', len(b)) + b
    if isinstance(v, bytes): return b'S' + struct.pack('<I', len(v)) + v
    if isinstance(v, np.ndarray):
        code, dt = {np.dtype('float64'): (b'd', '<f8'), np.dtype('int32'): (b'i', '<i4'), np.dtype('int64'): (b'l', '<i8')}[v.dtype]
        raw = v.astype(dt).tobytes(); comp = zlib.compress(raw)
        return code + struct.pack('<III', len(v), 1, len(comp)) + comp
    raise TypeError(v)


def node(name, props=(), children=()):
    return (name, [prop(p) for p in props], list(children))


def write_nodes(nodes, offset):
    out = b''
    for name, props, children in nodes:
        pbytes = b''.join(props); nb = name.encode()
        head_len = 13 + len(nb) + len(pbytes)
        child = b''
        if children:
            child = write_nodes(children, offset + head_len) + b'\0' * 13
        end = offset + head_len + len(child)
        out += struct.pack('<IIIB', end, len(props), len(pbytes), len(nb)) + nb + pbytes + child
        offset = end
    return out


def fbx_binary(geoms, models, conns, unit=100.0):
    P70 = lambda *ps: node('Properties70', (), [node('P', p) for p in ps])
    objs = []
    for g in geoms:
        ch = [node('Vertices', (g['V'].ravel().astype(np.float64),)), node('PolygonVertexIndex', (np.array(g['pvi'], np.int32),)), node('GeometryVersion', (124,))]
        lay = []
        if g.get('C') is not None:
            cols = np.hstack([g['C'] / 255.0, np.ones((len(g['C']), 1))]).ravel()
            ch.append(node('LayerElementColor', (0,), [node('Version', (101,)), node('Name', ('colors',)), node('MappingInformationType', ('ByVertice',)), node('ReferenceInformationType', ('Direct',)), node('Colors', (cols.astype(np.float64),))]))
            lay.append(node('LayerElement', (), [node('Type', ('LayerElementColor',)), node('TypedIndex', (0,))]))
        ch.append(node('Layer', (0,), [node('Version', (100,))] + lay))
        objs.append(node('Geometry', (g['id'], g['name'].encode() + b'\x00\x01Geometry', 'Mesh'), ch))
    for m in models:
        ps = [(k, k, '', 'A', float(v[0]), float(v[1]), float(v[2])) for k, v in m.get('props', {}).items()]
        objs.append(node('Model', (m['id'], m['name'].encode() + b'\x00\x01Model', 'Mesh'), [node('Version', (232,)), P70(*ps)]))
    nodes = [
        node('FBXHeaderExtension', (), [node('FBXHeaderVersion', (1003,)), node('FBXVersion', (7400,))]),
        node('GlobalSettings', (), [node('Version', (1000,)), P70(('UpAxis', 'int', 'Integer', '', 2), ('UpAxisSign', 'int', 'Integer', '', 1), ('UnitScaleFactor', 'double', 'Number', '', float(unit)))]),
        node('Objects', (), objs),
        node('Connections', (), [node('C', ('OO', a_, b_)) for a_, b_ in conns]),
    ]
    head = b'Kaydara FBX Binary  \x00\x1a\x00' + struct.pack('<I', 7400)
    body = write_nodes(nodes, len(head)) + b'\0' * 13
    footer = bytes([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e])
    data = head + body + footer
    pad = (16 - len(data) % 16) % 16 or 16
    return data + b'\0' * pad + struct.pack('<I', 7400) + b'\0' * 120 + bytes([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b])


def pvi_of(T):
    out = []
    for t in T: out += [int(t[0]), int(t[1]), -int(t[2]) - 1]
    return out


def gen_fbx():
    P = two_boxes(CA, CB)
    geoms = [{'id': 1000 + k, 'name': n, 'V': V, 'pvi': pvi_of(T), 'C': np.tile(np.array(c, float), (len(V), 1))} for k, (V, T, c, n) in enumerate(P)]
    models = [{'id': 2000 + k, 'name': n} for k, (V, T, c, n) in enumerate(P)]
    conns = [(1000 + k, 2000 + k) for k in range(2)] + [(2000 + k, 0) for k in range(2)]
    open(path('fbx/vcolor_ascii.fbx'), 'w').write(fbx_ascii(geoms, models, [], conns))
    open(path('fbx/vcolor_binary.fbx'), 'wb').write(fbx_binary(geoms, models, conns))
    e = mesh_expect(P, ctol=6, extra={'rgb': True})
    case('fbx_vcolor_ascii', ['fbx/vcolor_ascii.fbx'], e, BE, 'FBX 文字 7.4・頂点色（中間の色 200,100,50 / 60,180,90）')
    case('fbx_vcolor_binary', ['fbx/vcolor_binary.fbx'], e, BE, 'FBX バイナリ 7.4・頂点色')
    # 材質の色（頂点色なし）
    g2 = [dict(g, C=None, mat=True) for g in geoms]
    mats = [{'id': 3000 + k, 'name': f'm{k}', 'color': c} for k, (V, T, c, n) in enumerate(P)]
    conns2 = conns + [(3000 + k, 2000 + k) for k in range(2)]
    open(path('fbx/material.fbx'), 'w').write(fbx_ascii(g2, models, mats, conns2))
    case('fbx_material', ['fbx/material.fbx'], e, BE, 'FBX・材質の色（DiffuseColor）')
    # モデルの変換（移動・回転・拡大）
    a = box(0, 0, 0, 1, 1, 1)
    g3 = [{'id': 1000, 'name': 'A', 'V': a[0], 'pvi': pvi_of(a[1]), 'C': None}]
    m3 = [{'id': 2000, 'name': 'A', 'props': {'Lcl Translation': (10, 0, 0), 'Lcl Rotation': (0, 0, 90), 'Lcl Scaling': (2, 2, 2)}}]
    open(path('fbx/xform.fbx'), 'w').write(fbx_ascii(g3, m3, [], [(1000, 2000), (2000, 0)]))
    Vw = np.array([[10 - 2 * y, 2 * x, 2 * z] for x, y, z in a[0]])
    case('fbx_xform', ['fbx/xform.fbx'], mesh_expect([(Vw, a[1], None, 'A')]), BE, 'FBX・Lcl Translation/Rotation/Scaling')
    # 単位が cm（UnitScaleFactor = 1）: 情報
    open(path('fbx/unit_cm.fbx'), 'w').write(fbx_ascii(geoms, models, [], conns, unit=1.0))
    case('fbx_unit_cm', ['fbx/unit_cm.fbx'], mesh_expect([(V * 0.01, T, c, n) for V, T, c, n in P], ctol=6, extra={'rgb': True}), BE, '（情報）UnitScaleFactor=1（cm）の FBX → m に直すか')


# ---------------------------------------------------------------- COLLADA
def dae(parts, up='Z_UP', unit=1.0, vcolor=False, xform=None):
    eff, mats, geos, nodes = [], [], [], []
    for k, (V, T, c, n) in enumerate(parts):
        cf = ' '.join('%.6f' % (x / 255) for x in c)
        eff.append(f'<effect id="e{k}"><profile_COMMON><technique sid="common"><lambert><diffuse><color>{cf} 1</color></diffuse></lambert></technique></profile_COMMON></effect>')
        mats.append(f'<material id="m{k}"><instance_effect url="#e{k}"/></material>')
        pos = ' '.join('%.6f' % x for x in V.ravel())
        src = f'<source id="g{k}-p"><float_array id="g{k}-pa" count="{V.size}">{pos}</float_array><technique_common><accessor source="#g{k}-pa" count="{len(V)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>'
        inp = f'<input semantic="VERTEX" source="#g{k}-v" offset="0"/>'
        if vcolor:
            col = ' '.join('%.6f' % (x / 255) for x in np.tile(c, len(V)))
            src += f'<source id="g{k}-c"><float_array id="g{k}-ca" count="{len(V) * 3}">{col}</float_array><technique_common><accessor source="#g{k}-ca" count="{len(V)}" stride="3"><param name="R" type="float"/><param name="G" type="float"/><param name="B" type="float"/></accessor></technique_common></source>'
            inp += f'<input semantic="COLOR" source="#g{k}-c" offset="0"/>'
        tri = ' '.join(str(int(i)) for i in T.ravel())
        geos.append(f'<geometry id="g{k}"><mesh>{src}<vertices id="g{k}-v"><input semantic="POSITION" source="#g{k}-p"/></vertices><triangles material="mat" count="{len(T)}">{inp}<p>{tri}</p></triangles></mesh></geometry>')
        xf = xform if (xform and k == 0) else ''
        nodes.append(f'<node id="n{k}">{xf}<instance_geometry url="#g{k}"><bind_material><technique_common><instance_material symbol="mat" target="#m{k}"/></technique_common></bind_material></instance_geometry></node>')
    return f'''<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit name="u" meter="{unit}"/><up_axis>{up}</up_axis></asset>
<library_effects>{''.join(eff)}</library_effects>
<library_materials>{''.join(mats)}</library_materials>
<library_geometries>{''.join(geos)}</library_geometries>
<library_visual_scenes><visual_scene id="s">{''.join(nodes)}</visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene>
</COLLADA>
'''


def gen_dae():
    P = two_boxes(CA, CB)
    e = mesh_expect(P, ctol=6, extra={'rgb': True})
    open(path('dae/zup.dae'), 'w').write(dae(P, 'Z_UP'))
    case('dae_zup', ['dae/zup.dae'], e, BE, 'COLLADA Z_UP（Blender・SketchUp の既定）: 座標がそのまま（Z が上）で、材質の色が元の値')
    open(path('dae/yup.dae'), 'w').write(dae(P, 'Y_UP'))
    case('dae_yup', ['dae/yup.dae'], e, BE, 'COLLADA Y_UP（ファイルの座標のまま読む今の作り）')
    open(path('dae/vcolor.dae'), 'w').write(dae(P, 'Y_UP', vcolor=True))
    case('dae_vcolor', ['dae/vcolor.dae'], e, BE, 'COLLADA の頂点色（中間の色）')
    open(path('dae/unit_cm.dae'), 'w').write(dae(P, 'Y_UP', unit=0.01))
    case('dae_unit_cm', ['dae/unit_cm.dae'], mesh_expect([(V * 0.01, T, c, n) for V, T, c, n in P], ctol=6, extra={'rgb': True}), BE, 'COLLADA <unit meter="0.01">（m に直す）')
    a = box(0, 0, 0, 1, 1, 1)
    xf = '<translate>10 0 0</translate><rotate>0 0 1 90</rotate><scale>2 2 2</scale>'
    open(path('dae/xform.dae'), 'w').write(dae([(a[0], a[1], CA, 'A')], 'Y_UP', xform=xf))
    Vw = np.array([[10 - 2 * y, 2 * x, 2 * z] for x, y, z in a[0]])
    case('dae_xform', ['dae/xform.dae'], mesh_expect([(Vw, a[1], CA, 'A')], ctol=6, extra={'rgb': True}), BE, 'COLLADA のノード変換（translate・rotate・scale）')


def gen():
    gen_fbx(); gen_dae(); gen_samples()


def gen_samples():
    """試作ページにも入っているサンプル（同じ廊下のメッシュ）の色が形式で変わらないか"""
    import trimesh, shutil
    S = '/home/claude/pcd-viewer/sample/formats'
    m = trimesh.load(os.path.join(S, 'trimesh_mesh.ply'), process=False)
    V = np.asarray(m.vertices); T = np.asarray(m.faces); C = np.asarray(m.visual.vertex_colors)[:, :3].astype(float)
    A = tri_areas(V, T)
    col = (A[:, None] * C[T].mean(1)).sum(0) / A.sum()
    for f in ['trimesh_mesh.ply', 'handmade_ascii.fbx', 'handmade_binary.fbx', 'trimesh_mesh.dae', 'trimesh_mesh.glb', 'dracopy_mesh.drc']:
        shutil.copy(os.path.join(S, f), path('samples/' + f))
    for f in ['handmade_ascii.fbx', 'handmade_binary.fbx', 'trimesh_mesh.dae', 'trimesh_mesh.glb', 'dracopy_mesh.drc', 'trimesh_mesh.ply']:
        where = ('browser', 'electron', 'artifact') if f.endswith(('fbx', 'dae')) else ('browser',)
        case('sample_color_' + f.replace('.', '_'), ['samples/' + f], {'rgb': True, 'color': [round(x, 1) for x in col], 'ctol': 3}, where, f'同梱サンプル {f} の平均色が PLY（同じメッシュ・同じ頂点色）と同じか')
