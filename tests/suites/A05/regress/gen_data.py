#!/usr/bin/env python3
# A05 の試験用ファイルを作る: python3 gen_data.py <出力フォルダ>
#  ・廊下（幅 2.0 m・天井 2.6 m・長さ 30 m）の合成点群を、欄の組み合わせごとに PCD で書く（傾き 3°・向き 20°・高さ +1.2 m）
#  ・前回の廊下の地図（sample/map.json）を PCD（x y z intensity）に直したもの（FAST-LIO の地図の代わり）
#  ・軌跡: 文字（t x y z）、TUM、CSV（見出しつき）、MCAP（無圧縮・Odometry）、MCAP（圧縮チャンク）
#  ・LAS 3 つ（RGB あり/なし、分類の組み合わせが違う）
#  ・軌跡と誤判定されそうな点群（timestamp 列・CloudCompare の Original cloud index・名前に pose）
#  ・誤りの流れ用（壊れた PCD・空・知らない拡張子・RIEGL）
import sys, os, json, base64, struct, math
import numpy as np

out = sys.argv[1] if len(sys.argv) > 1 else 'data'
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(5)

def corridor(n=200000, L=30.0, W=2.0, H=2.6, noise=0.004):
    # 面積に比例して床・天井・左右の壁に点を置く
    areas = np.array([L * W, L * W, L * H, L * H])
    k = rng.choice(4, size=n, p=areas / areas.sum())
    x = rng.uniform(0, L, n); u = rng.uniform(-W / 2, W / 2, n); v = rng.uniform(0, H, n)
    P = np.zeros((n, 3))
    P[:, 0] = x
    P[k == 0, 1] = u[k == 0]; P[k == 0, 2] = 0
    P[k == 1, 1] = u[k == 1]; P[k == 1, 2] = H
    P[k == 2, 1] = -W / 2; P[k == 2, 2] = v[k == 2]
    P[k == 3, 1] = W / 2; P[k == 3, 2] = v[k == 3]
    P += rng.normal(0, noise, P.shape)
    inten = np.where(k == 0, 40, np.where(k == 1, 90, 140)) + rng.integers(0, 20, n)
    lab = k.astype(np.float32)  # 0 床 1 天井 2 左 3 右
    rgb = np.stack([np.where(k == 0, 200, 60), np.where(k == 1, 200, 120), np.where(k >= 2, 220, 60)], 1).astype(np.uint8)
    return P, inten.astype(np.float32), lab, rgb, k

def tilt(P, tilt_deg=3.0, yaw_deg=20.0, dz=1.2):
    a = math.radians(tilt_deg); b = math.radians(yaw_deg)
    Rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    Rz = np.array([[math.cos(b), -math.sin(b), 0], [math.sin(b), math.cos(b), 0], [0, 0, 1]])
    Q = P @ (Rz @ Rx).T
    Q[:, 2] += dz
    return Q

def write_pcd(path, P, fields=None, rgb=None, binary=True):
    fields = fields or {}
    names = ['x', 'y', 'z'] + (['rgb'] if rgb is not None else []) + list(fields.keys())
    n = len(P)
    cols = [P[:, 0].astype(np.float32), P[:, 1].astype(np.float32), P[:, 2].astype(np.float32)]
    if rgb is not None:
        packed = (rgb[:, 0].astype(np.uint32) << 16) | (rgb[:, 1].astype(np.uint32) << 8) | rgb[:, 2].astype(np.uint32)
        cols.append(packed.view(np.float32))
    for v in fields.values(): cols.append(np.asarray(v, np.float32))
    head = ('# .PCD v0.7\nVERSION 0.7\nFIELDS ' + ' '.join(names) + '\nSIZE ' + ' '.join(['4'] * len(names)) +
            '\nTYPE ' + ' '.join(['F'] * len(names)) + '\nCOUNT ' + ' '.join(['1'] * len(names)) +
            f'\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA {"binary" if binary else "ascii"}\n')
    with open(path, 'wb') as f:
        f.write(head.encode())
        arr = np.stack(cols, 1).astype(np.float32)
        if binary: f.write(arr.tobytes())
        else:
            for row in arr: f.write((' '.join(f'{v:.5f}' for v in row) + '\n').encode())

