# 軌跡の試験用ファイル（TUM などの文字、rosbag2 の MCAP）
#   MCAP は mcap（pip、$W/pylib）で書く。メッセージの中身（CDR）は自分で組み立てる
import struct, math, sys, os, numpy as np
from common import *
sys.path.insert(0, os.path.join(os.path.dirname(REG), 'pylib'))


def make_poses(m=400, t0=1.7e9, dt=0.1, origin=np.zeros(3)):
    t = t0 + np.arange(m) * dt
    s = np.linspace(0, 60, m)
    x = s + origin[0]; y = 2 * np.sin(s / 10) + origin[1]; z = 0.05 * np.cos(s / 7) + origin[2]
    yaw = np.arctan2(np.gradient(y), np.gradient(x))
    q = np.stack([np.zeros(m), np.zeros(m), np.sin(yaw / 2), np.cos(yaw / 2)], 1)  # qx qy qz qw
    return np.column_stack([t, x, y, z, q])


class Cdr:
    def __init__(self): self.b = bytearray(b'\x00\x01\x00\x00')
    def align(self, n):
        r = (len(self.b) - 4) % n
        if r: self.b += b'\x00' * (n - r)
    def i32(self, v): self.align(4); self.b += struct.pack('<i', v)
    def u32(self, v): self.align(4); self.b += struct.pack('<I', v)
    def f64(self, v): self.align(8); self.b += struct.pack('<d', v)
    def s(self, txt):
        e = txt.encode() + b'\x00'; self.u32(len(e)); self.b += e
    def header(self, t, frame):
        sec = int(math.floor(t)); ns = int(round((t - sec) * 1e9))
        if ns >= 1000000000: sec += 1; ns -= 1000000000
        self.i32(sec); self.u32(ns); self.s(frame)
    def pose(self, p):
        for v in p[1:8]: self.f64(float(v))


def odom(p):
    c = Cdr(); c.header(p[0], 'camera_init'); c.s('body'); c.pose(p)
    for _ in range(36): c.f64(0.0)
    for _ in range(6): c.f64(0.1)
    for _ in range(36): c.f64(0.0)
    return bytes(c.b)


def pose_stamped(p):
    c = Cdr(); c.header(p[0], 'map'); c.pose(p); return bytes(c.b)


def pose_cov(p):
    c = Cdr(); c.header(p[0], 'map'); c.pose(p)
    for _ in range(36): c.f64(0.0)
    return bytes(c.b)


MSGDEF = {
    'nav_msgs/msg/Odometry': 'std_msgs/Header header\nstring child_frame_id\ngeometry_msgs/PoseWithCovariance pose\ngeometry_msgs/TwistWithCovariance twist\n',
    'geometry_msgs/msg/PoseStamped': 'std_msgs/Header header\ngeometry_msgs/Pose pose\n',
    'geometry_msgs/msg/PoseWithCovarianceStamped': 'std_msgs/Header header\ngeometry_msgs/PoseWithCovariance pose\n',
    'sensor_msgs/msg/Imu': 'std_msgs/Header header\n',
}
ENC = {'nav_msgs/msg/Odometry': odom, 'geometry_msgs/msg/PoseStamped': pose_stamped, 'geometry_msgs/msg/PoseWithCovarianceStamped': pose_cov}


def write_mcap(fn, topics, compression='none', chunking=True, chunk_size=1 << 20):
    """topics: [(トピック名, 型, poses)]"""
    from mcap.writer import Writer, CompressionType
    comp = {'none': CompressionType.NONE, 'zstd': CompressionType.ZSTD, 'lz4': CompressionType.LZ4}[compression]
    with open(fn, 'wb') as f:
        w = Writer(f, chunk_size=chunk_size, compression=comp, use_chunking=chunking)
        w.start(profile='ros2', library='a01-test')
        chans = []
        for topic, ty, poses in topics:
            sid = w.register_schema(name=ty, encoding='ros2msg', data=MSGDEF[ty].encode())
            cid = w.register_channel(topic=topic, message_encoding='cdr', schema_id=sid)
            chans.append((cid, ty, poses))
        # 時刻順に混ぜて書く
        ev = []
        for cid, ty, poses in chans:
            for k, p in enumerate(poses): ev.append((p[0], cid, ty, k, p))
        ev.sort(key=lambda e: (e[0], e[1]))
        for t, cid, ty, k, p in ev:
            data = ENC[ty](p) if ty in ENC else b'\x00\x01\x00\x00' + b'\x00' * 16
            ns = int(t * 1e9)
            w.add_message(channel_id=cid, log_time=ns, publish_time=ns, data=data, sequence=k)
        w.finish()


