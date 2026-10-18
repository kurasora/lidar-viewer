# メッシュ・図面・画像のサンプル
import numpy as np, struct, zlib, io, zipfile, math, os
O = 'out/'
P = np.load('src/P.npy'); I = np.load('src/I.npy'); RGB = np.load('src/RGB.npy')
V = np.load('src/mesh_V.npy'); F = np.load('src/mesh_F.npy'); VC = np.load('src/mesh_C.npy').astype(np.uint8)

# ---------------- FBX（文字形式 7.4 と バイナリ 7.4）: 頂点・面・頂点色
pvi = []
for f in F: pvi += [int(f[0]), int(f[1]), -int(f[2]) - 1]
cols = np.hstack([VC / 255.0, np.ones((len(VC), 1))]).ravel()
def fbx_ascii():
    a = lambda arr, fmt: ','.join(fmt % v for v in arr)
    return f'''; FBX 7.4.0 project file
; Generated for PCD Viewer test
FBXHeaderExtension:  {{
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}}
GlobalSettings:  {{
	Version: 1000
	Properties70:  {{
		P: "UpAxis", "int", "Integer", "",2
		P: "UpAxisSign", "int", "Integer", "",1
		P: "FrontAxis", "int", "Integer", "",1
		P: "FrontAxisSign", "int", "Integer", "",-1
		P: "CoordAxis", "int", "Integer", "",0
		P: "CoordAxisSign", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",100
	}}
}}
Objects:  {{
	Geometry: 1000, "Geometry::corridor", "Mesh" {{
		Vertices: *{V.size} {{
			a: {a(V.ravel(), '%.6f')}
		}}
		PolygonVertexIndex: *{len(pvi)} {{
			a: {a(pvi, '%d')}
		}}
		GeometryVersion: 124
		LayerElementColor: 0 {{
			Version: 101
			Name: "colors"
			MappingInformationType: "ByVertice"
			ReferenceInformationType: "Direct"
			Colors: *{cols.size} {{
				a: {a(cols, '%.4f')}
			}}
		}}
		Layer: 0 {{
			Version: 100
			LayerElement:  {{
				Type: "LayerElementColor"
				TypedIndex: 0
			}}
		}}
	}}
	Model: 2000, "Model::corridor", "Mesh" {{
		Version: 232
		Properties70:  {{
		}}
		Shading: T
		Culling: "CullingOff"
	}}
}}
Connections:  {{
	C: "OO",1000,2000
	C: "OO",2000,0
}}
'''
open(O + 'handmade_ascii.fbx', 'w').write(fbx_ascii())

# バイナリ FBX（7400）の書き出し: 節点 = 終わりの位置・属性の数・属性の長さ・名前・属性・子の節点・空の節点
def prop(v):
    if isinstance(v, bool): return b'C' + struct.pack('<?', v)
    if isinstance(v, int): return (b'I' + struct.pack('<i', v)) if -2**31 <= v < 2**31 else (b'L' + struct.pack('<q', v))
    if isinstance(v, float): return b'D' + struct.pack('<d', v)
    if isinstance(v, str): b = v.encode(); return b'S' + struct.pack('<I', len(b)) + b
    if isinstance(v, bytes): return b'S' + struct.pack('<I', len(v)) + v
    if isinstance(v, np.ndarray):
        code, dt = {np.dtype('float64'): (b'd', '<f8'), np.dtype('int32'): (b'i', '<i4'), np.dtype('int64'): (b'l', '<i8'), np.dtype('float32'): (b'f', '<f4')}[v.dtype]
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
            child = write_nodes(children, offset + head_len)
            child += b'\0' * 13
        end = offset + head_len + len(child)
        out += struct.pack('<IIIB', end, len(props), len(pbytes), len(nb)) + nb + pbytes + child
        offset = end
    return out
P70 = lambda *ps: node('Properties70', (), [node('P', p) for p in ps])
nodes = [
    node('FBXHeaderExtension', (), [node('FBXHeaderVersion', (1003,)), node('FBXVersion', (7400,))]),
    node('GlobalSettings', (), [node('Version', (1000,)), P70(('UpAxis', 'int', 'Integer', '', 2), ('UpAxisSign', 'int', 'Integer', '', 1), ('FrontAxis', 'int', 'Integer', '', 1), ('FrontAxisSign', 'int', 'Integer', '', -1), ('CoordAxis', 'int', 'Integer', '', 0), ('CoordAxisSign', 'int', 'Integer', '', 1), ('UnitScaleFactor', 'double', 'Number', '', 100.0))]),
    node('Objects', (), [
        node('Geometry', (1000, b'corridor\x00\x01Geometry', 'Mesh'), [
            node('Vertices', (V.ravel().astype(np.float64),)),
            node('PolygonVertexIndex', (np.array(pvi, np.int32),)),
            node('GeometryVersion', (124,)),
            node('LayerElementColor', (0,), [node('Version', (101,)), node('Name', ('colors',)), node('MappingInformationType', ('ByVertice',)), node('ReferenceInformationType', ('Direct',)), node('Colors', (cols.astype(np.float64),))]),
            node('Layer', (0,), [node('Version', (100,)), node('LayerElement', (), [node('Type', ('LayerElementColor',)), node('TypedIndex', (0,))])]),
        ]),
        node('Model', (2000, b'corridor\x00\x01Model', 'Mesh'), [node('Version', (232,)), P70()]),
    ]),
    node('Connections', (), [node('C', ('OO', 1000, 2000)), node('C', ('OO', 2000, 0))]),
]
head = b'Kaydara FBX Binary  \x00\x1a\x00' + struct.pack('<I', 7400)
body = write_nodes(nodes, len(head)) + b'\0' * 13
footer = bytes([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e])
data = head + body + footer
pad = (16 - len(data) % 16) % 16 or 16
data += b'\0' * pad + struct.pack('<I', 7400) + b'\0' * 120 + bytes([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b])
open(O + 'handmade_binary.fbx', 'wb').write(data)

