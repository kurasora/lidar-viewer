# 作り物（合成）の廊下の地図と軌跡を作る（実測のデータは使わない）
#   出力: <出力先>/map.json（試作ページに埋め込む形: 量子化した u16 の座標 + u8 の強度）
#         <出力先>/map.laz（LAS 1.2・点の形式 0・座標の目盛り 1 mm・オフセット 0。x の小さい順）
#         <出力先>/trajectory.txt（「# t x y z」の 4 列・空白区切り。時刻は 2000-01-01 起点の作り物、10 Hz）
#   使い方: python3 make_synthetic_corridor.py [出力先（既定: リポジトリの sample/）]
#   必要なもの: numpy（LAZ を書くときだけ laspy と lazrs）。乱数の種は固定なので、何度流しても同じものができる
#
# 作り方の考え: 部屋と L 字の廊下を「箱」の集まりで作り、軌跡に沿って動く LiDAR（MID-360 らしい視野）から
# 光線を飛ばして当たった所を点にする（近い所・よく見た所ほど点が多い＝密度のむら）。距離に雑音、強度は面ごとの反射の強さ。
# 地図の座標は FAST-LIO と同じく「走り始めのセンサーの位置・向き」が原点なので、少し傾き（約 3.4°）と向き（約 -17°）を付ける。
import sys, os, json, base64
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', '..', 'sample')
TARGET_N = 361000          # 点数（実測の地図と同じくらい）
T0 = 946684800.0           # 2000-01-01 00:00:00（UTC）の UNIX 秒。作り物の時刻
rng = np.random.default_rng(20001)

# ---------------------------------------------------------------- 1. 建物（水平な座標。床は z = -0.45、天井は z = 2.15）
FZ, CZ = -0.45, 2.15       # 床と天井の高さ（センサーの高さが 0。天井の高さ 2.6 m）
DOOR_TOP = FZ + 2.1
boxes = []                 # (xmin, ymin, zmin, xmax, ymax, zmax, 反射の強さ)
def box(x0, y0, z0, x1, y1, z1, refl): boxes.append((min(x0, x1), min(y0, y1), min(z0, z1), max(x0, x1), max(y0, y1), max(z0, z1), refl))

FLOOR, CEIL, WALL, DOOR, PILLAR, LIGHT, DESK, SHELF = 20, 34, 44, 16, 55, 118, 28, 26
box(-6, -5, FZ - 0.1, 28, 15, FZ, FLOOR)       # 床
box(-6, -5, CZ, 28, 15, CZ + 0.1, CEIL)        # 天井

def wall_x(x0, x1, y0, y1, doors=(), panel_dir=0):
    # x の向きに延びる壁（y0〜y1 の厚み）。doors = 扉の x の中心の並び（幅 0.9 m のくぼみ。奥に扉の板）
    xs = [x0]
    for c in sorted(doors): xs += [c - 0.45, c + 0.45]
    xs.append(x1)
    for a, b in zip(xs[0::2], xs[1::2]): box(a, y0, FZ, b, y1, CZ, WALL)
    for c in doors:
        box(c - 0.45, y0, DOOR_TOP, c + 0.45, y1, CZ, WALL)                 # 扉の上の壁
        if panel_dir:                                                        # 閉じた扉（くぼみの奥）
            yb = y1 if panel_dir > 0 else y0
            box(c - 0.45, yb, FZ, c + 0.45, yb + 0.04 * panel_dir, DOOR_TOP, DOOR)
def wall_y(y0, y1, x0, x1, doors=(), panel_dir=0):
    ys = [y0]
    for c in sorted(doors): ys += [c - 0.45, c + 0.45]
    ys.append(y1)
    for a, b in zip(ys[0::2], ys[1::2]): box(x0, a, FZ, x1, b, CZ, WALL)
    for c in doors:
        box(x0, c - 0.45, DOOR_TOP, x1, c + 0.45, CZ, WALL)
        if panel_dir:
            xb = x1 if panel_dir > 0 else x0
            box(xb, c - 0.45, FZ, xb + 0.04 * panel_dir, c + 0.45, DOOR_TOP, DOOR)

