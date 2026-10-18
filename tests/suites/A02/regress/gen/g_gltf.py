# glTF / GLB の変種
import json, struct, base64, math
import numpy as np
from common import *

BW = ('node', 'browser')
FLOAT, UBYTE, BYTE, USHORT, SHORT, UINT = 5126, 5121, 5120, 5123, 5122, 5125
DT = {FLOAT: '<f4', UBYTE: 'u1', BYTE: 'i1', USHORT: '<u2', SHORT: '<i2', UINT: '<u4'}


class G:
    def __init__(self):
        self.j = {'asset': {'version': '2.0', 'generator': 'A02 test'}, 'buffers': [], 'bufferViews': [], 'accessors': [], 'meshes': [], 'nodes': [], 'scenes': [{'nodes': []}], 'scene': 0}
        self.bin = bytearray()

    def view(self, data, stride=None, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        bv = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if stride: bv['byteStride'] = stride
        if target: bv['target'] = target
        self.bin += data
        self.j['bufferViews'].append(bv)
        return len(self.j['bufferViews']) - 1

    def acc(self, arr, ctype, typ, normalized=False, view=None, byteOffset=0, count=None, minmax=True):
        arr = np.asarray(arr)
        if view is None: view = self.view(arr.astype(DT[ctype]).tobytes())
        a = {'bufferView': view, 'componentType': ctype, 'count': int(count if count is not None else len(arr)), 'type': typ}
        if byteOffset: a['byteOffset'] = byteOffset
        if normalized: a['normalized'] = True
        if minmax and typ == 'VEC3' and arr.ndim == 2:
            a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def prim(self, V, T=None, C=None, mode=None, material=None, ctype_c=FLOAT, idx_type=UINT):
        p = {'attributes': {'POSITION': self.acc(np.asarray(V, float), FLOAT, 'VEC3')}}
        if T is not None: p['indices'] = self.acc(np.asarray(T).ravel(), idx_type, 'SCALAR')
        if C is not None:
            C = np.asarray(C)
            if ctype_c == FLOAT: p['attributes']['COLOR_0'] = self.acc(C / 255.0, FLOAT, 'VEC3' if C.shape[1] == 3 else 'VEC4')
            elif ctype_c == UBYTE: p['attributes']['COLOR_0'] = self.acc(C, UBYTE, 'VEC3' if C.shape[1] == 3 else 'VEC4', normalized=True)
            elif ctype_c == USHORT: p['attributes']['COLOR_0'] = self.acc(np.round(C / 255.0 * 65535), USHORT, 'VEC3' if C.shape[1] == 3 else 'VEC4', normalized=True)
        if mode is not None: p['mode'] = mode
        if material is not None: p['material'] = material
        return p

    def mesh(self, prims):
        self.j['meshes'].append({'primitives': prims})
        return len(self.j['meshes']) - 1

    def node(self, **kw):
        self.j['nodes'].append(kw)
        return len(self.j['nodes']) - 1

    def write(self, fn, mode='embedded', binname=None, binuri=None):
        j = json.loads(json.dumps(self.j))
        while len(self.bin) % 4: self.bin.append(0)
        if mode == 'embedded':
            j['buffers'] = [{'byteLength': len(self.bin), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(bytes(self.bin)).decode()}]
            open(path(fn), 'w').write(json.dumps(j))
        elif mode == 'external':
            j['buffers'] = [{'byteLength': len(self.bin), 'uri': binuri or binname}]
            open(path(fn), 'w').write(json.dumps(j))
            open(path(os.path.join(os.path.dirname(fn), binname)), 'wb').write(bytes(self.bin))
        elif mode == 'glb':
            j['buffers'] = [{'byteLength': len(self.bin)}]
            js = json.dumps(j).encode()
            while len(js) % 4: js += b' '
            body = struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin)
            open(path(fn), 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)


def tf_apply(M, V):
    V = np.asarray(V, float)
    return (np.hstack([V, np.ones((len(V), 1))]) @ M.T)[:, :3]


def trs(t=(0, 0, 0), r=(0, 0, 0, 1), s=(1, 1, 1)):
    x, y, z, w = r
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(s)[None, :]; M[:3, 3] = t
    return M


