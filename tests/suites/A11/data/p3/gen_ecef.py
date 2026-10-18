# z のシフトが 0 でない点群（ECEF 風: x,y,z すべてが大きい）。部屋は水平のまま平行移動だけ
import sys; sys.path.insert(0, sys.argv[1])
from synth import *
pts = room(L=20, Wd=3, H=2.7, step=0.05, noise=0.002, seed=4)
E = np.array([-3912345.0, 3423456.0, 3612345.0])
inten = (np.arange(len(pts)) % 200).astype(np.float32)
write_pcd('ecef_room.pcd', pts + E, {'intensity': (inten, 'F', 4)}, dtype='F', size=8)
save_json('truth_ecef.json', {'E': E, 'zmin': float((pts + E)[:, 2].min()), 'zmax': float((pts + E)[:, 2].max())})
