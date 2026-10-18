import numpy as np, zipfile, io, struct, math
O = 'out/'
P = np.load('src/P.npy'); RGB = np.load('src/RGB.npy')
V = np.load('src/mesh_V.npy'); F = np.load('src/mesh_F.npy'); VC = np.load('src/mesh_C.npy').astype(np.uint8)

# ---------------- IFC（ifcopenshell）: 建物・階・壁 2 枚・床・柱（押し出しの形）
import ifcopenshell, ifcopenshell.api
run = ifcopenshell.api.run
f = run('project.create_file', version='IFC4')
proj = run('root.create_entity', f, ifc_class='IfcProject', name='Corridor')
run('unit.assign_unit', f)
ctx = run('context.add_context', f, context_type='Model')
body = run('context.add_context', f, context_type='Model', context_identifier='Body', target_view='MODEL_VIEW', parent=ctx)
site = run('root.create_entity', f, ifc_class='IfcSite', name='Site')
bld = run('root.create_entity', f, ifc_class='IfcBuilding', name='Building')
st = run('root.create_entity', f, ifc_class='IfcBuildingStorey', name='1F')
run('aggregate.assign_object', f, relating_object=proj, products=[site])
run('aggregate.assign_object', f, relating_object=site, products=[bld])
run('aggregate.assign_object', f, relating_object=bld, products=[st])
def place(el, x, y, z, rotz=0.0):
    M = np.eye(4); c, s = math.cos(rotz), math.sin(rotz); M[:3, :3] = [[c, -s, 0], [s, c, 0], [0, 0, 1]]; M[:3, 3] = [x, y, z]
    run('geometry.edit_object_placement', f, product=el, matrix=M)
for k, y in enumerate((-3.1, 2.9)):
    w = run('root.create_entity', f, ifc_class='IfcWall', name=f'Wall{k}')
    rep = run('geometry.add_wall_representation', f, context=body, length=40.0, height=2.6, thickness=0.2)
    run('geometry.assign_representation', f, product=w, representation=rep); place(w, 0, y, 0)
    run('spatial.assign_container', f, relating_structure=st, products=[w])
sl = run('root.create_entity', f, ifc_class='IfcSlab', name='Floor')
rep = run('geometry.add_slab_representation', f, context=body, depth=0.2)
run('geometry.assign_representation', f, product=sl, representation=rep); place(sl, 0, -6, -0.2)
run('spatial.assign_container', f, relating_structure=st, products=[sl])
for k, x in enumerate((10.0, 30.0)):
    c = run('root.create_entity', f, ifc_class='IfcColumn', name=f'Column{k}')
    prof = f.create_entity('IfcCircleProfileDef', ProfileType='AREA', Radius=0.3)
    rep = run('geometry.add_profile_representation', f, context=body, profile=prof, depth=2.6)
    run('geometry.assign_representation', f, product=c, representation=rep); place(c, x, -2.2, 0)
    run('spatial.assign_container', f, relating_structure=st, products=[c])
f.write(O + 'ifcopenshell_building.ifc')

# ---------------- PhotoScan のプロジェクト（.psz）: doc.xml + 点群（PLY）+ メッシュ（PLY）
def ply_bytes(Pt, C, faces=None):
    h = f"ply\nformat binary_little_endian 1.0\nelement vertex {len(Pt)}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\n"
    if faces is not None: h += f"element face {len(faces)}\nproperty list uchar int vertex_indices\n"
    h += "end_header\n"
    rec = np.zeros(len(Pt), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('r', 'u1'), ('g', 'u1'), ('b', 'u1')])
    rec['x'], rec['y'], rec['z'] = Pt.T; rec['r'], rec['g'], rec['b'] = C.T
    out = h.encode() + rec.tobytes()
    if faces is not None:
        fr = np.zeros(len(faces), dtype=[('n', 'u1'), ('i', '<i4', 3)]); fr['n'] = 3; fr['i'] = faces; out += fr.tobytes()
    return out