def gen():
    P = two_boxes()
    V, T, C, pid = merge(P)
    e_col = mesh_expect(P, extra={'rgb': True})
    # 1 埋め込み（data URI）・2 外部 .bin・3 GLB
    for mode, fn in [('embedded', 'gltf/embedded.gltf'), ('glb', 'gltf/basic.glb')]:
        g = G(); m = g.mesh([g.prim(V, T, C)]); g.j['scenes'][0]['nodes'].append(g.node(mesh=m)); g.write(fn, mode)
    case('gltf_embedded', ['gltf/embedded.gltf'], e_col, BW, 'data URI に埋め込んだ buffer')
    case('glb_basic', ['gltf/basic.glb'], e_col, BW, 'GLB')
    g = G(); m = g.mesh([g.prim(V, T, C)]); g.j['scenes'][0]['nodes'].append(g.node(mesh=m)); g.write('gltf/ext/model.gltf', 'external', 'model.bin')
    case('gltf_external', ['gltf/ext/model.gltf', 'gltf/ext/model.bin'], e_col, BW, '.gltf + 外部 .bin を一緒に選ぶ')
    case('gltf_external_drop', ['gltf/ext/model.gltf', 'gltf/ext/model.bin'], e_col, ('browser',), '.gltf + .bin をドラッグ＆ドロップ', drop=True)
    case('gltf_external_nobin', ['gltf/ext/model.gltf'], {'error': 'model\\.bin.*一緒に選んで', 'nfiles': 0}, BW, '.gltf だけ（.bin を選ばない）→ 分かる知らせ')
    g = G(); m = g.mesh([g.prim(V, T, C)]); g.j['scenes'][0]['nodes'].append(g.node(mesh=m)); g.write('gltf/ext2/scene.gltf', 'external', 'my model.bin', binuri='buffers/my%20model.bin')
    case('gltf_external_uri', ['gltf/ext2/scene.gltf', 'gltf/ext2/my model.bin'], e_col, BW, 'uri がフォルダつき・%20 入り（buffers/my%20model.bin）')
    # 4 ノードの階層と変換（TRS・matrix・同じメッシュを 3 回）
    a = box(0, 0, 0, 1, 1, 1)
    g = G(); m = g.mesh([g.prim(a[0], a[1], np.tile([255, 0, 0], (8, 1)))])
    q = (0, 0, math.sin(math.pi / 4), math.cos(math.pi / 4))  # Z まわり 90°
    Mroot = trs((10, 0, 0), q)
    Mchild = trs((0, 5, 0), (0, 0, 0, 1), (2, 2, 2))
    Mmat = trs((0, 0, 7), (math.sin(math.pi / 8), 0, 0, math.cos(math.pi / 8)), (1, 3, 1))  # X まわり 45°・Y を 3 倍
    child = g.node(mesh=m, translation=[0, 5, 0], scale=[2, 2, 2])
    root = g.node(translation=[10, 0, 0], rotation=list(q), children=[child], mesh=m)
    mnode = g.node(matrix=Mmat.T.ravel().tolist(), mesh=m)
    g.j['scenes'][0]['nodes'] += [root, mnode]
    g.write('gltf/nodes.gltf')
    inst = [tf_apply(Mroot, a[0]), tf_apply(Mroot @ Mchild, a[0]), tf_apply(Mmat, a[0])]
    e = mesh_expect([(v, a[1], [255, 0, 0], f'i{k}') for k, v in enumerate(inst)], extra={'rgb': True})
    case('gltf_nodes', ['gltf/nodes.gltf'], e, BW, 'ノードの階層（TRS・matrix・同じメッシュを 3 回使う）')
    # 5 シーンが 2 つ（scene: 1）
    b = box(10, 0, 0, 11, 1, 1)
    g = G(); m0 = g.mesh([g.prim(a[0], a[1])]); m1 = g.mesh([g.prim(b[0], b[1])])
    n0 = g.node(mesh=m0); n1 = g.node(mesh=m1)
    g.j['scenes'] = [{'nodes': [n0]}, {'nodes': [n1]}]; g.j['scene'] = 1
    g.write('gltf/scenes.gltf')
    case('gltf_scene1', ['gltf/scenes.gltf'], mesh_expect([(b[0], b[1], None, 'B')], extra={'rgb': False}), BW, 'シーンが 2 つで scene=1')
    # 6 scenes がない（ノードの親子あり）
    g = G(); m0 = g.mesh([g.prim(a[0], a[1])])
    c = g.node(mesh=m0); p = g.node(translation=[10, 0, 0], children=[c])
    del g.j['scenes']; del g.j['scene']
    g.write('gltf/noscenes.gltf')
    case('gltf_noscenes', ['gltf/noscenes.gltf'], mesh_expect([(a[0] + [10, 0, 0], a[1], None, 'B')], extra={'rgb': False}), BW, 'scenes のない glTF（子ノードを 2 回描かないこと）')
    # 7 量子化（KHR_mesh_quantization）: SHORT 正規化 + ノードの拡大、BYTE（正規化なし）+ 拡大
    g = G(); g.j['extensionsUsed'] = ['KHR_mesh_quantization']; g.j['extensionsRequired'] = ['KHR_mesh_quantization']
    qa = np.round(a[0] * 32767).astype(int)  # 正規化 SHORT（0..1）→ ノードの拡大 2 倍で 0..2
    pa = {'attributes': {'POSITION': g.acc(qa, SHORT, 'VEC3', normalized=True)}, 'indices': g.acc(a[1].ravel(), UBYTE, 'SCALAR')}
    VB = box(3, 0, 0, 5, 2, 1)[0]
    qb = np.round(VB * 10).astype(int)  # 1/10 m 単位の整数（BYTE、正規化なし）
    pb = {'attributes': {'POSITION': g.acc(qb, BYTE, 'VEC3')}, 'indices': g.acc(a[1].ravel(), USHORT, 'SCALAR')}
    ma = g.mesh([pa]); mb = g.mesh([pb])
    g.j['scenes'][0]['nodes'] += [g.node(mesh=ma, scale=[2, 2, 2]), g.node(mesh=mb, scale=[0.1, 0.1, 0.1])]
    g.write('gltf/quant.gltf')
    case('gltf_quant', ['gltf/quant.gltf'], mesh_expect([(a[0] * 2, a[1], None, 'A'), (VB, a[1], None, 'B')], extra={'rgb': False}), BW, 'KHR_mesh_quantization（SHORT 正規化・BYTE）')
    # 8 色の型（UNSIGNED_BYTE 正規化 VEC4、UNSIGNED_SHORT 正規化 VEC3）
    g = G()
    ca = np.hstack([np.tile([255, 0, 0], (8, 1)), np.full((8, 1), 255)])
    p1 = g.prim(P[0][0], P[0][1], ca, ctype_c=UBYTE)
    p2 = g.prim(P[1][0], P[1][1], np.tile([0, 0, 255], (8, 1)), ctype_c=USHORT)
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([p1, p2])))
    g.write('gltf/colors_norm.glb', 'glb')
    case('gltf_colors_norm', ['gltf/colors_norm.glb'], e_col, BW, 'COLOR_0 が UNSIGNED_BYTE（VEC4）・UNSIGNED_SHORT の正規化')
    # 9 sparse（bufferView の上に一部を差し替え）
    g = G()
    base = g.acc(a[0], FLOAT, 'VEC3')
    acc = g.j['accessors'][base]
    idx = np.arange(8, dtype='<u4'); vals = (a[0] + [20, 0, 0]).astype('<f4')
    acc['sparse'] = {'count': 8, 'indices': {'bufferView': g.view(idx.tobytes()), 'componentType': UINT}, 'values': {'bufferView': g.view(vals.tobytes())}}
    acc['min'] = [20, 0, 0]; acc['max'] = [21, 1, 1]
    prm = {'attributes': {'POSITION': base}, 'indices': g.acc(a[1].ravel(), UINT, 'SCALAR')}
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([prm])))
    g.write('gltf/sparse.gltf')
    case('gltf_sparse', ['gltf/sparse.gltf'], mesh_expect([(a[0] + [20, 0, 0], a[1], None, 'S')], extra={'rgb': False}), BW, 'sparse accessor（bufferView の値を差し替え）')
    g = G()
    g.j['accessors'].append({'componentType': FLOAT, 'count': 8, 'type': 'VEC3', 'min': [20, 0, 0], 'max': [21, 1, 1],
                             'sparse': {'count': 8, 'indices': {'bufferView': g.view(idx.tobytes()), 'componentType': UINT}, 'values': {'bufferView': g.view(vals.tobytes())}}})
    prm = {'attributes': {'POSITION': 0}, 'indices': g.acc(a[1].ravel(), UINT, 'SCALAR')}
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([prm])))
    g.write('gltf/sparse_nobv.gltf')
    case('gltf_sparse_nobv', ['gltf/sparse_nobv.gltf'], mesh_expect([(a[0] + [20, 0, 0], a[1], None, 'S')], extra={'rgb': False}), BW, 'bufferView のない sparse accessor')
    # 10 線: LINES（離れた 2 本）・LINE_STRIP・LINE_LOOP
    g = G()
    LV = np.array([[0, 0, 0], [1, 0, 0], [10, 10, 0], [11, 10, 0]], float)
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([g.prim(LV, mode=1)])))
    g.write('gltf/lines.gltf')
    e = {'n': [290000, 300010], 'parts': [{'name': 'seg1', 'box': [-1e-6, -1e-6, -1e-6, 1 + 1e-6, 1e-6, 1e-6]}, {'name': 'seg2', 'box': [10 - 1e-6, 10 - 1e-6, -1e-6, 11 + 1e-6, 10 + 1e-6, 1e-6]}], 'strayMax': 0.0}
    case('gltf_lines', ['gltf/lines.gltf'], e, BW, 'mode 1（LINES）: 離れた 2 本の線分（間をつながないこと）')
    g = G()
    SV = np.array([[0, 0, 0], [5, 0, 0], [5, 5, 0]], float)
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([g.prim(SV, mode=3), g.prim(SV + [0, 0, 3], mode=2)])))
    g.write('gltf/linestrip.gltf')
    e = {'n': [290000, 300010], 'bbox': [[0, 0, 0], [5, 5, 3]], 'parts': [
        {'name': 'strip', 'box': [-1e-6, -1e-6, -1e-6, 5 + 1e-6, 5 + 1e-6, 1e-6]},
        {'name': 'loop_closing', 'box': [-1e-6, -1e-6, 3 - 1e-6, 5 + 1e-6, 5 + 1e-6, 3 + 1e-6]}], 'strayMax': 0.0}
    case('gltf_linestrip', ['gltf/linestrip.gltf'], e, BW, 'mode 3（LINE_STRIP）と mode 2（LINE_LOOP）')
    # 11 三角形の帯と扇（mode 5 / 6）
    g = G()
    qv = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], float)  # 帯 0-1-2, 1-2-3 → 正方形
    hexV = np.array([[4, 1, 0]] + [[4 + math.cos(k * math.pi / 3), 1 + math.sin(k * math.pi / 3), 0] for k in range(7)])
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([g.prim(qv, mode=5), g.prim(hexV, mode=6)])))
    g.write('gltf/stripfan.gltf')
    hexT = np.array([[0, k, k + 1] for k in range(1, 7)])
    e = mesh_expect([(qv, np.array([[0, 1, 2], [1, 3, 2]]), None, 'strip'), (hexV, hexT, None, 'fan')], extra={'rgb': False})
    case('gltf_stripfan', ['gltf/stripfan.gltf'], e, BW, 'mode 5（TRIANGLE_STRIP）と mode 6（TRIANGLE_FAN）')
    # 12 点（mode 0）
    g = G(); rng = np.random.default_rng(2); Q = rng.uniform(0, 5, (1000, 3))
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([g.prim(Q, mode=0, C=np.tile([0, 255, 0], (1000, 1)))])))
    g.write('gltf/points.glb', 'glb')
    case('gltf_points', ['gltf/points.glb'], {'n': [1000, 1000], 'bbox': [Q.min(0).tolist(), Q.max(0).tolist()], 'tol': 1e-4, 'rgb': True, 'color': [0, 255, 0], 'note': r'^(?!.*面の上に点を散らして).*$'}, BW, 'mode 0（POINTS）の点群（注記が「面の上に…」にならないこと）')
    # 13 材質の色（baseColorFactor）と材質なし
    g = G(); g.j['materials'] = [{'pbrMetallicRoughness': {'baseColorFactor': [1, 0, 0, 1]}}]
    p1 = g.prim(P[0][0], P[0][1], material=0); p2 = g.prim(P[1][0], P[1][1])
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([p1, p2])))
    g.write('gltf/material.gltf')
    case('gltf_material', ['gltf/material.gltf'], mesh_expect(P, color_override=[[255, 0, 0], [204, 204, 204]], extra={'rgb': True}), BW, 'baseColorFactor の色と材質なし')
    # 14 テクスチャ（baseColorTexture。2×1 画素: 左 赤、右 青）
    from PIL import Image
    import io
    im = Image.new('RGB', (2, 1)); im.putpixel((0, 0), (255, 0, 0)); im.putpixel((1, 0), (0, 0, 255))
    bio = io.BytesIO(); im.save(bio, 'PNG')
    g = G()
    g.j['images'] = [{'uri': 'data:image/png;base64,' + base64.b64encode(bio.getvalue()).decode()}]
    g.j['textures'] = [{'source': 0}]
    g.j['materials'] = [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}]
    uvA = np.tile([0.25, 0.5], (8, 1)); uvB = np.tile([0.75, 0.5], (8, 1))
    prms = []
    for (Vp, Tp, c, n), uv in [(P[0], uvA), (P[1], uvB)]:
        pr = g.prim(Vp, Tp, material=0); pr['attributes']['TEXCOORD_0'] = g.acc(uv, FLOAT, 'VEC2'); prms.append(pr)
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh(prms)))
    g.write('gltf/texture.gltf')
    case('gltf_texture', ['gltf/texture.gltf'], mesh_expect(P, extra={'rgb': True}), BW, 'baseColorTexture の色')
    # 15 1 つの bufferView に位置と色を交互に（byteStride 24）
    g = G()
    inter = np.hstack([V, C / 255.0]).astype('<f4')
    bv = g.view(inter.tobytes(), stride=24)
    pa = g.j['accessors'].append({'bufferView': bv, 'componentType': FLOAT, 'count': len(V), 'type': 'VEC3', 'min': V.min(0).tolist(), 'max': V.max(0).tolist()})
    g.j['accessors'].append({'bufferView': bv, 'byteOffset': 12, 'componentType': FLOAT, 'count': len(V), 'type': 'VEC3'})
    prm = {'attributes': {'POSITION': 0, 'COLOR_0': 1}, 'indices': g.acc(T.ravel(), USHORT, 'SCALAR')}
    g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([prm])))
    g.write('gltf/interleaved.glb', 'glb')
    case('gltf_interleaved', ['gltf/interleaved.glb'], e_col, BW, '位置と色を交互に（byteStride・byteOffset）')
    # 16 大きな座標（ノードの移動）
    g = G(); m = g.mesh([g.prim(V, T, C)])
    g.j['scenes'][0]['nodes'].append(g.node(mesh=m, translation=[539000.0, 3836000.0, 30.0]))
    g.write('gltf/big.glb', 'glb')
    off = np.array([539000.0, 3836000.0, 30.0])
    e = mesh_expect([(v + off, t, c, n) for v, t, c, n in P], extra={'rgb': True, 'offset': [539000, 3836000, 0]}); e['tol'] = 2e-3
    case('gltf_big', ['gltf/big.glb'], e, BW, '大きな座標（ノードの translation）')
    # 17 Draco 圧縮（KHR_draco_mesh_compression を必須に）
    import DracoPy
    d = DracoPy.encode(V.astype(np.float32), faces=T.astype(np.uint32), quantization_bits=16)
    g = G(); g.j['extensionsUsed'] = ['KHR_draco_mesh_compression']; g.j['extensionsRequired'] = ['KHR_draco_mesh_compression']
    bv = g.view(d)
    g.j['accessors'] += [{'componentType': FLOAT, 'count': len(V), 'type': 'VEC3', 'min': V.min(0).tolist(), 'max': V.max(0).tolist()}, {'componentType': UINT, 'count': T.size, 'type': 'SCALAR'}]
    g.j['meshes'].append({'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1, 'extensions': {'KHR_draco_mesh_compression': {'bufferView': bv, 'attributes': {'POSITION': 0}}}}]})
    g.j['scenes'][0]['nodes'].append(g.node(mesh=0))
    g.write('gltf/draco.glb', 'glb')
    case('gltf_draco', ['gltf/draco.glb'], {**mesh_expect([(v, t, None, n) for v, t, c, n in P], extra={'rgb': False}), 'tol': 1e-3}, BW, 'KHR_draco_mesh_compression（Draco の展開器は入っている）')
    # 18 GPU インスタンス（EXT_mesh_gpu_instancing を必須に）: 3 個
    g = G(); g.j['extensionsUsed'] = ['EXT_mesh_gpu_instancing']; g.j['extensionsRequired'] = ['EXT_mesh_gpu_instancing']
    m = g.mesh([g.prim(a[0], a[1])])
    tr = np.array([[0, 0, 0], [5, 0, 0], [10, 0, 0]], float)
    g.j['scenes'][0]['nodes'].append(g.node(mesh=m, extensions={'EXT_mesh_gpu_instancing': {'attributes': {'TRANSLATION': g.acc(tr, FLOAT, 'VEC3')}}}))
    g.write('gltf/instancing.gltf')
    case('gltf_instancing', ['gltf/instancing.gltf'], mesh_expect([(a[0] + t, a[1], None, f'i{k}') for k, t in enumerate(tr)], extra={'rgb': False}), BW, 'EXT_mesh_gpu_instancing（必須）: 3 個並ぶ／対応しないなら知らせ')
    # 19 線形の頂点色 0.5（glTF の色は線形。sRGB で表示すると 188 になる）
    g = G(); g.j['scenes'][0]['nodes'].append(g.node(mesh=g.mesh([g.prim(a[0], a[1], np.full((8, 3), 127.5))])))
    g.write('gltf/linear_color.gltf')
    case('gltf_linear_color', ['gltf/linear_color.gltf'], mesh_expect([(a[0], a[1], [188, 188, 188], 'A')], extra={'rgb': True}), BW, '（情報）線形の頂点色 0.5 の表示値')


if __name__ == '__main__':
    gen()
    save()
