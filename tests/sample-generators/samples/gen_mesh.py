# メッシュのサンプルの元: 廊下と部屋の壁・柱・球（部品ごとに色）
import trimesh, numpy as np
parts = []
def add(m, color):
    m.visual.vertex_colors = np.tile(np.array(color + [255], np.uint8), (len(m.vertices), 1)); parts.append(m)
add(trimesh.creation.box([40, 12, 0.2], trimesh.transformations.translation_matrix([20, 0, -0.1])), [150, 150, 150])   # 床
for y in (-3, 3):
    add(trimesh.creation.box([40, 0.2, 2.6], trimesh.transformations.translation_matrix([20, y, 1.3])), [220, 210, 190])  # 廊下の壁
for x in range(4, 40, 8):
    add(trimesh.creation.box([0.9, 0.25, 2.1], trimesh.transformations.translation_matrix([x, 3, 1.05])), [90, 120, 200])  # ドア
for x in (10, 30):
    c = trimesh.creation.cylinder(radius=0.3, height=2.6, sections=24); c.apply_translation([x, -2.2, 1.3]); add(c, [200, 80, 60])  # 柱
s = trimesh.creation.icosphere(subdivisions=3, radius=0.8); s.apply_translation([20, 0, 0.8]); add(s, [60, 180, 90])
m = trimesh.util.concatenate(parts)
m.export('src/mesh.ply')                         # 元（PLY、頂点色付き）
O = 'out/'
m.export(O + 'trimesh_mesh.glb')
m.export(O + 'trimesh_mesh.gltf', embed_buffers=True) if False else None
import json
g = trimesh.exchange.gltf.export_gltf(m, embed_buffers=True)
open(O + 'trimesh_mesh.gltf', 'wb').write(g['model.gltf'])
m.export(O + 'trimesh_mesh.dae')
np.save('src/mesh_V.npy', m.vertices); np.save('src/mesh_F.npy', m.faces); np.save('src/mesh_C.npy', m.visual.vertex_colors[:, :3])
print(len(m.vertices), len(m.faces), m.bounds.tolist())