doc = '''<?xml version="1.0" encoding="UTF-8"?>
<document version="1.2.0">
  <chunks next_id="1">
    <chunk id="0" label="Chunk 1" enabled="true">
      <sensors next_id="0"/>
      <cameras next_id="0"/>
      <frames next_id="1">
        <frame id="0">
          <point_cloud>
            <points path="point_cloud/points0.ply"/>
          </point_cloud>
          <dense_cloud>
            <points path="dense_cloud/dense_cloud.ply"/>
          </dense_cloud>
          <model>
            <mesh path="model/mesh.ply"/>
          </model>
        </frame>
      </frames>
    </chunk>
  </chunks>
</document>'''
with zipfile.ZipFile(O + 'handmade_project.psz', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('doc.xml', doc)
    z.writestr('point_cloud/points0.ply', ply_bytes(P[::20], RGB[::20]))
    z.writestr('dense_cloud/dense_cloud.ply', ply_bytes(P, RGB))
    z.writestr('model/mesh.ply', ply_bytes(V, VC, F))

# ---------------- 画像（Pillow）: 点群を真上から見た絵
from PIL import Image
W, H = 400, 180
img = np.full((H, W, 3), 20, np.uint8)
x = ((P[:, 0] - P[:, 0].min()) / (P[:, 0].max() - P[:, 0].min()) * (W - 1)).astype(int)
y = ((P[:, 1].max() - P[:, 1]) / (P[:, 1].max() - P[:, 1].min()) * (H - 1)).astype(int)
img[y, x] = RGB
im = Image.fromarray(img)
for ext, kw in [('png', {}), ('jpg', {'quality': 92}), ('bmp', {}), ('gif', {}), ('webp', {'lossless': True}), ('tga', {}), ('ppm', {}), ('ico', {'sizes': [(128, 128)]}), ('icns', {}), ('xbm', {})]:
    im2 = im
    if ext == 'xbm': im2 = im.convert('1')
    if ext in ('ico', 'icns'): im2 = im.resize((128, 128))
    im2.save(O + f'pillow_topview.{ext}', **kw)
im.convert('L').save(O + 'pillow_topview.pgm')
im.convert('1').save(O + 'pillow_topview.pbm')
# CUR（ICO と同じ形で種類が 2）
ico = open(O + 'pillow_topview.ico', 'rb').read(); open(O + 'handmade_topview.cur', 'wb').write(ico[:2] + struct.pack('<H', 2) + ico[4:])
# WBMP（白黒）
bw = np.array(im.convert('1')).astype(np.uint8)
def mb(v):
    out = [v & 127]; v >>= 7
    while v: out.insert(0, (v & 127) | 128); v >>= 7
    return bytes(out)
rows = b''.join(np.packbits(r).tobytes() for r in bw)
open(O + 'handmade_topview.wbmp', 'wb').write(b'\0\0' + mb(W) + mb(H) + rows)
# XPM（16 色に減らして文字で書く）
q = im.quantize(16); pal = q.getpalette()[:48]; arr = np.array(q)
chars = 'abcdefghijklmnop'
lines = [f'"{W} {H} 16 1",'] + [f'"{chars[i]} c #{pal[3*i]:02x}{pal[3*i+1]:02x}{pal[3*i+2]:02x}",' for i in range(16)] + ['"' + ''.join(chars[v] for v in r) + '",' for r in arr]
open(O + 'handmade_topview.xpm', 'w').write('/* XPM */\nstatic char *topview[] = {\n' + '\n'.join(lines).rstrip(',') + '\n};\n')
# SVG（部屋の間取りの線画）
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180" viewBox="0 0 400 180"><rect width="400" height="180" fill="#f4f1ea"/>']
for x0 in range(20, 380, 60): svg.append(f'<rect x="{x0}" y="20" width="50" height="50" fill="#9fc3e8" stroke="#24476b" stroke-width="3"/>')
svg.append('<rect x="10" y="80" width="380" height="24" fill="#d8c9a8"/><circle cx="200" cy="140" r="26" fill="#e07b5f"/><path d="M20 160 L380 120" stroke="#2f7d4f" stroke-width="5"/></svg>')
open(O + 'handmade_floorplan.svg', 'w').write(''.join(svg))

# ---------------- ラスター（GeoTIFF、float32 の高さ。位置情報と「値なし」つき）
import tifffile
gx, gy = np.meshgrid(np.arange(200), np.arange(150))
Z = (12 + 4 * np.sin(gx / 25) * np.cos(gy / 18) + 0.03 * gx).astype(np.float32)
Z[60:70, 90:110] = -9999   # 値なし
tifffile.imwrite(O + 'tifffile_dem.tif', Z, extratags=[
    (33550, 'd', 3, (2.0, 2.0, 0.0), False),                       # ModelPixelScale
    (33922, 'd', 6, (0, 0, 0, 539000.0, 3836300.0, 0), False),      # ModelTiepoint
    (34735, 'H', 16, (1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 32654), False),  # GeoKeyDirectory（UTM 54N）
    (42113, 's', 0, '-9999', False)])                                # GDAL_NODATA
tifffile.imwrite(O + 'tifffile_rgb.tif', np.array(im))
print('ok')
