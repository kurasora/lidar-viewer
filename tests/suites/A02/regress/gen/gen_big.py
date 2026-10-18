# 性能の試験用の大きめのファイル（data/big/ に作る。使い終わったら消す）: python3 gen_big.py [stl obj dxf ppm png fbx]
import sys, os, struct, zlib
import numpy as np
from common import path

which = sys.argv[1:] or ['stl', 'obj', 'dxf', 'ppm', 'png', 'fbx']


def grid_mesh(n):
    """n×n の格子（波打つ地形）: 頂点 n²、三角形 2(n-1)²"""
    x, y = np.meshgrid(np.linspace(0, 100, n), np.linspace(0, 100, n))
    z = np.sin(x / 7) * np.cos(y / 5) * 3
    V = np.stack([x.ravel(), y.ravel(), z.ravel()], 1)
    i = np.arange(n * n).reshape(n, n)
    a, b, c, d = i[:-1, :-1].ravel(), i[:-1, 1:].ravel(), i[1:, :-1].ravel(), i[1:, 1:].ravel()
    T = np.concatenate([np.stack([a, b, d], 1), np.stack([a, d, c], 1)])
    return V, T


if 'stl' in which:  # 約 200 万三角形（100 MB）
    V, T = grid_mesh(1001)
    rec = np.zeros(len(T), dtype=[('n', '<f4', 3), ('v', '<f4', 9), ('a', '<u2')])
    rec['v'] = V[T].reshape(-1, 9)
    with open(path('big/grid_2m.stl'), 'wb') as f:
        f.write(b'big'.ljust(80, b'\0') + struct.pack('<I', len(T)) + rec.tobytes())
    print('stl', len(T))
if 'obj' in which:  # 頂点 100 万・三角形 200 万
    V, T = grid_mesh(1001)
    with open(path('big/grid_2m.obj'), 'w') as f:
        np.savetxt(f, V, fmt='v %.4f %.4f %.4f')
        np.savetxt(f, T + 1, fmt='f %d %d %d')
    print('obj', len(V), len(T))
if 'dxf' in which:  # 3DFACE 20 万個
    V, T = grid_mesh(317)
    with open(path('big/faces_200k.dxf'), 'w') as f:
        f.write('0\nSECTION\n2\nENTITIES\n')
        for t in T:
            a, b, c = V[t]
            f.write('0\n3DFACE\n8\n0\n' + ''.join(f'{10 + k}\n{p[0]:.4f}\n{20 + k}\n{p[1]:.4f}\n{30 + k}\n{p[2]:.4f}\n' for k, p in enumerate((a, b, c, c))))
        f.write('0\nENDSEC\n0\nEOF\n')
    print('dxf', len(T))
if 'ppm' in which:  # 6000×4000（7,200 万バイト）
    a = (np.random.default_rng(1).integers(0, 255, (4000, 6000, 3))).astype(np.uint8)
    with open(path('big/big.ppm'), 'wb') as f:
        f.write(b'P6\n6000 4000\n255\n'); f.write(a.tobytes())
    print('ppm')
if 'png' in which:  # 8000×8000（6,400 万画素）
    from PIL import Image
    x = np.linspace(0, 255, 8000).astype(np.uint8)
    a = np.dstack([np.tile(x, (8000, 1)), np.tile(x[:, None], (1, 8000)), np.full((8000, 8000), 128, np.uint8)])
    Image.fromarray(a).save(path('big/big_8k.png'), compress_level=1)
    print('png')
if 'fbx' in which:  # 文字の FBX、三角形 50 万
    sys.path.insert(0, os.path.dirname(__file__))
    import g_three
    V, T = grid_mesh(501)
    g = [{'id': 1000, 'name': 'grid', 'V': V, 'pvi': g_three.pvi_of(T), 'C': None}]
    m = [{'id': 2000, 'name': 'grid'}]
    open(path('big/grid_500k.fbx'), 'w').write(g_three.fbx_ascii(g, m, [], [(1000, 2000), (2000, 0)]))
    print('fbx', len(T))
if 'bomb' in which:  # 解凍爆弾: 小さな .psz / .svgz が展開すると数百 MB になる
    import zipfile, gzip
    N = 600 * 1024 * 1024
    with zipfile.ZipFile(path('big/bomb.psz'), 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr('doc.xml', '<document><chunks><chunk><frames><frame><dense_cloud><points path="dense.ply"/></dense_cloud></frame></frames></chunk></chunks></document>')
        with z.open('dense.ply', 'w', force_zip64=True) as w:
            w.write(b'ply\nformat binary_little_endian 1.0\nelement vertex %d\nproperty float x\nproperty float y\nproperty float z\nend_header\n' % (N // 12))
            blk = b'\0' * (16 * 1024 * 1024)
            for _ in range(N // len(blk)): w.write(blk)
    svg_head = b'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><!-- '
    with gzip.open(path('big/bomb.svgz'), 'wb', compresslevel=9) as g:
        g.write(svg_head)
        blk = b' ' * (16 * 1024 * 1024)
        for _ in range(N // len(blk)): g.write(blk)
        g.write(b' --><rect width="100" height="100" fill="red"/></svg>')
    print('bomb', os.path.getsize(path('big/bomb.psz')), os.path.getsize(path('big/bomb.svgz')))
