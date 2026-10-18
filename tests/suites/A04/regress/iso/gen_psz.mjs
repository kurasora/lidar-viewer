// psz_bomb.mjs が使う試験用ファイルを作る（別プロセス）: node gen_psz.mjs <出力パス>
import { writeFileSync } from 'node:fs';
import { src } from '../lib/harness.mjs';
const { zipSync, strToU8 } = await import(src('node_modules/fflate/esm/index.mjs'));
const ply = 'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n';
const z = zipSync({ 'doc.xml': strToU8('<document><chunk><frames><frame path="f.zip"/></frames></chunk></document>'), 'f.zip': zipSync({ 'doc.xml': strToU8('<frame><point_cloud><points path="p.ply"/></point_cloud></frame>'), 'p.ply': strToU8(ply) }), 'images/depth.bin': new Uint8Array(400e6) }, { level: 9 });
writeFileSync(process.argv[2], z);
