#!/usr/bin/env python3
# 大きな試験用の点群を作る（少しずつ書くので、メモリは E57 以外ほとんど使わない）
#   python3 gen_big.py --n 10000000 --out DIR --formats pcd_bin,pcd_ascii,las,laz,ply,xyz,e57 [--kind corridor|sparse] [--seed 1]
#   ・corridor: サンプルの廊下の地図（sample/map.json、36 万点）を、少しずらしながら n 点まで増やしたもの（密な屋内の地図）
#   ・sparse  : 15 km × 15 km の地形のような面に n 点（UTM 風の大きな座標。空からの LiDAR を間引いたものに近い）
#   PCD binary_compressed は、pcd_bin を作ってから pcdbc（C の LZF 圧縮）で変換する（gen_all.sh を参照）
import argparse, json, base64, os, sys, time
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--n', type=int, required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--formats', default='pcd_bin')
ap.add_argument('--kind', default='corridor')
ap.add_argument('--seed', type=int, default=1)
ap.add_argument('--chunk', type=int, default=2_000_000)
ap.add_argument('--name', default=None, help='ファイル名の頭（既定: <kind>_<n の百万>M）')
a = ap.parse_args()
N = a.n
fmts = a.formats.split(',')
os.makedirs(a.out, exist_ok=True)
stem = a.name or f"{a.kind}_{N // 1_000_000}M" if N >= 1_000_000 else f"{a.kind}_{N}"
stem = a.name or stem

MAP = '/home/claude/pcd-viewer/sample/map.json'
if a.kind == 'corridor':
    d = json.load(open(MAP))
    n0 = d['n']
    q = np.frombuffer(base64.b64decode(d['b64']), dtype='<u2').reshape(n0, 3).astype(np.float64)
    P0 = q * np.array(d['sc']) + np.array(d['lo'])
    I0 = np.frombuffer(base64.b64decode(d['b64i']), dtype=np.uint8).astype(np.int32)
    z1, z99 = np.percentile(P0[:, 2], [1, 99])
    OFF = np.zeros(3)
elif a.kind == 'sweep':
    # 間引きの偏りを調べる用: 点の順番に x が 0 → 1000 m へ一様に進む（y, z は乱数）。正しい無作為抽出なら、残った点の x は一様
    n0 = 0
    z1, z99 = 0.0, 3.0
    OFF = np.zeros(3)
else:
    n0 = 0
    z1, z99 = 0.0, 60.0
    OFF = np.array([539000.0, 3836000.0, 30.0])

def colors(z, inten):
    t = np.clip((z - z1) / (z99 - z1), 0, 1)
    r = (255 * np.clip(1.5 - np.abs(4 * t - 3), 0, 1)).astype(np.uint8)
    g = (255 * np.clip(1.5 - np.abs(4 * t - 2), 0, 1)).astype(np.uint8)
    b = (255 * np.clip(1.5 - np.abs(4 * t - 1), 0, 1)).astype(np.uint8)
    return r, g, b

def chunks():
    rng = np.random.default_rng(a.seed)
    done = 0
    while done < N:
        m = min(a.chunk, N - done)
        if a.kind == 'corridor':
            idx = rng.integers(0, n0, m)
            P = P0[idx] + rng.normal(0, 0.01, (m, 3))
            I = np.clip(I0[idx] + rng.integers(-3, 4, m), 0, 255)
        elif a.kind == 'sweep':
            x = 1000.0 * (done + np.arange(m)) / N
            P = np.stack([x, rng.uniform(0, 3, m), rng.uniform(0, 3, m)], 1)
            I = rng.integers(0, 256, m)
        else:
            x = rng.uniform(0, 15000, m); y = rng.uniform(0, 15000, m)
            z = 20 * np.sin(x / 900) + 15 * np.cos(y / 700) + rng.normal(0, 0.3, m) + 30
            P = np.stack([x, y, z], 1) + OFF
            I = rng.integers(0, 256, m)
        cls = np.where(P[:, 2] - OFF[2] < z1 + 0.3, 2, np.where(P[:, 2] - OFF[2] > z99 - 0.3, 6, 1)).astype(np.uint8)
        t = 1.7e9 + (done + np.arange(m)) * 1e-5
        yield done, P, I.astype(np.int32), cls, t
        done += m