def gen():
    P = make_poses()
    m = len(P)
    fmt8 = lambda p: ' '.join(f'{v:.9f}' if i == 0 else f'{v:.6f}' for i, v in enumerate(p))
    # 1) TUM（時刻 x y z qx qy qz qw）
    lines = [fmt8(p) for p in P]
    open(path('traj/tum.txt'), 'w').write('\n'.join(lines) + '\n')
    case('traj/tum_txt', ['traj/tum.txt'], 'TUM 形式（.txt、空白区切り 8 列）', kind='traj', node=True, n=m, poses=P)
    open(path('traj/tum.tum'), 'w').write('\n'.join(lines) + '\n')
    case('traj/tum_tum', ['traj/tum.tum'], 'TUM 形式（.tum）', kind='traj', node=True, n=m, poses=P)
    open(path('traj/tum_header.txt'), 'w').write('# timestamp tx ty tz qx qy qz qw\n' + '\n'.join(lines) + '\n')
    case('traj/tum_header', ['traj/tum_header.txt'], 'TUM 形式 + # の見出し', kind='traj', node=True, n=m, poses=P)
    open(path('traj/tum_crlf.txt'), 'wb').write(('\r\n'.join(lines) + '\r\n').encode())
    case('traj/tum_crlf', ['traj/tum_crlf.txt'], 'TUM 形式（CRLF）', kind='traj', node=True, n=m, poses=P)
    # 2) CSV（見出しあり・カンマ）、セミコロン、タブ
    open(path('traj/traj.csv'), 'w').write('timestamp,x,y,z,qx,qy,qz,qw\n' + '\n'.join(l.replace(' ', ',') for l in lines) + '\n')
    case('traj/csv_header', ['traj/traj.csv'], 'CSV（見出し timestamp,x,y,z,qx,qy,qz,qw）', kind='traj', node=True, n=m, poses=P)
    open(path('traj/traj_semicolon.csv'), 'w').write('timestamp;x;y;z;qx;qy;qz;qw\n' + '\n'.join(l.replace(' ', ';') for l in lines) + '\n')
    case('traj/csv_semicolon', ['traj/traj_semicolon.csv'], 'CSV（セミコロン区切り）', kind='traj', node=True, n=m, poses=P, extra={'note': '読めるか、分かりやすい知らせ'})
    open(path('traj/traj_tab.txt'), 'w').write('\n'.join(l.replace(' ', '\t') for l in lines) + '\n')
    case('traj/tab', ['traj/traj_tab.txt'], 'TUM 形式（タブ区切り）', kind='traj', node=True, n=m, poses=P)
    # 3) 4 列（時刻 x y z）
    open(path('traj/t_xyz.txt'), 'w').write('\n'.join(' '.join(f'{v:.6f}' for v in p[:4]) for p in P) + '\n')
    P4 = P.copy(); P4[:, 4:7] = 0; P4[:, 7] = 1
    case('traj/t_xyz', ['traj/t_xyz.txt'], '4 列（時刻 x y z）', kind='traj', node=True, n=m, poses=P4)
    # 4) 別の形式（黙って誤読しないか）: KITTI（3×4 行列 12 列、時刻なし）、FAST-LIO の pos_log（25 列）、時刻が ns
    rows = []
    for p in P:
        qx, qy, qz, qw = p[4:8]
        R = np.array([[1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)], [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)], [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)]])
        M = np.hstack([R, p[1:4, None]])
        rows.append(' '.join(f'{v:.6e}' for v in M.ravel()))
    open(path('traj/kitti.txt'), 'w').write('\n'.join(rows) + '\n')
    case('traj/kitti', ['traj/kitti.txt'], 'KITTI 形式（3×4 の行列 12 列、時刻なし）', kind='traj', node=True, n=m, poses=P, extra={'note': '正しく読むか、読めない旨を知らせる（黙って違う軌跡にしない）'})
    rows = []
    for p in P:
        yaw = 2 * math.atan2(p[6], p[7])
        rows.append(' '.join(f'{v:.6f}' for v in [p[0] - P[0, 0], 0, 0, yaw, p[1], p[2], p[3], 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -9.81]))
    open(path('traj/fastlio_pos_log.txt'), 'w').write('\n'.join(rows) + '\n')
    Pf = P.copy(); Pf[:, 0] -= P[0, 0]
    case('traj/fastlio_pos_log', ['traj/fastlio_pos_log.txt'], 'FAST-LIO の Log/pos_log.txt（時刻・オイラー角 3・位置 3・… 25 列）', kind='traj', node=True, n=m, poses=Pf, extra={'note': '正しく読むか、読めない旨を知らせる'})
    Pns = P.copy(); Pns[:, 0] = np.round(P[:, 0] * 1e9)
    open(path('traj/tum_ns.txt'), 'w').write('\n'.join(' '.join([f'{int(p[0])}'] + [f'{v:.6f}' for v in p[1:]]) for p in Pns) + '\n')
    case('traj/tum_ns', ['traj/tum_ns.txt'], '時刻が ns の整数（ROS 2 の stamp をそのまま書いたもの）', kind='traj', node=True, n=m, poses=Pns, extra={'note': '秒の表示が 1e9 倍にならないか'})
    # 5) UTM の軌跡（UTM の点群と重なるか: シナリオ試験で使う）
    PU = make_poses(origin=UTM)
    open(path('traj/utm.txt'), 'w').write('\n'.join(fmt8(p) for p in PU) + '\n')
    case('traj/utm', ['traj/utm.txt'], 'UTM の軌跡（539000, 3836000 付近）', kind='traj', node=True, n=m, poses=PU)
    # 6) MCAP（rosbag2）: チャンクあり無圧縮（rosbag2 の既定）・チャンクなし（fastwrite）・zstd・lz4、Odometry / PoseStamped / PoseWithCovarianceStamped
    for tag, comp, chunk in (('chunk_none', 'none', True), ('nochunk', 'none', False), ('zstd', 'zstd', True), ('lz4', 'lz4', True)):
        write_mcap(path(f'traj/odom_{tag}.mcap'), [('/Odometry', 'nav_msgs/msg/Odometry', P)], compression=comp, chunking=chunk, chunk_size=4096)
        case(f'traj/mcap_odom_{tag}', [f'traj/odom_{tag}.mcap'], f'MCAP: /Odometry（{tag}、チャンク 4 KB）', kind='traj', node=True, n=m, poses=P,
             extra={'note': '圧縮は対応外と知らせるのは仕様どおり' if comp != 'none' else ''})
    write_mcap(path('traj/posestamped.mcap'), [('/pose', 'geometry_msgs/msg/PoseStamped', P)])
    case('traj/mcap_posestamped', ['traj/posestamped.mcap'], 'MCAP: PoseStamped（既定の zstd 圧縮の mcap ライブラリで書いたもの）', kind='traj', node=True, n=m, poses=P)
    write_mcap(path('traj/posestamped_raw.mcap'), [('/pose', 'geometry_msgs/msg/PoseStamped', P)], compression='none')
    case('traj/mcap_posestamped_raw', ['traj/posestamped_raw.mcap'], 'MCAP: PoseStamped（無圧縮）', kind='traj', node=True, n=m, poses=P)
    write_mcap(path('traj/posecov_raw.mcap'), [('/amcl_pose', 'geometry_msgs/msg/PoseWithCovarianceStamped', P)], compression='none')
    case('traj/mcap_posecov_raw', ['traj/posecov_raw.mcap'], 'MCAP: PoseWithCovarianceStamped（無圧縮）', kind='traj', node=True, n=m, poses=P)
    # 2 つのトピック（/Odometry は 100 個、/pose は 400 個）→ /Odometry を優先する作り
    write_mcap(path('traj/two_topics.mcap'), [('/Odometry', 'nav_msgs/msg/Odometry', P[::4]), ('/pose', 'geometry_msgs/msg/PoseStamped', P), ('/imu', 'sensor_msgs/msg/Imu', P)], compression='none')
    case('traj/mcap_two_topics', ['traj/two_topics.mcap'], 'MCAP: /Odometry 100 個 + /pose 400 個 + /imu（/Odometry を使う作り）', kind='traj', node=True, n=m // 4, poses=P[::4])
    # 大きな MCAP（2 万姿勢、チャンク 1 MB）
    PB = make_poses(m=20000, dt=0.01)
    write_mcap(path('traj/odom_big.mcap'), [('/Odometry', 'nav_msgs/msg/Odometry', PB)], compression='none')
    case('traj/mcap_odom_big', ['traj/odom_big.mcap'], 'MCAP: /Odometry 2 万姿勢（無圧縮、チャンク 1 MB）', kind='traj', node=True, n=20000, poses=PB)