# 研究室（x -3.5〜3.5、y -3〜3）。北の壁（y 3.0〜3.2）に開いた出入口（x = 2.5）。廊下の南の壁を兼ねる
wall_x(-4.2, 26.2, 3.0, 3.2, doors=[2.5, 10.5, 17.5], panel_dir=-1)   # 出入口 2.5 は開いている（扉の板は下で消す）
boxes[:] = [b for b in boxes if not (b[6] == DOOR and abs((b[0] + b[3]) / 2 - 2.5) < 0.1)]
wall_x(-3.7, 3.7, -3.2, -3.0)                    # 研究室の南の壁
wall_y(-3.2, 3.0, -3.7, -3.5)                    # 研究室の西の壁
wall_y(-3.2, 3.0, 3.5, 3.7)                      # 研究室の東の壁
# 廊下（幅 2 m）: 東西の 1 本目 x -4〜26・y 3.2〜5.2、南北の 2 本目 x 24〜26・y 5.2〜13（L 字）
wall_x(-4.2, 24.0, 5.2, 5.4, doors=[1.5, 7.5, 13.5, 19.5], panel_dir=1)
wall_y(5.2, 13.2, 23.8, 24.0, doors=[9.0], panel_dir=-1)
wall_y(3.0, 13.2, 26.0, 26.2, doors=[7.0, 11.0], panel_dir=1)
wall_y(3.0, 5.4, -4.2, -4.0)                     # 西の突き当たり
wall_x(23.8, 26.2, 13.0, 13.2)                   # 北の突き当たり
# 柱（廊下に 25 cm 出っ張る）
for x in (4.5, 10.5 + 1.5, 16.5, 22.0): box(x, 4.95, FZ, x + 0.5, 5.2, CZ, PILLAR)
for x in (-1.0, 14.0): box(x, 3.2, FZ, x + 0.5, 3.4, CZ, PILLAR)
box(25.75, 8.0, FZ, 26.0, 8.5, CZ, PILLAR)
# 天井の照明（5 cm 下がった細長い箱。強度が高い）
for x in np.arange(-2.5, 24.0, 3.0): box(x - 0.6, 4.05, CZ - 0.05, x + 0.6, 4.35, CZ, LIGHT)
for y in np.arange(6.5, 13.0, 3.0): box(24.85, y - 0.6, CZ - 0.05, 25.15, y + 0.6, CZ, LIGHT)
for x in (-2.0, 1.0):
    for y in (-1.5, 1.5): box(x - 0.6, y - 0.3, CZ - 0.05, x + 0.6, y + 0.3, CZ, LIGHT)
# 消火栓の箱・掲示板（壁から少し出る）
box(9.0, 5.08, FZ + 0.5, 9.7, 5.2, FZ + 1.4, 70)
box(20.5, 3.2, FZ + 1.0, 21.7, 3.24, FZ + 1.8, 32)
# 研究室の中: 机 4 つ（天板と脚の代わりの箱）、棚 2 つ、ロッカー
for (x, y) in ((-2.0, -1.2), (0.2, -1.2), (-2.0, 1.4), (0.2, 1.4)):
    box(x, y, FZ + 0.68, x + 1.6, y + 0.8, FZ + 0.72, DESK)
    box(x + 0.05, y + 0.05, FZ, x + 0.15, y + 0.75, FZ + 0.68, DESK)
    box(x + 1.45, y + 0.05, FZ, x + 1.55, y + 0.75, FZ + 0.68, DESK)
box(-3.5, -2.6, FZ, -3.1, 0.4, FZ + 1.8, SHELF)
box(2.4, -3.0, FZ, 3.5, -2.6, FZ + 1.9, SHELF)
box(3.1, -1.5, FZ, 3.5, 1.5, FZ + 1.2, 50)
B = np.array(boxes, dtype=np.float64)

# ---------------------------------------------------------------- 2. 軌跡（部屋 → 廊下を往復 → 部屋に戻る）
way = [(0.0, 0.0), (1.2, 0.3), (2.0, 1.2), (2.5, 2.4), (2.5, 3.6), (3.6, 4.2), (24.6, 4.2), (25.0, 5.6), (25.0, 12.2),
       (25.0, 12.4), (24.9, 6.0), (24.0, 4.3), (-3.0, 4.2), (-3.2, 4.25), (1.4, 4.2), (2.5, 3.6), (2.5, 2.4), (1.6, 0.6), (0.2, -0.3)]
