# 正解の分かっている建物（L 字の廊下）と、MID-360 を載せたロボットの走行を作る共通部品
#   建物座標 B: 床 z=0、天井 z=2.7、廊下 A は x 0..40（幅 2.4 m、y -1.2..1.2）、廊下 B は x 38.8..41.2・y 1.2..20
#   地図座標 M（FAST-LIO の camera_init）: 走り始めのセンサーの位置・向き（取り付けの傾きを含む）を原点にした座標
import os
import numpy as np

CEIL = 2.7
# 軸にそろった長方形: (軸, 値, (他の軸1 の範囲), (他の軸2 の範囲), 反射)
#   軸 0=x 面（x=値、y と z の範囲）、1=y 面（x と z の範囲）、2=z 面（x と y の範囲）
RECTS = []
def R(ax, v, a, b, refl): RECTS.append((ax, v, a, b, refl))
# 床と天井（廊下 A と B）
R(2, 0.0, (-0.5, 41.2), (-1.2, 1.2), 30); R(2, 0.0, (38.8, 41.2), (1.2, 20.0), 30)
R(2, CEIL, (-0.5, 41.2), (-1.2, 1.2), 60); R(2, CEIL, (38.8, 41.2), (1.2, 20.0), 60)
# 南の壁 y=-1.2（扉のへこみ x 15..16）
R(1, -1.2, (-0.5, 15.0), (0, CEIL), 80); R(1, -1.2, (16.0, 41.2), (0, CEIL), 80)
R(1, -1.5, (15.0, 16.0), (0, 2.1), 140); R(1, -1.2, (15.0, 16.0), (2.1, CEIL), 80)  # 扉の板（高さ 2.1）と上の壁
R(0, 15.0, (-1.5, -1.2), (0, 2.1), 80); R(0, 16.0, (-1.5, -1.2), (0, 2.1), 80)
R(2, 2.1, (15.0, 16.0), (-1.5, -1.2), 80)
# 北の壁 y=+1.2（扉 x 25..26、廊下 B の入口 x 38.8..41.2）
R(1, 1.2, (-0.5, 25.0), (0, CEIL), 80); R(1, 1.2, (26.0, 38.8), (0, CEIL), 80)
R(1, 1.5, (25.0, 26.0), (0, 2.1), 140); R(1, 1.2, (25.0, 26.0), (2.1, CEIL), 80)
R(0, 25.0, (1.2, 1.5), (0, 2.1), 80); R(0, 26.0, (1.2, 1.5), (0, 2.1), 80)
R(2, 2.1, (25.0, 26.0), (1.2, 1.5), 80)
# 端の壁
R(0, -0.5, (-1.2, 1.2), (0, CEIL), 80)
R(0, 41.2, (-1.2, 20.0), (0, CEIL), 80)
R(0, 38.8, (1.2, 20.0), (0, CEIL), 80)
R(1, 20.0, (38.8, 41.2), (0, CEIL), 80)
# 床の上の箱（x 9.7..10.3、y 0.3..0.7、高さ 0.8）
BOX = dict(x=(9.7, 10.3), y=(0.3, 0.7), z=(0.0, 0.8))
R(2, 0.8, BOX['x'], BOX['y'], 200)
R(0, 9.7, BOX['y'], BOX['z'], 200); R(0, 10.3, BOX['y'], BOX['z'], 200)
R(1, 0.3, BOX['x'], BOX['z'], 200); R(1, 0.7, BOX['x'], BOX['z'], 200)
# 天井の照明（下に 10 cm 出ている）
R(2, 2.6, (5.0, 6.2), (-0.3, 0.3), 250)
R(0, 5.0, (-0.3, 0.3), (2.6, CEIL), 250); R(0, 6.2, (-0.3, 0.3), (2.6, CEIL), 250)

OTHER = {0: (1, 2), 1: (0, 2), 2: (0, 1)}

def cast(o, d, max_range=40.0):
    """o: (3,) 始点、d: (N,3) 単位ベクトル → 距離 t (N,)（当たらなければ inf）と反射"""
    N = d.shape[0]
    best = np.full(N, np.inf); refl = np.zeros(N)
    for ax, v, ra, rb, rf in RECTS:
        da = d[:, ax]
        with np.errstate(divide='ignore', invalid='ignore'):
            t = (v - o[ax]) / da
        a1, a2 = OTHER[ax]
        pa = o[a1] + d[:, a1] * t; pb = o[a2] + d[:, a2] * t
        ok = (t > 0.05) & (t < best) & (pa >= ra[0]) & (pa <= ra[1]) & (pb >= rb[0]) & (pb <= rb[1])
        best = np.where(ok, t, best); refl = np.where(ok, rf, refl)
    best[best > max_range] = np.inf
    return best, refl

