// 種ファイルをそのまま（変異なし）で読む → 基準
import { writeFileSync } from 'node:fs';
import { seeds } from './seeds.mjs';
const out = [];
for (const s of seeds()) out.push({ id: `base:${s.name}`, file: s.file, companions: s.companions });
// 軌跡
out.push({ id: 'base:trajectory.txt', file: '/home/claude/pcd-viewer/sample/trajectory.txt', kind: 'traj' });
writeFileSync(process.argv[2], out.map(j => JSON.stringify(j)).join('\n') + '\n');
console.log(out.length, 'jobs');