pauses = {0: 6.0, 4: 3.0, 9: 5.0, 13: 4.0, 18: 8.0}     # 止まる所（秒）
seg_t, pts = [], []
t = 0.0
for i, (a, b) in enumerate(zip(way[:-1], way[1:])):
    if i in pauses: pts.append((t, *a)); t += pauses[i]
    d = np.hypot(b[0] - a[0], b[1] - a[1]); v = 0.18 if (abs(a[1]) < 3.5 and abs(b[1]) < 3.5) else 0.21   # 部屋の中はゆっくり
    pts.append((t, *a)); t += d / v
pts.append((t, *way[-1])); t += pauses[18]; pts.append((t, *way[-1]))
K = np.array(pts)
tt = np.arange(0.0, K[-1, 0], 0.1)
X = np.interp(tt, K[:, 0], K[:, 1]); Y = np.interp(tt, K[:, 0], K[:, 2])
# 角をなめらかに（1.5 秒の移動平均）＋ 小さなふらつき
k = 15; ker = np.ones(k) / k
X = np.convolve(np.pad(X, k // 2, mode='edge'), ker, 'valid'); Y = np.convolve(np.pad(Y, k // 2, mode='edge'), ker, 'valid')
X += 0.015 * np.sin(tt * 0.7) + 0.004 * rng.standard_normal(len(tt)).cumsum() / np.sqrt(len(tt)) * 10
Y += 0.012 * np.sin(tt * 0.53 + 1.0)
X -= X[0]; Y -= Y[0]
Z = 0.004 * np.sin(tt * 2.1) + 0.002 * rng.standard_normal(len(tt))
Z -= Z[0]
H = np.unwrap(np.arctan2(np.gradient(Y), np.gradient(X) + 1e-9))   # 進む向き（センサーの向き）

# ---------------------------------------------------------------- 3. LiDAR の光線（MID-360 らしく: 水平 360°、上下 -7°〜52°、最大 40 m）
def cast(o, d):
    # 原点 o（3）から向き d（m×3）の光線が最初に当たる箱までの距離と、その箱の番号・当たった面の向き
    inv = 1.0 / np.where(np.abs(d) < 1e-12, 1e-12, d)
    t1 = (B[None, :, 0:3] - o) * inv[:, None, :]; t2 = (B[None, :, 3:6] - o) * inv[:, None, :]
    tn = np.minimum(t1, t2); tf = np.maximum(t1, t2)
    tin = tn.max(2); tout = tf.min(2)
    hit = (tin <= tout) & (tout > 0.05) & (tin > 0.05)
    tin = np.where(hit, tin, np.inf)
    j = tin.argmin(1); r = tin[np.arange(len(d)), j]
    ax = tn[np.arange(len(d)), j].argmax(1)          # どの向きの面に当たったか（0:x 1:y 2:z）
    return r, j, ax

pos_all, inten_all = [], []
scan_idx = np.arange(0, len(tt), 5)                  # 0.5 秒ごとに 1 回分の走査
for si in scan_idx:
    o = np.array([X[si], Y[si], Z[si]])
    m = 2600 if np.hypot(o[0] - 25, o[1] - 12.3) < 0.6 or tt[si] < 6 else 1500
    az = rng.uniform(0, 2 * np.pi, m) + H[si]
    el = np.deg2rad(-7 + 59 * rng.beta(1.1, 1.6, m))   # 下の方の光線が多い（非繰り返しの走査らしいむら）
    d = np.c_[np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)]
    r, j, ax = cast(o, d)
    ok = np.isfinite(r) & (r < 40)
    r, j, ax, d = r[ok], j[ok], ax[ok], d[ok]
    r = r + rng.normal(0, 0.012, len(r)) + 0.004 * (r > 10) * rng.standard_normal(len(r))   # 距離の雑音（遠いほど少し大きい）
    p = o + d * r[:, None]
    cosi = np.abs(d[np.arange(len(d)), ax])
    refl = B[j, 6]
    I = refl * (0.45 + 0.55 * cosi) * np.clip(1.15 - r / 60, 0.5, 1.15) + rng.normal(0, 7, len(r))
    pos_all.append(p); inten_all.append(I)
P = np.concatenate(pos_all); I = np.concatenate(inten_all)
# 板目・汚れのような強度のむら（床と壁の場所ごとにゆっくり変わる）
I += 5 * np.sin(P[:, 0] * 1.7) * np.cos(P[:, 1] * 2.3) + 3 * np.sin(P[:, 2] * 5.0)
# まれな外れ点（ガラスや人の足などの写り込みの代わり）
n_out = len(P) // 2000
pick = rng.choice(len(P), n_out, replace=False)
P = np.r_[P, P[pick] + rng.normal(0, 0.25, (n_out, 3))]; I = np.r_[I, rng.uniform(0, 40, n_out)]

# ---------------------------------------------------------------- 4. 地図らしく間引く（3 cm の格子に 1 点。それでも多ければ無作為に減らす）
vox = np.floor(P / 0.03).astype(np.int64)
key = (vox[:, 0] + 4000) * 10**10 + (vox[:, 1] + 4000) * 10**5 + (vox[:, 2] + 4000)
order = rng.permutation(len(P))
_, first = np.unique(key[order], return_index=True)
sel = order[first]
if len(sel) > TARGET_N: sel = rng.choice(sel, TARGET_N, replace=False)
P, I = P[sel], I[sel]
print('点数', len(P), '（光線', sum(len(p) for p in pos_all), '）', file=sys.stderr)
if len(P) < 0.9 * TARGET_N: sys.exit(f'点が足りません: {len(P)}')

# ---------------------------------------------------------------- 5. 地図の座標へ（走り始めのセンサーの向き。傾き約 3.4°、向き約 -17°）
def rot(axis, deg):
    a = np.deg2rad(deg); c, s = np.cos(a), np.sin(a); x, y, z = np.array(axis) / np.linalg.norm(axis)
    return np.array([[c + x*x*(1-c), x*y*(1-c) - z*s, x*z*(1-c) + y*s], [y*x*(1-c) + z*s, c + y*y*(1-c), y*z*(1-c) - x*s], [z*x*(1-c) - y*s, z*y*(1-c) + x*s, c + z*z*(1-c)]])
R = rot([0.29, -0.96, 0.0], 3.4) @ rot([0, 0, 1], -17.0)
P = P @ R.T
TR = np.c_[X, Y, Z] @ R.T
P = P.astype(np.float32)
I = np.clip(np.round(I), 0, 255).astype(np.uint8)

# ---------------------------------------------------------------- 6. 書き出し
os.makedirs(OUT, exist_ok=True)
order = rng.permutation(len(P)); Pj, Ij = P[order], I[order]          # map.json は順番を混ぜる（実測の書き出しと同じ）
lo = Pj.min(0).astype(np.float64); hi = Pj.max(0).astype(np.float64)
sc = (hi - lo) / 65535
q = np.clip(np.round((Pj.astype(np.float64) - lo) / sc), 0, 65535).astype('<u2')
doc = {'n': int(len(Pj)), 'lo': lo.tolist(), 'sc': sc.tolist(),
       'b64': base64.b64encode(q.tobytes()).decode(), 'b64i': base64.b64encode(Ij.tobytes()).decode()}
with open(os.path.join(OUT, 'map.json'), 'w') as f: json.dump(doc, f)
with open(os.path.join(OUT, 'trajectory.txt'), 'w') as f:
    f.write('# t x y z\n')
    for ti, (x, y, z) in zip(tt, TR): f.write(f'{T0 + 0.937 + ti:.3f} {x + 0.0:.3f} {y + 0.0:.3f} {z + 0.0:.3f}\n'.replace(' -0.000', ' 0.000'))
try:
    import laspy
except ImportError:
    laspy = None; print('laspy が無いので map.laz は作りません', file=sys.stderr)
if laspy:
    s = np.argsort(P[:, 0], kind='stable')
    h = laspy.LasHeader(point_format=0, version='1.2'); h.scales = [0.001] * 3; h.offsets = [0.0, 0.0, 0.0]
    las = laspy.LasData(h)
    las.x, las.y, las.z = P[s, 0].astype(np.float64), P[s, 1].astype(np.float64), P[s, 2].astype(np.float64)
    las.intensity = I[s].astype(np.uint16)
    las.write(os.path.join(OUT, 'map.laz'), laz_backend=laspy.LazBackend.Lazrs)
print(json.dumps({'n': int(len(P)), 'min': P.min(0).tolist(), 'max': P.max(0).tolist(), 'traj': len(tt), 'sec': round(float(tt[-1]), 1)}))