def rot(roll, pitch, yaw):
    cr, sr, cp, sp, cy, sy = np.cos(roll), np.sin(roll), np.cos(pitch), np.sin(pitch), np.cos(yaw), np.sin(yaw)
    Rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    Ry = np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]])
    Rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
    return Rz @ Ry @ Rx

def quat(Rm):
    # 回転行列 → (qx, qy, qz, qw)
    tr = np.trace(Rm)
    if tr > 0:
        s = np.sqrt(tr + 1.0) * 2; qw = 0.25 * s
        qx = (Rm[2, 1] - Rm[1, 2]) / s; qy = (Rm[0, 2] - Rm[2, 0]) / s; qz = (Rm[1, 0] - Rm[0, 1]) / s
    else:
        i = np.argmax(np.diag(Rm))
        if i == 0:
            s = np.sqrt(1 + Rm[0, 0] - Rm[1, 1] - Rm[2, 2]) * 2; qw = (Rm[2, 1] - Rm[1, 2]) / s; qx = 0.25 * s; qy = (Rm[0, 1] + Rm[1, 0]) / s; qz = (Rm[0, 2] + Rm[2, 0]) / s
        elif i == 1:
            s = np.sqrt(1 + Rm[1, 1] - Rm[0, 0] - Rm[2, 2]) * 2; qw = (Rm[0, 2] - Rm[2, 0]) / s; qx = (Rm[0, 1] + Rm[1, 0]) / s; qy = 0.25 * s; qz = (Rm[1, 2] + Rm[2, 1]) / s
        else:
            s = np.sqrt(1 + Rm[2, 2] - Rm[0, 0] - Rm[1, 1]) * 2; qw = (Rm[1, 0] - Rm[0, 1]) / s; qx = (Rm[0, 2] + Rm[2, 0]) / s; qy = (Rm[1, 2] + Rm[2, 1]) / s; qz = 0.25 * s
    return np.array([qx, qy, qz, qw])

# 取り付け（ロボットに対する MID-360 の傾き）と、走り始めの向き
MOUNT = rot(np.radians(float(os.environ.get("MOUNT_ROLL", "1.5"))), np.radians(float(os.environ.get("MOUNT_PITCH", "4.0"))), 0.0)
SENSOR_H = float(os.environ.get("SENSOR_H", "0.55"))
START_YAW = np.radians(7.0)

def robot_path(dt=0.1, speed=0.5):
    """建物座標でのロボットの位置と向き（時刻ごと）。廊下 A を東へ、角で左へ曲がって廊下 B を北へ"""
    pts = []
    # 区間 1: (1, 0) から (40, 0)。最初は 7 度ずれて走り始め、少しずつ廊下に沿う
    x, y, yaw = 1.0, 0.0, START_YAW
    t = 0.0
    while x < 40.0:
        pts.append((t, x, y, yaw))
        yaw += (0.0 - yaw) * 0.02 + 0.02 * (-y)  # 廊下の中心に戻る
        x += speed * dt * np.cos(yaw); y += speed * dt * np.sin(yaw); t += dt
    # 角を曲がる
    while yaw < np.pi / 2 - 1e-3:
        pts.append((t, x, y, yaw)); yaw = min(np.pi / 2, yaw + np.radians(15) * dt); t += dt
    while y < 18.0:
        pts.append((t, x, y, yaw))
        y += speed * dt; t += dt
    return np.array(pts)

def sensor_pose_B(x, y, yaw):
    Rb = rot(0, 0, yaw) @ MOUNT
    return Rb, np.array([x, y, SENSOR_H])

def init_pose(path):
    t, x, y, yaw = path[0]
    return sensor_pose_B(x, y, yaw)

def B_to_M(p, R0, t0):
    return (p - t0) @ R0  # = R0^T (p - t0)

def scan(Rb, tb, n, rs):
    """MID-360 風（水平 360 度・上下 -7..52 度）の光線で n 本測る → 建物座標の点と反射"""
    az = rs.uniform(0, 2 * np.pi, n)
    el = np.radians(rs.uniform(-7, 52, n))
    dl = np.stack([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)], 1)
    d = dl @ Rb.T
    t, refl = cast(tb, d)
    ok = np.isfinite(t)
    t = t[ok] + rs.normal(0, 0.01, ok.sum())  # 距離の雑音 1 cm
    p = tb + d[ok] * t[:, None]
    refl = np.clip(refl[ok] + rs.normal(0, 5, ok.sum()), 0, 255)
    return p, refl, dl[ok], t
