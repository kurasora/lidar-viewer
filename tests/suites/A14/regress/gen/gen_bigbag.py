# 生の点群（/livox/lidar の PointCloud2、1 回 2 万点・10 Hz）を含む rosbag2（MCAP）: 「軌跡を開く」で大きな bag を開くと
#   python3 gen_bigbag.py <出力フォルダ> [秒=60]
import sys, os, shutil
import numpy as np
from rosbags.rosbag2 import Writer, StoragePlugin
from rosbags.typesys import Stores, get_typestore
out = sys.argv[1]; secs = int(sys.argv[2]) if len(sys.argv) > 2 else 60
if os.path.exists(out): shutil.rmtree(out)
ts = get_typestore(Stores.ROS2_JAZZY)
PC2 = ts.types['sensor_msgs/msg/PointCloud2']; PF = ts.types['sensor_msgs/msg/PointField']; H = ts.types['std_msgs/msg/Header']; Tm = ts.types['builtin_interfaces/msg/Time']
Od = ts.types['nav_msgs/msg/Odometry']; PWC = ts.types['geometry_msgs/msg/PoseWithCovariance']; TWC = ts.types['geometry_msgs/msg/TwistWithCovariance']
Pose = ts.types['geometry_msgs/msg/Pose']; Pt = ts.types['geometry_msgs/msg/Point']; Q = ts.types['geometry_msgs/msg/Quaternion']; Tw = ts.types['geometry_msgs/msg/Twist']; V3 = ts.types['geometry_msgs/msg/Vector3']
fields = [PF(name='x', offset=0, datatype=7, count=1), PF(name='y', offset=4, datatype=7, count=1), PF(name='z', offset=8, datatype=7, count=1), PF(name='intensity', offset=12, datatype=7, count=1),
          PF(name='tag', offset=16, datatype=2, count=1), PF(name='line', offset=17, datatype=2, count=1), PF(name='timestamp', offset=18, datatype=8, count=1)]
rs = np.random.default_rng(0); N = 20000
blob = rs.integers(0, 255, N * 26, dtype=np.uint8)
w = Writer(out, version=9, storage_plugin=StoragePlugin.MCAP)
with w:
    cl = w.add_connection('/livox/lidar', PC2.__msgtype__, typestore=ts)
    co = w.add_connection('/Odometry', Od.__msgtype__, typestore=ts)
    t0 = 1791886716.0
    for i in range(secs * 10):
        t = t0 + i * 0.1; st = Tm(sec=int(t), nanosec=int((t % 1) * 1e9))
        m = PC2(header=H(stamp=st, frame_id='livox_frame'), height=1, width=N, fields=fields, is_bigendian=False, point_step=26, row_step=26 * N, data=blob, is_dense=True)
        w.write(cl, int(t * 1e9), ts.serialize_cdr(m, PC2.__msgtype__))
        o = Od(header=H(stamp=st, frame_id='camera_init'), child_frame_id='body', pose=PWC(pose=Pose(position=Pt(x=i * 0.05, y=0., z=0.), orientation=Q(x=0., y=0., z=0., w=1.)), covariance=np.zeros(36)),
               twist=TWC(twist=Tw(linear=V3(x=0., y=0., z=0.), angular=V3(x=0., y=0., z=0.)), covariance=np.zeros(36)))
        w.write(co, int(t * 1e9), ts.serialize_cdr(o, Od.__msgtype__))
print('ok', sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out)) / 1e6, 'MB')
