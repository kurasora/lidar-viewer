// C4 ドラッグ＆ドロップで開いたときの「軌跡か点群か」の判定（app.js の isTrajectory をそのまま取り出して試す）
//   node c4_is_traj.mjs
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/claude/pcd-viewer/src/app.js', 'utf8');
const pick = name => { const i = src.indexOf(name); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); };
const code = [
  "const extOf = n => { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i + 1).toLowerCase(); };",
  pick('async function isTrajectory(file)'),
  'export { isTrajectory };',
].join('\n');
const { isTrajectory } = await import('data:text/javascript,' + encodeURIComponent(code));
const rows = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('\n') + '\n';
const pts = i => `${(i * 0.37 % 40).toFixed(4)},${(i * 0.11 % 3 - 1.2).toFixed(4)},${(i * 0.07 % 2.7).toFixed(4)}`;
const cases = [
  // [説明, ファイル名, 中身, 期待（true=軌跡）]
  ['CloudCompare の ASCII 書き出し（見出し //X,Y,Z,intensity,tag,line,timestamp）', 'livox_from_cc.txt', '//X,Y,Z,intensity,tag,line,timestamp\n' + rows(50, i => `${pts(i)},${i % 200},0,${i % 4},${1791886746.1 + i * 1e-5}`), false],
  ['CloudCompare の CSV 書き出し（見出し X,Y,Z,Original_cloud_index）', 'merged.csv', 'X,Y,Z,Original_cloud_index\n' + rows(50, i => `${pts(i)},${i % 2}`), false],
  ['Livox Viewer の CSV 書き出し', 'livox_viewer_export.csv', 'Version,Slot ID,LiDAR Index,Rsvd,Error Code,Timestamp Type,Data Type,Timestamp,X,Y,Z,Reflectivity,Tag,Ori_x,Ori_y,Ori_z,Ori_radius,Ori_theta,Ori_phi\n' + rows(50, i => `5,0,1,0,0,0,1,${1791886746100000000 + i * 10000},${pts(i)},${i % 200},0,0,0,0,0,0,0`), false],
  ['名前に path を含む点群（経路計画用の地図）', 'path_planning_map.txt', rows(50, i => pts(i).replace(/,/g, ' ') + ' 30'), false],
  ['名前に odom を含む点群', 'odom_map_cloud.csv', rows(50, i => pts(i) + ',30'), false],
  ['名前に pose を含む点群（pose graph の点）', 'pose_graph_points.txt', rows(50, i => pts(i).replace(/,/g, ' ')), false],
  ['TUM 形式の軌跡（名前に手がかりなし）', 'run1.txt', rows(50, i => `${1791886716.9 + i * 0.1} ${i * 0.05} 0 0 0 0 0 1`), true],
  ['見出し付き CSV の軌跡（timestamp,x,y,z,qx,qy,qz,qw）', 'run1.csv', 'timestamp,x,y,z,qx,qy,qz,qw\n' + rows(50, i => `${1791886716.9 + i * 0.1},${i * 0.05},0,0,0,0,0,1`), true],
  ['KITTI の poses.txt（名前に pose）', 'poses.txt', rows(50, i => `1 0 0 ${i * 0.05} 0 1 0 0 0 0 1 0`), 'KITTI'],
  ['見出しに "orientation" を含む点群 CSV（法線の向き）', 'scan_with_normals.csv', 'x,y,z,orientation_x,orientation_y,orientation_z\n' + rows(50, i => `${pts(i)},0,0,1`), false],
  ['見出しに "category" を含む点群（"ori" を含む語）', 'segmented.csv', 'x,y,z,category\n' + rows(50, i => `${pts(i)},${i % 5}`), false],
];
for (const [label, name, text, expect] of cases) {
  const got = await isTrajectory(new File([text], name));
  const ok = expect === 'KITTI' ? null : got === expect;
  console.log(JSON.stringify({ label, name, judgedAsTrajectory: got, expected: expect, ok }));
}
