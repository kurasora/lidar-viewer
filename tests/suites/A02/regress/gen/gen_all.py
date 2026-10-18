# すべての試験ファイルと期待値（data/cases.json）を作る: python3 gen_all.py
import common, g_mesh, g_gltf
g_mesh.gen_obj(); g_mesh.gen_stl(); g_mesh.gen_off(); g_mesh.gen_vtk()
g_gltf.gen()
for m in ['g_cad', 'g_wasm', 'g_img', 'g_three', 'g_misc']:
    try:
        mod = __import__(m)
    except ModuleNotFoundError:
        continue
    mod.gen()
import g_misc
g_misc.gen_special()
common.save()