# ---------------- Draco（点群と メッシュ）
import DracoPy
open(O + 'dracopy_cloud.drc', 'wb').write(DracoPy.encode(P.astype(np.float32), colors=RGB.astype(np.uint8), quantization_bits=16))
open(O + 'dracopy_mesh.drc', 'wb').write(DracoPy.encode(V.astype(np.float32), faces=F.astype(np.uint32), colors=VC, quantization_bits=14))

# ---------------- DXF（ezdxf）: 面（3DFACE）・軌跡（3D ポリライン）・部屋の線（LWPOLYLINE）・円・点
import ezdxf
doc = ezdxf.new('R2010'); msp = doc.modelspace()
doc.layers.add('WALLS', color=2); doc.layers.add('PATH', color=1); doc.layers.add('POINTS', color=5)
for f in F[:1568]:
    a, b, c = V[f]; msp.add_3dface([tuple(a), tuple(b), tuple(c), tuple(c)], dxfattribs={'layer': 'WALLS', 'color': 3})
T = np.loadtxt('/home/claude/pcd-viewer/sample/trajectory.txt', comments='#')[::5, 1:4]
msp.add_polyline3d([tuple(p) for p in T], dxfattribs={'layer': 'PATH'})
for x0 in range(0, 40, 8): msp.add_lwpolyline([(x0, 3.2), (x0 + 6, 3.2), (x0 + 6, 7), (x0, 7)], close=True, dxfattribs={'layer': 'WALLS'})
msp.add_circle((10, -2.2, 0), radius=0.3, dxfattribs={'layer': 'WALLS', 'color': 6})
for p in P[::30]: msp.add_point(tuple(p), dxfattribs={'layer': 'POINTS'})
doc.saveas(O + 'ezdxf_drawing.dxf')

# ---------------- シェープファイル（pyshp）: 点（Z、強度の属性つき）と 線（Z）
import shapefile
w = shapefile.Writer(O + 'pyshp_points', shapeType=shapefile.POINTZ)
w.field('intensity', 'N', 6, 0)
for p, i in zip(P[::4], I[::4]): w.pointz(float(p[0]) + 539000, float(p[1]) + 3836000, float(p[2])); w.record(int(i))
w.close()
w = shapefile.Writer(O + 'pyshp_lines', shapeType=shapefile.POLYLINEZ)
w.field('name', 'C', 20)
w.linez([[(float(x), float(y), float(z)) for x, y, z in T]]); w.record('path')
for x0 in range(0, 40, 8): w.linez([[(x0, -3.2, 0.0), (x0 + 6, -3.2, 0.0), (x0 + 6, -7, 0.0), (x0, -7, 0.0), (x0, -3.2, 0.0)]]); w.record(f'room{x0}')
w.close()

# ---------------- STEP（gmsh の OpenCASCADE で作った箱・円柱・球）
import gmsh
gmsh.initialize(); gmsh.option.setNumber('General.Terminal', 0)
gmsh.model.add('parts')
gmsh.model.occ.addBox(0, 0, 0, 4, 2, 1)
gmsh.model.occ.addCylinder(6, 1, 0, 0, 0, 3, 0.8)
gmsh.model.occ.addSphere(10, 1, 1, 1)
gmsh.model.occ.addTorus(14, 1, 1, 1.2, 0.3)
gmsh.model.occ.synchronize()
gmsh.write(O + 'gmsh_parts.step')
gmsh.finalize()

# ---------------- PDMS（AVEVA のマクロ。CloudCompare の読み方に合わせた部品）
open(O + 'handmade_plant.mac', 'w').write('''NEW EQUIPMENT /PUMP-01
  AT E 1000 N 2000 U 0
  NEW CYLINDER /BODY
    DIAMETER 800
    HEIGHT 1500
    AT E 0 N 0 U 750
  END
  NEW BOX /BASE
    XLENGTH 1400
    YLENGTH 1000
    ZLENGTH 200
    AT E 0 N 0 U -100
  END
  NEW CONE /TOP
    DTOP 200
    DBOTTOM 800
    HEIGHT 400
    AT E 0 N 0 U 1700
  END
  NEW CTORUS /ELBOW
    RINSIDE 300
    ROUTSIDE 500
    ANGLE 90
    AT E 900 N 0 U 1200
    ORIENTED X IS E AND Y IS U
  END
  NEW CYLINDER /PIPE
    DIAMETER 200
    HEIGHT 3000
    AT E 2400 N 0 U 1200
    ORIENTED X IS N AND Y IS U
  END
END
NEW EQUIPMENT /TANK-01
  AT E 6000 N 2000 U 0
  NEW CYLINDER /SHELL
    DIAMETER 2400
    HEIGHT 3000
    AT E 0 N 0 U 1500
  END
  NEW DISH /ROOF
    DIAMETER 2400
    HEIGHT 500
    AT E 0 N 0 U 3000
  END
  NEW SNOUT /NOZZLE
    DTOP 150
    DBOTTOM 300
    HEIGHT 400
    XOFF 0
    YOFF 50
    AT E 1400 N 0 U 2500
    ORIENTED X IS N AND Y IS U
  END
END
''')

# ---------------- PhotoScan のプロジェクト（.psz = zip。doc.xml が点群とメッシュの場所を指す）
from plyfile import PlyData, PlyElement
