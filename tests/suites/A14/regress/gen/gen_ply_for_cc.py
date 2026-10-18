# CloudCompare（この環境のものは PCD・LAS を開けない）に渡すため、PLY に書き直す
import sys, os
import numpy as np
from plyfile import PlyData, PlyElement
F = sys.argv[1]; out = F + '/cc'; os.makedirs(out, exist_ok=True)
def pcd_rec(path):
    raw = open(path, 'rb').read(); off = raw.index(b'DATA binary\n') + 12
    head = raw[:off].decode(); names = head.split('FIELDS ')[1].split('\n')[0].split(); sizes = list(map(int, head.split('SIZE ')[1].split('\n')[0].split())); types = head.split('TYPE ')[1].split('\n')[0].split()
    dt = [(n, {('F', 4): '<f4', ('F', 8): '<f8', ('U', 1): 'u1'}[(t, s)]) for n, s, t in zip(names, sizes, types)]
    return np.frombuffer(raw[off:], dtype=np.dtype(dt))
L = pcd_rec(F + '/livox/livox_frame.pcd')
PlyData([PlyElement.describe(np.array(L), 'vertex')], text=False).write(out + '/livox_frame.ply')
G = pcd_rec(F + '/liosam/GlobalMap.pcd')
PlyData([PlyElement.describe(np.array(G), 'vertex')], text=False).write(out + '/GlobalMap.ply')
import laspy
las = laspy.read(F + '/shift/map_local.las')
M = np.zeros(len(las.x), dtype=[('x', '<f8'), ('y', '<f8'), ('z', '<f8'), ('intensity', '<f4'), ('gps_time', '<f8')])
M['x'], M['y'], M['z'] = las.x, las.y, las.z; M['intensity'] = las.intensity; M['gps_time'] = las.gps_time
PlyData([PlyElement.describe(M[:300000], 'vertex')], text=False).write(out + '/map_gpstime.ply')
print('ok')