P, I, LAB, RGB, K = corridor()
Pt = tilt(P)
write_pcd(f'{out}/c_xyz.pcd', Pt)
write_pcd(f'{out}/c_xyzi.pcd', Pt, {'intensity': I})
write_pcd(f'{out}/c_rgb.pcd', Pt, rgb=RGB)
write_pcd(f'{out}/c_rgbi.pcd', Pt, {'intensity': I}, rgb=RGB)
write_pcd(f'{out}/c_label.pcd', Pt, {'label': LAB})
write_pcd(f'{out}/c_level.pcd', P, {'intensity': I})          # はじめから水平（傾きなし）
# 小さい物（平面が少なく、水平補正が失敗する）
small = rng.normal(0, 0.05, (3000, 3)); write_pcd(f'{out}/small_blob.pcd', small, {'intensity': np.full(3000, 10, np.float32)})
# 軌跡（合成の廊下の中央を進む。地図と同じ傾きをかける）
T = 600
tt = 1791886716.0 + np.arange(T) * 0.1
path = np.stack([np.linspace(0.5, 29.5, T), 0.1 * np.sin(np.linspace(0, 6, T)), np.full(T, 0.45)], 1)
path_t = tilt(path)
with open(f'{out}/c_trajectory.txt', 'w') as f:
    f.write('# t x y z\n')
    for t, p in zip(tt, path_t): f.write(f'{t:.3f} {p[0]:.4f} {p[1]:.4f} {p[2]:.4f}\n')
with open(f'{out}/c_traj.tum', 'w') as f:
    for t, p in zip(tt, path_t): f.write(f'{t:.6f} {p[0]:.4f} {p[1]:.4f} {p[2]:.4f} 0 0 0 1\n')
with open(f'{out}/c_traj_header.csv', 'w') as f:
    f.write('timestamp,x,y,z,qx,qy,qz,qw\n')
    for t, p in zip(tt, path_t): f.write(f'{t:.6f},{p[0]:.4f},{p[1]:.4f},{p[2]:.4f},0,0,0,1\n')

def mcap(path, poses, compressed=False):
    def rec(op, body): return struct.pack('<BQ', op, len(body)) + body
    def s(x): b = x.encode(); return struct.pack('<I', len(b)) + b
    def cdr_odom(t, p):
        sec = int(t); ns = int(round((t - sec) * 1e9))
        b = bytearray(b'\x00\x01\x00\x00')
        b += struct.pack('<iI', sec, ns)
        for st in ('odom', 'base_link'):
            e = st.encode() + b'\x00'
            while (len(b) - 4) % 4: b += b'\x00'
            b += struct.pack('<I', len(e)) + e
        while (len(b) - 4) % 8: b += b'\x00'
        b += struct.pack('<7d', p[0], p[1], p[2], 0, 0, 0, 1)
        b += b'\x00' * (36 * 8)
        return bytes(b)
    body = b''
    body += rec(0x01, s('ros2') + s('A05'))                                       # Header
    body += rec(0x03, struct.pack('<H', 1) + s('nav_msgs/msg/Odometry') + s('ros2msg') + struct.pack('<I', 0))
    body += rec(0x04, struct.pack('<HH', 1, 1) + s('/Odometry') + s('cdr') + struct.pack('<I', 0))
    msgs = b''
    for i, (t, p) in enumerate(poses):
        ns = int(t * 1e9)
        msgs += rec(0x05, struct.pack('<HIQQ', 1, i, ns, ns) + cdr_odom(t, p))
    if compressed:
        fake = b'\x28\xb5\x2f\xfd' + msgs[:64]  # zstd らしい中身（展開はされない）
        body += rec(0x06, struct.pack('<QQQI', 0, 0, len(msgs), 0) + s('zstd') + struct.pack('<Q', len(fake)) + fake)
    else:
        body += msgs
    data = b'\x89MCAP0\r\n' + body + rec(0x02, struct.pack('<QQI', 0, 0, 0)) + b'\x89MCAP0\r\n'
    open(path, 'wb').write(data)
mcap(f'{out}/c_odom.mcap', list(zip(tt, path_t)))
mcap(f'{out}/c_odom_zstd.mcap', list(zip(tt, path_t)), compressed=True)

# 前回の廊下の地図（試作ページと同じ作り方）→ PCD
here = '/home/claude/pcd-viewer/sample/map.json'
d = json.load(open(here))
q = np.frombuffer(base64.b64decode(d['b64']), np.uint16).reshape(-1, 3).astype(np.float64)
inten = np.frombuffer(base64.b64decode(d['b64i']), np.uint8).astype(np.float32)
M = np.array(d['lo']) + q * np.array(d['sc'])
write_pcd(f'{out}/scans.pcd', M, {'intensity': inten})
import shutil
shutil.copy('/home/claude/pcd-viewer/sample/trajectory.txt', f'{out}/trajectory.txt')

