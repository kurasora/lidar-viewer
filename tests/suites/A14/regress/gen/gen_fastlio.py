# FAST-LIO の出力に似せたファイルを作る（正解つき）
#   python3 gen_fastlio.py <出力フォルダ> [1 走査の光線数=2700]
#   → scans.pcd（PointXYZINormal binary）, truth.json, odom_tum.txt, pos_log.txt, poses_kitti.txt,
#     bag_odom/（rosbag2 MCAP: /Odometry /path /livox/imu /tf）, bag_odom_zstd/（同じ・zstd の塊圧縮）, bag_odom_only/（/odom だけ）
import sys, os, json, shutil
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from world import robot_path, sensor_pose_B, init_pose, B_to_M, scan, quat, BOX, CEIL

out = sys.argv[1]; per = int(sys.argv[2]) if len(sys.argv) > 2 else 2700
os.makedirs(out, exist_ok=True)
rs = np.random.default_rng(1)
path = robot_path()
R0, t0 = init_pose(path)
T_START = 1791886716.937  # 走り始めの時刻（UNIX 秒）

# ---- 点群（地図座標 M）
P, I, C = [], [], []
for k, (t, x, y, yaw) in enumerate(path):
    Rb, tb = sensor_pose_B(x, y, yaw)
    p, refl, dl, rng_ = scan(Rb, tb, per, rs)
    P.append(B_to_M(p, R0, t0)); I.append(refl)
    C.append(rs.uniform(0, 100, len(p)))  # FAST-LIO は curvature に走査内の時刻（ms）を入れる
P = np.concatenate(P).astype(np.float32); I = np.concatenate(I).astype(np.float32); C = np.concatenate(C).astype(np.float32)
n = len(P)
rec = np.zeros(n, dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('intensity', '<f4'), ('normal_x', '<f4'), ('normal_y', '<f4'), ('normal_z', '<f4'), ('curvature', '<f4')])
rec['x'], rec['y'], rec['z'] = P[:, 0], P[:, 1], P[:, 2]
rec['intensity'] = I; rec['curvature'] = C
head = (f"# .PCD v0.7 - Point Cloud Data file format\nVERSION 0.7\nFIELDS x y z intensity normal_x normal_y normal_z curvature\n"
        f"SIZE 4 4 4 4 4 4 4 4\nTYPE F F F F F F F F\nCOUNT 1 1 1 1 1 1 1 1\nWIDTH {n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS {n}\nDATA binary\n")
with open(os.path.join(out, 'scans.pcd'), 'wb') as f:
    f.write(head.encode()); f.write(rec.tobytes())

# ---- 正解（地図座標で）
def M(p): return B_to_M(np.array(p, float), R0, t0).tolist()
truth = {
    'n': n, 'R0': R0.tolist(), 't0': t0.tolist(),
    'mean': P.astype(np.float64).mean(0).tolist(), 'min': P.min(0).tolist(), 'max': P.max(0).tolist(),
    'corridor_width': 2.4, 'ceiling': CEIL, 'box': BOX, 'door_width': 1.0,
    'box_top_corners_M': [M([BOX['x'][i], BOX['y'][j], 0.8]) for i in (0, 1) for j in (0, 1)],
    'box_top_center_M': M([10.0, 0.5, 0.8]),
    'floor_point_M': M([20.0, 0.0, 0.0]), 'ceiling_point_M': M([20.0, 0.0, CEIL]),
    'wall_s_M': M([20.0, -1.2, 1.0]), 'wall_n_M': M([20.0, 1.2, 1.0]),
    'note': '地図座標 M = 走り始めのセンサーの座標（取り付けの傾き roll 1.5° pitch 4°、廊下に対して 7° ずれ、床は z≈-0.55 付近）',
}
json.dump(truth, open(os.path.join(out, 'truth.json'), 'w'), indent=1, ensure_ascii=False)

# ---- 軌跡（センサーの姿勢を地図座標で）
poses = []
for (t, x, y, yaw) in path:
    Rb, tb = sensor_pose_B(x, y, yaw)
    Rm = R0.T @ Rb; pm = B_to_M(tb, R0, t0)
    poses.append((T_START + t, pm, Rm))
with open(os.path.join(out, 'odom_tum.txt'), 'w') as f:
    for t, p, Rm in poses:
        q = quat(Rm); f.write(f"{t:.6f} {p[0]:.6f} {p[1]:.6f} {p[2]:.6f} {q[0]:.6f} {q[1]:.6f} {q[2]:.6f} {q[3]:.6f}\n")
with open(os.path.join(out, 'poses_kitti.txt'), 'w') as f:  # KITTI: 3x4 行列を 1 行 12 個（時刻なし）
    for t, p, Rm in poses:
        m = np.hstack([Rm, p[:, None]]).ravel(); f.write(' '.join(f'{v:.6e}' for v in m) + '\n')
with open(os.path.join(out, 'pos_log.txt'), 'w') as f:  # FAST-LIO の Log/pos_log.txt（時刻 euler(3) 位置(3) 外部 euler(3) 外部位置(3) 速度(3) bg(3) ba(3) 重力(3)）
    for t, p, Rm in poses:
        eul = [np.arctan2(Rm[2, 1], Rm[2, 2]), -np.arcsin(Rm[2, 0]), np.arctan2(Rm[1, 0], Rm[0, 0])]
        vals = [t - T_START, *eul, *p, 0, 0, 0, -0.011, -0.02344, 0.04412, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -9.81]
        f.write(' '.join(f'{v:.6f}' for v in vals) + '\n')

