// 試作ページに gzip + base64 で埋め込んだ別スレッドのコードを取り出す（中身を調べるため）
//   node extract_worker.mjs <pcd-viewer.html> <出力.js>
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const html = readFileSync(process.argv[2], 'utf8');
const i = html.indexOf('Uint8Array.from(atob("'); if (i < 0) throw new Error('埋め込みの別スレッドが見つかりません');
const s = i + 'Uint8Array.from(atob("'.length, e = html.indexOf('"', s);
const code = gunzipSync(Buffer.from(html.slice(s, e), 'base64')).toString('utf8');
writeFileSync(process.argv[3], code);
console.log('worker code', code.length, 'chars');
