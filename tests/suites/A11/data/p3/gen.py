import sys; sys.path.insert(0, sys.argv[1])
from synth import *
import laspy
UTM = np.array([539000.0, 3836000.0, 30.0])
pts = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.002, seed=2)
# 傾き 2 度（x 軸まわり）と向き 30 度（z 軸まわり）を与えてから UTM へ
R = rotz(30) @ rotx(2)
Q = pts @ R.T + UTM + np.array([12.3, 45.6, 0.0])
inten = (np.arange(len(Q)) % 200).astype(np.float32)
write_pcd('utm_room_f8.pcd', Q, {'intensity': (inten, 'F', 4)}, dtype='F', size=8)
h = laspy.LasHeader(point_format=1, version='1.2'); h.scales = [0.001] * 3; h.offsets = UTM
las = laspy.LasData(h); las.x, las.y, las.z = Q.T; las.intensity = inten.astype(np.uint16); las.write('utm_room.las')
# 同じ部屋をシフトなし（原点付近）で
write_pcd('loc_room.pcd', pts @ R.T, {'intensity': (inten, 'F', 4)})
save_json('truth.json', {'R': R, 'UTM': UTM, 't': UTM + np.array([12.3, 45.6, 0.0]), 'min': Q.min(0), 'max': Q.max(0), 'n': len(Q),
  'locmin': (pts @ R.T).min(0), 'locmax': (pts @ R.T).max(0)})
print(len(Q), Q.min(0), Q.max(0))