# LAS 3 つ（ローカル座標。RGB あり / なし / 分類の違い）
import laspy
def las(path, P, fmt, rgb=None, cls=None, inten=None):
    h = laspy.LasHeader(point_format=fmt, version='1.2')
    h.scales = np.array([0.001, 0.001, 0.001]); h.offsets = np.floor(P.min(0))
    L = laspy.LasData(h)
    L.x, L.y, L.z = P[:, 0], P[:, 1], P[:, 2]
    if inten is not None: L.intensity = inten.astype(np.uint16)
    if cls is not None: L.classification = cls.astype(np.uint8)
    if rgb is not None: L.red, L.green, L.blue = (rgb[:, 0].astype(np.uint16) * 257), (rgb[:, 1].astype(np.uint16) * 257), (rgb[:, 2].astype(np.uint16) * 257)
    L.write(path)
sel = rng.choice(len(Pt), 60000, replace=False)
las(f'{out}/run_a.las', Pt[sel], 3, rgb=RGB[sel], cls=np.where(K[sel] == 0, 2, 6), inten=I[sel])
las(f'{out}/run_b.las', Pt[sel] + [0, 0, 0.05], 1, cls=np.where(K[sel] == 0, 2, 1), inten=I[sel] * 2)
las(f'{out}/run_c.las', Pt[sel] + [0.3, 0, 0], 0, inten=I[sel] // 2)

# 軌跡と誤判定されそうな点群
sub = Pt[:5000]
with open(f'{out}/scan_with_time.csv', 'w') as f:
    f.write('x,y,z,intensity,timestamp\n')
    for i, p in enumerate(sub): f.write(f'{p[0]:.4f},{p[1]:.4f},{p[2]:.4f},{I[i]:.0f},{1791886716 + i * 1e-5:.6f}\n')
with open(f'{out}/cc_export_merged.txt', 'w') as f:
    f.write('//X,Y,Z,R,G,B,Original cloud index\n')
    for i, p in enumerate(sub): f.write(f'{p[0]:.4f},{p[1]:.4f},{p[2]:.4f},{RGB[i,0]},{RGB[i,1]},{RGB[i,2]},{i % 2}\n')
with open(f'{out}/proposed_layout.txt', 'w') as f:
    for p in sub: f.write(f'{p[0]:.4f} {p[1]:.4f} {p[2]:.4f}\n')
with open(f'{out}/plain_xyz.txt', 'w') as f:
    for p in sub: f.write(f'{p[0]:.4f} {p[1]:.4f} {p[2]:.4f}\n')

# 誤りの流れ
src = open(f'{out}/c_xyzi.pcd', 'rb').read()
open(f'{out}/broken_trunc.pcd', 'wb').write(src[:2000])
open(f'{out}/broken_header.pcd', 'wb').write(b'# .PCD v0.7\nVERSION 0.7\nFIELDS x y\nPOINTS 3\nDATA ascii\n1 2\n')
open(f'{out}/empty.pcd', 'wb').write(b'')
open(f'{out}/unknown.xyzw', 'wb').write(b'1 2 3\n')
open(f'{out}/scan.rdbx', 'wb').write(b'RIEGL fake')
open(f'{out}/garbage.las', 'wb').write(os.urandom(4096))
print('ok', sorted(os.listdir(out)))

# 分類の値が飛んでいる平らな点群（4 つの区画、label = 0, 1, 100, 150）: 凡例の色と描いた色が合うかを見る
pts, labs = [], []
for j, (cx, lab) in enumerate([(0, 0), (6, 1), (12, 100), (18, 150)]):
    q = np.stack([rng.uniform(cx, cx + 4, 20000), rng.uniform(0, 4, 20000), np.zeros(20000)], 1)
    pts.append(q); labs.append(np.full(20000, lab, np.float32))
write_pcd(f'{out}/cat_sparse.pcd', np.concatenate(pts), {'label': np.concatenate(labs)})
# 同じ区画で label = 0, 1, 2, 3（連続）
write_pcd(f'{out}/cat_dense.pcd', np.concatenate(pts), {'label': np.concatenate([np.full(20000, k, np.float32) for k in range(4)])})
print('ok cat')
