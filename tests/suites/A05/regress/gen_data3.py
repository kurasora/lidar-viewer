#!/usr/bin/env python3
# 追加の試験用ファイル 3: python3 gen_data3.py <フォルダ>
#  ・2 階建て（1 階: 床 0・天井 2.6、2 階: 床 2.9・天井 5.5）の廊下 → 「天井を隠す」で 2 階が丸ごと隠れないか
#  ・屋外（地面 + 屋根の高さが同じ建物 6 棟 + 木）→ 屋根が「天井」とされて隠れないか
import sys, numpy as np
out = sys.argv[1]; rng = np.random.default_rng(11)
def write_pcd(path, P, I):
    n = len(P)
    head = ('# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\n'
            f'WIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA binary\n')
    open(path, 'wb').write(head.encode() + np.concatenate([P, I[:, None]], 1).astype(np.float32).tobytes())
def box_corridor(z0, H, n, L=30, W=2.0):
    areas = np.array([L * W, L * W, L * H, L * H]); k = rng.choice(4, n, p=areas / areas.sum())
    x = rng.uniform(0, L, n); u = rng.uniform(-W / 2, W / 2, n); v = rng.uniform(0, H, n)
    P = np.zeros((n, 3)); P[:, 0] = x
    P[k == 0, 1] = u[k == 0]; P[k == 0, 2] = z0
    P[k == 1, 1] = u[k == 1]; P[k == 1, 2] = z0 + H
    P[k == 2, 1] = -W / 2; P[k == 2, 2] = z0 + v[k == 2]
    P[k == 3, 1] = W / 2; P[k == 3, 2] = z0 + v[k == 3]
    return P + rng.normal(0, 0.004, P.shape)
P = np.concatenate([box_corridor(0, 2.6, 150000), box_corridor(2.9, 2.6, 150000)])
write_pcd(f'{out}/two_floors.pcd', P.astype(np.float32), np.full(len(P), 50, np.float32))
# 屋外: 100 m 四方の地面、高さ 9 m の建物 6 棟（屋根と壁）、木（幹と樹冠）
g = np.stack([rng.uniform(0, 100, 150000), rng.uniform(0, 100, 150000), rng.normal(0, 0.03, 150000)], 1)
parts = [g]
for bx, by in [(10, 10), (40, 10), (70, 10), (10, 60), (40, 60), (70, 60)]:
    roof = np.stack([rng.uniform(bx, bx + 15, 12000), rng.uniform(by, by + 15, 12000), np.full(12000, 9.0)], 1)
    wall = np.stack([np.full(6000, bx), rng.uniform(by, by + 15, 6000), rng.uniform(0, 9, 6000)], 1)
    parts += [roof, wall]
for tx, ty in rng.uniform(0, 100, (20, 2)):
    crown = rng.normal(0, 1.5, (1500, 3)) + [tx, ty, 6]
    parts.append(crown)
P = np.concatenate(parts)
write_pcd(f'{out}/outdoor.pcd', P.astype(np.float32), np.full(len(P), 50, np.float32))
print('ok gen3', len(P))
# 欄の名前に HTML を入れた PCD（（担当外）欄の名前が画面にそのまま入らないか）
n = 2000
P = rng.uniform(0, 5, (n, 3)); a = (rng.random(n) > 0.5).astype(np.float32); b = (rng.random(n) > 0.5).astype(np.float32)
names = ['x', 'y', 'z', '<u>u</u>', '<img/src="x"/onerror="window.__xss=1">']
head = ('# .PCD v0.7\nVERSION 0.7\nFIELDS ' + ' '.join(names) + '\nSIZE 4 4 4 4 4\nTYPE F F F F F\nCOUNT 1 1 1 1 1\n'
        f'WIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA binary\n')
arr = np.concatenate([P.astype(np.float32), a[:, None], b[:, None]], 1).astype(np.float32)
open(f'{out}/inj_field.pcd', 'wb').write(head.encode() + arr.tobytes())
print('ok inj')
