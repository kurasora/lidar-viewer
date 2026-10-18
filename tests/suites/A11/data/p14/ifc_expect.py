# IFC の正解: ifcopenshell.geom で世界座標（m）の三角形を作り、範囲と面積で重みをつけた重心を出す
import ifcopenshell, ifcopenshell.geom, numpy as np, json, sys
f = ifcopenshell.open(sys.argv[1])
s = ifcopenshell.geom.settings(); s.set(s.USE_WORLD_COORDS, True)
V_all, A_all, C_all = [], [], []
for el in f.by_type('IfcProduct'):
    if not el.Representation: continue
    try: sh = ifcopenshell.geom.create_shape(s, el)
    except Exception as e: continue
    v = np.array(sh.geometry.verts).reshape(-1, 3); t = np.array(sh.geometry.faces).reshape(-1, 3)
    if not len(t): continue
    a, b, c = v[t[:, 0]], v[t[:, 1]], v[t[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    V_all.append(v); A_all.append(area); C_all.append((a + b + c) / 3)
V = np.vstack(V_all); A = np.concatenate(A_all); C = np.vstack(C_all)
print(json.dumps({'min': V.min(0).tolist(), 'max': V.max(0).tolist(), 'centroid': (C * A[:, None]).sum(0).tolist() and ((C * A[:, None]).sum(0) / A.sum()).tolist(), 'area': float(A.sum())}))