# ---- rosbag2（MCAP）
if os.environ.get('NOBAG'):
    print(json.dumps({'n': n, 'poses': len(path), 'out': out})); sys.exit(0)
from rosbags.rosbag2 import Writer, StoragePlugin, CompressionMode, CompressionFormat
from rosbags.typesys import Stores, get_typestore
ts = get_typestore(Stores.ROS2_JAZZY)
Odometry = ts.types['nav_msgs/msg/Odometry']; Header = ts.types['std_msgs/msg/Header']; Time = ts.types['builtin_interfaces/msg/Time']
PoseWC = ts.types['geometry_msgs/msg/PoseWithCovariance']; TwistWC = ts.types['geometry_msgs/msg/TwistWithCovariance']
Pose = ts.types['geometry_msgs/msg/Pose']; Point = ts.types['geometry_msgs/msg/Point']; Quat = ts.types['geometry_msgs/msg/Quaternion']
Twist = ts.types['geometry_msgs/msg/Twist']; Vec3 = ts.types['geometry_msgs/msg/Vector3']
Path = ts.types['nav_msgs/msg/Path']; PoseStamped = ts.types['geometry_msgs/msg/PoseStamped']
Imu = ts.types['sensor_msgs/msg/Imu']
TFMessage = ts.types['tf2_msgs/msg/TFMessage']; TransformStamped = ts.types['geometry_msgs/msg/TransformStamped']; Transform = ts.types['geometry_msgs/msg/Transform']

def stamp(t): s = int(t); return Time(sec=s, nanosec=int(round((t - s) * 1e9)) % 1000000000)
def pose_msg(p, Rm):
    q = quat(Rm); return Pose(position=Point(x=float(p[0]), y=float(p[1]), z=float(p[2])), orientation=Quat(x=float(q[0]), y=float(q[1]), z=float(q[2]), w=float(q[3])))

def write_bag(dirname, compression=None, topics=('odom', 'path', 'imu', 'tf'), odom_topic='/Odometry'):
    d = os.path.join(out, dirname)
    if os.path.exists(d): shutil.rmtree(d)
    w = Writer(d, version=9, storage_plugin=StoragePlugin.MCAP)
    if compression: w.set_compression(CompressionMode.STORAGE, CompressionFormat.ZSTD)
    with w:
        cons = {}
        if 'odom' in topics: cons['odom'] = w.add_connection(odom_topic, Odometry.__msgtype__, typestore=ts)
        if 'path' in topics: cons['path'] = w.add_connection('/path', Path.__msgtype__, typestore=ts)
        if 'imu' in topics: cons['imu'] = w.add_connection('/livox/imu', Imu.__msgtype__, typestore=ts)
        if 'tf' in topics: cons['tf'] = w.add_connection('/tf', TFMessage.__msgtype__, typestore=ts)
        path_poses = []
        for i, (t, p, Rm) in enumerate(poses):
            ns = int(t * 1e9)
            if 'imu' in topics:
                for j in range(20):  # 200 Hz
                    tt = t + j * 0.005
                    m = Imu(header=Header(stamp=stamp(tt), frame_id='livox_frame'), orientation=Quat(x=0., y=0., z=0., w=1.), orientation_covariance=np.zeros(9),
                            angular_velocity=Vec3(x=0., y=0., z=0.), angular_velocity_covariance=np.zeros(9),
                            linear_acceleration=Vec3(x=0.07, y=-0.03, z=0.998), linear_acceleration_covariance=np.zeros(9))
                    w.write(cons['imu'], int(tt * 1e9), ts.serialize_cdr(m, Imu.__msgtype__))
            if 'odom' in topics:
                m = Odometry(header=Header(stamp=stamp(t), frame_id='camera_init'), child_frame_id='body',
                             pose=PoseWC(pose=pose_msg(p, Rm), covariance=np.zeros(36)), twist=TwistWC(twist=Twist(linear=Vec3(x=0., y=0., z=0.), angular=Vec3(x=0., y=0., z=0.)), covariance=np.zeros(36)))
                w.write(cons['odom'], ns, ts.serialize_cdr(m, Odometry.__msgtype__))
            if 'tf' in topics:
                q = quat(Rm)
                m = TFMessage(transforms=[TransformStamped(header=Header(stamp=stamp(t), frame_id='camera_init'), child_frame_id='body',
                              transform=Transform(translation=Vec3(x=float(p[0]), y=float(p[1]), z=float(p[2])), rotation=Quat(x=float(q[0]), y=float(q[1]), z=float(q[2]), w=float(q[3]))))])
                w.write(cons['tf'], ns, ts.serialize_cdr(m, TFMessage.__msgtype__))
            if 'path' in topics:
                if i % 10 == 0: path_poses.append(PoseStamped(header=Header(stamp=stamp(t), frame_id='camera_init'), pose=pose_msg(p, Rm)))
                if i % 10 == 0:
                    m = Path(header=Header(stamp=stamp(t), frame_id='camera_init'), poses=list(path_poses))
                    w.write(cons['path'], ns, ts.serialize_cdr(m, Path.__msgtype__))

write_bag('bag_odom')
write_bag('bag_odom_zstd', compression=True)
write_bag('bag_path_only', topics=('path', 'imu'))
write_bag('bag_wheel_odom', topics=('odom', 'imu'), odom_topic='/odom')
print(json.dumps({'n': n, 'poses': len(poses), 'out': out}))
