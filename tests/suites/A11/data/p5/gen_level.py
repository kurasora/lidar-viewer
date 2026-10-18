# 水平補正の試験用の点群（正解つき）を作る
import sys, os; sys.path.insert(0, sys.argv[1])
from synth import *
out = sys.argv[2]; os.makedirs(out, exist_ok=True)
cases = {}
def put(name, pts_room, R, t=(0, 0, 0), note='', floor_pts=None, extra=None):
    """pts_room: 部屋の座標（床 z=0、廊下は x 向き）。R・t でファイルの座標へ"""
    Rm = np.asarray(R); t = np.asarray(t, float)
    Q = pts_room @ Rm.T + t
    write_pcd(f'{out}/{name}.pcd', Q, dtype='F', size=8 if np.abs(t).max() > 1e4 else 4)
    fp = floor_pts if floor_pts is not None else pts_room[np.abs(pts_room[:, 2]) < 0.02]
    cases[name] = {'R': Rm, 't': t, 'note': note, 'n': len(Q), 'floor_file': (fp @ Rm.T + t)[:2000], **(extra or {})}
rng = np.random.default_rng(10)
base = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.003, seed=11)
# 1) 傾きの大きさ（x 軸まわり）。向き 25 度
for d in [0, 1, 5, 10, 20, 30, 34, 36, 45, 60]:
    put(f'tilt{d:02d}', base, rotz(25) @ rotx(d), note=f'傾き {d}°')
# 2) 向き（z 軸まわり）
for y in [0, 44, 46, 89, 91, 135, 170]:
    put(f'yaw{y:03d}', base, rotz(y) @ roty(3), note=f'向き {y}°、傾き 3°')
# 3) 上下が逆（センサーを逆さに付けた）
put('upside', base, rotx(180), note='上下が逆')
put('upside_tilt', base, rotx(175), note='上下が逆で 5° 傾く')
# 4) 壁が多い部屋（仕切りが多い事務所）: 床 10×10、高さ 3、x 方向の壁 9 枚
P = [plane([0, 0, 0], [1, 0, 0], [0, 1, 0], 10, 10, 0.05, rng)]
for k in range(10): P.append(plane([0, k * 1.1, 0], [1, 0, 0], [0, 0, 1], 10, 3, 0.03, rng))
office = np.vstack(P) + rng.normal(0, 0.003, (sum(len(p) for p in P), 3))
put('office_walls', office, rotz(-20) @ rotx(4), note='壁が多い（床 10×10 に対して壁 10 枚）')
# 5) 床が狭い（幅 0.8 m、高さ 4 m の通路）
narrow = room(L=15, Wd=0.8, H=4.0, step=0.04, noise=0.003, seed=12, ceiling=False)
put('narrow_floor', narrow, rotz(10) @ roty(3) @ rotx(2), note='床が狭い（幅 0.8 m、天井なし）')
# 6) 点が少ない
for step, nm in [(0.3, 'sparse030'), (0.2, 'sparse020'), (0.12, 'sparse012')]:
    sp = room(L=20, Wd=3, H=2.7, step=step, noise=0.003, seed=13)
    put(nm, sp, rotz(15) @ rotx(3), note=f'点が少ない（間隔 {step} m、{len(sp)} 点）')
# 7) 外れ値が多い（部屋の箱の中に一様な点を 30% / 100%）
for frac in [0.3, 1.0]:
    m = int(len(base) * frac)
    o = np.c_[rng.uniform(-2, 22, m), rng.uniform(-2, 5, m), rng.uniform(-1, 4, m)]
    put(f'outliers{int(frac*100):03d}', np.vstack([base, o]), rotz(25) @ rotx(3), note=f'外れ値 {int(frac*100)}%')
# 8) 床が 2 段（半分が 0.5 m 高い台）
two = room(L=20, Wd=6, H=3.0, step=0.05, noise=0.003, seed=14, floor=False)
f1 = plane([0, 0, 0], [1, 0, 0], [0, 1, 0], 10, 6, 0.05, rng)
f2 = plane([10, 0, 0.5], [1, 0, 0], [0, 1, 0], 10, 6, 0.05, rng)
put('two_level', np.vstack([two, f1, f2]), rotz(25) @ rotx(3), note='床が 2 段（0 m と 0.5 m、同じ広さ）', floor_pts=f1)
# 9) 床と天井が 5° の斜面（坂の通路）で、壁は鉛直
ramp = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.003, seed=15)
sl = np.tan(np.radians(5))
ramp[:, 2] += ramp[:, 0] * sl * (np.abs(ramp[:, 2] - 0) < 0.05) + ramp[:, 0] * sl * (np.abs(ramp[:, 2] - 2.7) < 0.05)
put('ramp5', ramp, np.eye(3), note='坂（床と天井が 5° の斜面、壁は鉛直）')
# 10) 机が多い（高さ 0.7 m の机の面が床の面積の 60%）
desk = room(L=20, Wd=6, H=2.7, step=0.05, noise=0.003, seed=16)
d1 = plane([1, 0.5, 0.7], [1, 0, 0], [0, 1, 0], 18, 3, 0.03, rng)
put('desks', np.vstack([desk, d1]), rotz(25) @ rotx(3), note='机の面（高さ 0.7 m）が多い')
# 11) 床の下に点（階段の吹き抜けから見える下の階の床 −3 m、面積は床の 40%）
low = plane([2, 0, -3.0], [1, 0, 0], [0, 1, 0], 8, 3, 0.05, rng)
put('below_floor', np.vstack([base, low]), rotz(25) @ rotx(3), note='床の下に下の階の床（-3 m、床の 40%）')
# 12) UTM の位置（大きな平行移動）で傾き 3 度
put('utm_tilt', base, rotz(25) @ rotx(3), t=(539012.3, 3836045.6, 30.0), note='UTM の位置で傾き 3°')
# 13) 廊下が長い（100 m）
long_ = room(L=100, Wd=3, H=2.7, step=0.06, noise=0.003, seed=17)
put('long100', long_, rotz(60) @ rotx(2), note='長い廊下 100 m')
save_json(f'{out}/truth.json', cases)
print(len(cases), 'cases')
