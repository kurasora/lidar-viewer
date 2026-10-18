// C7 反対側のツアー（軌跡）: 軌跡の読み込み部品（src/trajectory.js）に、現実にありそうなファイルを渡す
//   node c7_traj_parse.mjs
//   正しい軌跡かどうかを「位置の範囲」「時刻が増えているか」「長さ」で判定し、黙って間違うものを見つける
import { readFileSync, existsSync } from 'node:fs';
const { parseTrajectory } = await import('/home/claude/pcd-viewer/src/trajectory.js');
const F = '/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv/work/A14/files';
const cases = [
  ['正しい: rosbag2 MCAP（/Odometry /path /imu /tf）', F + '/fastlio/bag_odom/bag_odom.mcap'],
  ['正しい: TUM', F + '/fastlio/odom_tum.txt'],
  ['zstd の塊圧縮の MCAP', F + '/fastlio/bag_odom_zstd/bag_odom_zstd.mcap'],
  ['/path だけの MCAP（FAST-LIO の nav_msgs/Path）', F + '/fastlio/bag_path_only/bag_path_only.mcap'],
  ['車輪のオドメトリ /odom だけの MCAP', F + '/fastlio/bag_wheel_odom/bag_wheel_odom.mcap'],
  ['KITTI の poses.txt（3x4 行列 12 列、時刻なし）', F + '/fastlio/poses_kitti.txt'],
  ['FAST-LIO の Log/pos_log.txt（25 列）', F + '/fastlio/pos_log.txt'],
  ['点群の ascii（x y z intensity）を軌跡として', '/home/claude/pcd-viewer/sample/formats/cc_cloud.txt'],
  ['PCD（ascii）を軌跡として', '/home/claude/pcd-viewer/sample/formats/pcl_ascii.pcd'],
];
// 正解の軌跡（TUM）
const truth = readFileSync(F + '/fastlio/odom_tum.txt', 'utf8').trim().split('\n').map(l => l.split(' ').map(Number));
for (const [label, f] of cases) {
  if (!existsSync(f)) { console.log(JSON.stringify({ label, missing: f })); continue; }
  const buf = readFileSync(f);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const t0 = Date.now();
  try {
    const r = parseTrajectory(ab);
    const n = r.count, P = r.poses;
    let len = 0, back = 0, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) { const v = P[8 * i + 1 + k]; mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); }
      if (i) { len += Math.hypot(P[8 * i + 1] - P[8 * i - 7], P[8 * i + 2] - P[8 * i - 6], P[8 * i + 3] - P[8 * i - 5]); if (P[8 * i] < P[8 * i - 8]) back++; }
    }
    // 正解と同じ数なら、位置のずれ
    let err = null;
    if (n === truth.length) { err = 0; for (let i = 0; i < n; i++) err = Math.max(err, Math.hypot(P[8 * i + 1] - truth[i][1], P[8 * i + 2] - truth[i][2], P[8 * i + 3] - truth[i][3])); }
    console.log(JSON.stringify({ label, ok: true, topic: r.topic, count: n, length_m: +len.toFixed(2), duration: +(P[8 * (n - 1)] - P[0]).toFixed(2), timeGoesBack: back, min: mn.map(v => +v.toFixed(2)), max: mx.map(v => +v.toFixed(2)), maxErrVsTruth: err == null ? null : +err.toFixed(4), ms: Date.now() - t0 }));
  } catch (e) { console.log(JSON.stringify({ label, ok: false, error: e.message, ms: Date.now() - t0 })); }
}
