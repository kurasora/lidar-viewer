# 天井を隠す試験の形（すべて水平・向きそろえ済み。床 z=0）
import sys, os; sys.path.insert(0, sys.argv[1])
from synth import *
rng = np.random.default_rng(20)
cases = {}
def put(name, P, note, expect):
    write_pcd(f'{name}.pcd', P); cases[name] = {'note': note, 'expect': expect, 'n': len(P)}
# a) 1 部屋（基準）
put('c_room', room(L=20, Wd=6, H=2.7, step=0.05, noise=0.003, seed=21), '1 部屋 20×6×2.7', '天井 2.7 を隠す')
# b) 2 階建て（1 階 0〜2.7、床版 3.0、2 階 3.0〜5.7）
r1 = room(L=20, Wd=6, H=2.7, step=0.05, noise=0.003, seed=22)
r2 = room(L=20, Wd=6, H=2.7, step=0.05, noise=0.003, seed=23); r2[:, 2] += 3.0
put('c_2story', np.vstack([r1, r2]), '2 階建て（1 階の天井 2.7、2 階の床 3.0、天井 5.7）', '2 階の内容は残すのが望ましい')
# c) 吹き抜け（左半分は天井 6 m、右半分は 2.7 m）
L = 20; A = []
A.append(plane([0, 0, 0], [1, 0, 0], [0, 1, 0], L, 6, 0.05, rng))
A.append(plane([0, 0, 6.0], [1, 0, 0], [0, 1, 0], 10, 6, 0.05, rng))
A.append(plane([10, 0, 2.7], [1, 0, 0], [0, 1, 0], 10, 6, 0.05, rng))
for y in [0, 6]: A.append(plane([0, y, 0], [1, 0, 0], [0, 0, 1], 10, 6.0, 0.05, rng)); A.append(plane([10, y, 0], [1, 0, 0], [0, 0, 1], 10, 2.7, 0.05, rng))
P = np.vstack(A); P += rng.normal(0, 0.003, P.shape)
put('c_atrium', P, '吹き抜け（半分 6 m、半分 2.7 m）', '両方の天井を隠す（設計どおり）')
# d) 斜めの天井（屋根裏: 2.4 m から 4.0 m へ）
B = [plane([0, 0, 0], [1, 0, 0], [0, 1, 0], 20, 6, 0.05, rng)]
c = plane([0, 0, 0], [1, 0, 0], [0, 1, 0], 20, 6, 0.05, rng); c[:, 2] = 2.4 + c[:, 1] / 6 * 1.6; B.append(c)
for y, h in [(0, 2.4), (6, 4.0)]: B.append(plane([0, y, 0], [1, 0, 0], [0, 0, 1], 20, h, 0.05, rng))
P = np.vstack(B); P += rng.normal(0, 0.003, P.shape)
put('c_slope', P, '斜めの天井（2.4〜4.0 m）', '天井を隠す（ただし平らでないので検出できなくても可）')
# e) 屋外（天井なし）: 地面 60×60、建物の壁（高さ 10 m）、木の葉（高さ 4〜8 m の塊）
C = [plane([0, 0, 0], [1, 0, 0], [0, 1, 0], 60, 60, 0.08, rng)]
for x0 in [5, 25, 45]: C.append(plane([x0, 10, 0], [1, 0, 0], [0, 0, 1], 12, 10, 0.08, rng))
for k in range(25):
    cx, cy = rng.uniform(0, 60), rng.uniform(25, 60); m = 6000
    v = rng.normal(0, 1, (m, 3)); v /= np.linalg.norm(v, axis=1)[:, None]; v *= [2.5, 2.5, 1.5]
    C.append(v + [cx, cy, 6.0])
P = np.vstack(C); P += rng.normal(0, 0.005, P.shape)
put('c_outdoor', P, '屋外（地面＋建物の壁＋木の葉 4〜8 m）', '何も隠さない')
# f) 床より下に点（下の階の床 -3 m が床の 40%）
base = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.003, seed=24)
low = plane([2, 0, -3.0], [1, 0, 0], [0, 1, 0], 8, 3, 0.05, rng)
put('c_below', np.vstack([base, low]), '床の下に下の階の床（-3 m、床の 40%）', '主の階の天井 2.7 を隠す')
# g) 天井の照明・梁（天井の下 0.3 m に梁が密に並ぶ）
D = [room(L=20, Wd=6, H=3.0, step=0.05, noise=0.003, seed=25)]
for x0 in np.arange(1, 20, 2): D.append(plane([x0, 0, 2.7], [0, 1, 0], [0, 0, 1], 6, 0.3, 0.03, rng)); D.append(plane([x0, 0, 2.7], [1, 0, 0], [0, 1, 0], 0.3, 6, 0.03, rng))
put('c_beams', np.vstack(D), '天井 3.0 m の下に梁（2.7 m）', '天井を隠す')
save_json('truth_ceil.json', cases)
print({k: v['n'] for k, v in cases.items()})
