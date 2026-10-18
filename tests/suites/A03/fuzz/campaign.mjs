// A03: 大量キャンペーンの job 生成。node campaign.mjs <kind> <out.jsonl>
//   kind = trunc | havoc | head | nl | token
import { writeFileSync, statSync } from 'node:fs';
import { seeds } from './seeds.mjs';

const kind = process.argv[2], out = process.argv[3];
const S = seeds();                       // Node で読める 55 種
const TEXT = /\.(asc|neu|xyz|pts|csv|txt|pcd|ply|vtk|obj|off|stl|poly|sx|soi|out|dxf|gltf|pn|pv)$/i;
const jobs = [];
const push = (id, s, mut) => jobs.push({ id, file: s.file, companions: s.companions, mut });

if (kind === 'trunc') {
  for (const s of S) {
    const sz = statSync(s.file).size;
    const fracs = [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999];
    const abs = [0, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 200, 256, 512];
    const cuts = new Set();
    for (const f of fracs) cuts.add(Math.max(0, Math.floor(sz * f)));
    for (const a of abs) if (a < sz) cuts.add(a);
    let i = 0;
    for (const at of [...cuts].sort((a, b) => a - b)) push(`trunc:${s.name}@${at}`, s, { op: 'trunc', at }), i++;
  }
} else if (kind === 'havoc') {
  const N = 40;
  for (const s of S) for (let k = 0; k < N; k++) push(`havoc:${s.name}#${k}`, s, { op: 'havoc', seed: 1000 + k * 7 + s.name.length * 131, k: 1 + (k % 4) });
} else if (kind === 'head') {
  const N = 24;
  for (const s of S) for (let k = 0; k < N; k++) push(`head:${s.name}#${k}`, s, { op: 'havoc', seed: 50 + k * 13 + s.name.length, k: 1 + (k % 3), head: 128, ops: ['flip', 'set', 'i32', 'insert', 'delete', 'token'] });
} else if (kind === 'nl') {
  for (const s of S) if (TEXT.test(s.name)) {
    push(`nl:${s.name}:crlf`, s, { op: 'nl', mode: 'crlf' });
    push(`nl:${s.name}:cr`, s, { op: 'nl', mode: 'cr' });
    push(`nl:${s.name}:mixed`, s, { op: 'nl', mode: 'mixed', seed: 7 });
    push(`enc:${s.name}:bom`, s, { op: 'bom' });
    push(`enc:${s.name}:utf16le`, s, { op: 'utf16' });
    push(`enc:${s.name}:utf16be`, s, { op: 'utf16', be: true });
  }
} else if (kind === 'token') {
  // 数の語を病的な値に（NaN/Inf/巨大/空 など）。テキスト系のみ
  for (const s of S) if (TEXT.test(s.name)) for (let k = 0; k < 30; k++) push(`token:${s.name}#${k}`, s, { op: 'token', seed: 3 + k * 17 + s.name.length, n: 1 + (k % 6), region: [0, Math.min(statSync(s.file).size, 4000)] });
} else throw new Error('unknown kind ' + kind);

writeFileSync(out, jobs.map(j => JSON.stringify(j)).join('\n') + '\n');
console.log(kind, jobs.length, 'jobs ->', out);
