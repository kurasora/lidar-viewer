// PhotoScan の .psz（zip）の中に、使わない 400 MB（0 だけ、圧縮後 0.4 MB）のファイル: 使うファイルだけ展開するべき
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { tryRead } from '../lib/read.mjs';
const f = join(process.env.TMPDIR || tmpdir(), 'a04_psz_bomb.psz');
if (!existsSync(f)) execFileSync(process.execPath, ['--no-warnings', join(dirname(fileURLToPath(import.meta.url)), 'gen_psz.mjs'), f]);
const z = readFileSync(f);
const t = await tryRead('a.psz', z);
console.log(`${(z.length / 1e6).toFixed(2)} MB の psz: ${t.ok ? 'n=' + t.r.n : 'エラー: ' + t.error}、RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
process.exit(0);