t0 = time.time()
paths = {f: os.path.join(a.out, stem + {'pcd_bin': '_bin.pcd', 'pcd_ascii': '_ascii.pcd', 'las': '.las', 'laz': '.laz', 'ply': '.ply', 'xyz': '.xyz', 'e57': '.e57'}[f]) for f in fmts}
fh = {}
writers = {}
if 'pcd_bin' in fmts:
    f = open(paths['pcd_bin'], 'wb')
    f.write(f"# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH {N}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {N}\nDATA binary\n".encode())
    fh['pcd_bin'] = f
if 'pcd_ascii' in fmts:
    f = open(paths['pcd_ascii'], 'wb')
    f.write(f"# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH {N}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {N}\nDATA ascii\n".encode())
    fh['pcd_ascii'] = f
if 'ply' in fmts:
    f = open(paths['ply'], 'wb')
    f.write(f"ply\nformat binary_little_endian 1.0\nelement vertex {N}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nproperty float scalar_intensity\nend_header\n".encode())
    fh['ply'] = f
if 'xyz' in fmts:
    fh['xyz'] = open(paths['xyz'], 'wb')
for k in ('las', 'laz'):
    if k in fmts:
        import laspy
        hdr = laspy.LasHeader(point_format=3, version='1.2')
        hdr.scales = np.array([0.001, 0.001, 0.001])
        hdr.offsets = OFF.copy()
        writers[k] = laspy.open(paths[k], mode='w', header=hdr, do_compress=(k == 'laz'))
E = {}
for done, P, I, cls, t in chunks():
    m = len(P)
    r, g, b = colors(P[:, 2] - OFF[2], I)
    if 'pcd_bin' in fh:
        rec = np.empty(m, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('i', '<f4')])
        rec['x'], rec['y'], rec['z'] = (P - OFF).T if a.kind == 'sparse' else P.T
        rec['i'] = I
        rec.tofile(fh['pcd_bin'])
    if 'pcd_ascii' in fh:
        Q = (P - OFF) if a.kind == 'sparse' else P
        np.savetxt(fh['pcd_ascii'], np.column_stack([Q, I]), fmt='%.4f %.4f %.4f %d')
    if 'ply' in fh:
        rec = np.empty(m, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('r', 'u1'), ('g', 'u1'), ('b', 'u1'), ('i', '<f4')])
        Q = (P - OFF) if a.kind == 'sparse' else P
        rec['x'], rec['y'], rec['z'] = Q.T; rec['r'], rec['g'], rec['b'] = r, g, b; rec['i'] = I
        rec.tofile(fh['ply'])
    if 'xyz' in fh:
        np.savetxt(fh['xyz'], np.column_stack([P, r, g, b, I]), fmt='%.4f %.4f %.4f %d %d %d %d')
    for k, w in writers.items():
        import laspy
        pts = laspy.ScaleAwarePointRecord.zeros(m, header=w.header)
        pts.x, pts.y, pts.z = P[:, 0], P[:, 1], P[:, 2]
        pts.intensity = I.astype(np.uint16) * 256
        pts.classification = cls
        pts.return_number = np.ones(m, np.uint8); pts.number_of_returns = np.ones(m, np.uint8)
        pts.point_source_id = np.full(m, 7, np.uint16)
        pts.gps_time = t
        pts.red = r.astype(np.uint16) * 256; pts.green = g.astype(np.uint16) * 256; pts.blue = b.astype(np.uint16) * 256
        w.write_points(pts)
    if 'e57' in fmts:
        for key, v in (('cartesianX', P[:, 0]), ('cartesianY', P[:, 1]), ('cartesianZ', P[:, 2]), ('intensity', I.astype(np.float64)),
                       ('colorRed', r), ('colorGreen', g), ('colorBlue', b)):
            E.setdefault(key, []).append(v)
    print(f'{done + m:,} / {N:,} ({time.time() - t0:.1f}s)', file=sys.stderr, flush=True)
for f in fh.values(): f.close()
for w in writers.values(): w.close()
if 'e57' in fmts:
    import pye57
    data = {k: np.concatenate(v) for k, v in E.items()}
    del E
    e = pye57.E57(paths['e57'], mode='w')
    e.write_scan_raw(data, name='scan0')
    e.close()
for k, p in paths.items():
    print(json.dumps({'fmt': k, 'path': p, 'n': N, 'bytes': os.path.getsize(p), 'sec': round(time.time() - t0, 1)}))
