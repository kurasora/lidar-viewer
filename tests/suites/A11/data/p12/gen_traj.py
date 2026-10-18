import sys, os, json; sys.path.insert(0, sys.argv[1])
from synth import *
d = json.load(open(sys.argv[2]))   # p3/truth.json（utm_room の R と t）
R = np.array(d['R']); t = np.array(d['t'])
# 廊下の中心線（部屋の座標で x=1〜19、y=1.5、z=0.4）を 5 cm 間隔で
xs = np.arange(1.0, 19.0, 0.05); room_pts = np.c_[xs, np.full_like(xs, 1.5), np.full_like(xs, 0.4)]
F = room_pts @ R.T + t
ts = 1791886716.937 + np.arange(len(F)) * 0.1
q = np.tile([0, 0, 0, 1.0], (len(F), 1))
np.savetxt('utm_traj.txt', np.c_[ts, F, q], fmt='%.6f', header='t x y z qx qy qz qw', comments='# ')
# 同じ軌跡を局所の部屋（loc_room、シフトなし）に
np.savetxt('loc_traj.txt', np.c_[ts, room_pts @ R.T, q], fmt='%.6f', header='t x y z qx qy qz qw', comments='# ')
true_len = float(np.sum(np.linalg.norm(np.diff(F, axis=0), axis=1)))
# 斜め（45°）に 5 cm ずつ進む UTM の軌跡（長さの誤差を見る）
k = np.arange(2000); G = np.c_[539010 + k * 0.05 / np.sqrt(2), 3836050 + k * 0.05 / np.sqrt(2), np.full(len(k), 30.0)]
np.savetxt('utm_diag_traj.txt', np.c_[1791886716.9 + k * 0.1, G, np.tile([0, 0, 0, 1.0], (len(k), 1))], fmt='%.6f', header='t x y z qx qy qz qw', comments='# ')
json.dump({'utm_traj_len': true_len, 'utm_traj_n': len(F), 'utm_traj_dur': float(ts[-1] - ts[0]), 'diag_len': float(np.sum(np.linalg.norm(np.diff(G, axis=0), axis=1))), 'diag_n': len(G), 'first_file': F[0].tolist()}, open('truth_traj.json', 'w'))
print(true_len, len(F))
