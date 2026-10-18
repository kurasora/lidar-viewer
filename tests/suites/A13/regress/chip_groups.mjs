// samples.js のボタンごとのファイルの組を、browser_read.js の引数（組の区切りは --）にして出す
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/claude/pcd-viewer/src/samples.js', 'utf8').replace('export const SAMPLE_GROUPS', 'globalThis.G');
eval(src);
const dir = '/home/claude/pcd-viewer/sample/formats/';
const args = [];
for (const [, items] of globalThis.G) for (const [, files] of items) { if (args.length) args.push('--'); for (const f of files) args.push(dir + f); }
if (process.argv[2] === '--json') console.log(JSON.stringify(globalThis.G)); else console.log(args.join('\n'));
