// E57（手書きの試験用ファイル）と LAS（laspy で作るファイル）の単体試験
import { test, isoTest, eq, ok, near, setFile } from './lib/harness.mjs';
import { read, tryRead, isJapanese } from './lib/read.mjs';
import { buildE57 } from './e57w.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
setFile('t_e57_las');
const here = dirname(fileURLToPath(import.meta.url));
const XYZ = [{ name: 'cartesianX', type: 'Float' }, { name: 'cartesianY', type: 'Float' }, { name: 'cartesianZ', type: 'Float' }];

test('OK-E01', 'E57 bitPack: ビット幅 1〜53・パケットの境目（1/3/7 バイトごと）をまたぐ値・負の最小値の ScaledInteger・single/double', async () => {
  let s = 12345; const g = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let bits = 1; bits <= 53; bits++) for (const chunk of [1, 3, 7, 4096]) {
    const max = 2 ** bits - 1, n = 40, recs = [];
    for (let i = 0; i < n; i++) recs.push([(-500 + i) * 0.001 - 3.25, i * 0.5, 0.125 * i, i === 0 ? 0 : i === 1 ? max : Math.floor(g() * (max + 1))]);
    const fields = [{ name: 'cartesianX', type: 'ScaledInteger', min: -10000, max: 100000, scale: 0.001, offset: -3 }, { name: 'cartesianY', type: 'Float', precision: 'double' }, { name: 'cartesianZ', type: 'Float', precision: 'single' }, { name: 'intensity', type: 'Integer', min: 0, max }];
    const r = await read('b.e57', buildE57({ scans: [{ fields, records: recs, chunk }] }));
    eq(r.n, n, `bits=${bits} chunk=${chunk}`);
    for (let i = 0; i < n; i++) { near(r.pt(i), recs[i].slice(0, 3), 2e-6, `bits=${bits} chunk=${chunk} i=${i}`); eq(r.fields.intensity[i], Math.fround(recs[i][3]), `強度 bits=${bits} chunk=${chunk} i=${i}`); }
  }
}, { timeout: 180000 });
test('A04-042', 'E57 bitPack: 範囲（最大 − 最小）がちょうど 2^k（k = 40〜52）のときもビット数を正しく数える（k+1 ビット）', async () => {
  const bad = [];
  for (let k = 40; k <= 52; k++) {
    const max = 2 ** k, recs = [[0, 0, 0, 0], [1, 0, 0, max], [2, 0, 0, 12345]];
    const r = await read('k.e57', buildE57({ scans: [{ fields: [...XYZ, { name: 'intensity', type: 'Integer', min: 0, max }], records: recs }] }));
    const got = Array.from(r.fields.intensity);
    if (r.n !== 3 || got[1] !== Math.fround(max) || got[2] !== 12345) bad.push(`k=${k}: n=${r.n} ${JSON.stringify(got)}`);
  }
  ok(!bad.length, bad.slice(0, 4).join(' / '));
});
test('OK-E02', 'E57: 無効な点（cartesianInvalidState 1・2）を除き、定数の欄（bits 0）を扱う・ページの境目（CRC）をまたぐ', async () => {
  const fields = [...XYZ, { name: 'cartesianInvalidState', type: 'Integer', min: 0, max: 2 }, { name: 'rowIndex', type: 'Integer', min: 7, max: 7 }];
  const recs = []; for (let i = 0; i < 3000; i++) recs.push([i, 1, 1, i % 3 === 0 ? 0 : i % 3, 7]);
  const r = await read('inv.e57', buildE57({ scans: [{ fields, records: recs, chunk: 333 }] }));
  eq(r.n, 1000); eq(r.pt(1), [3, 1, 1]);
});
test('OK-E03', 'E57: 球座標・姿勢（四元数 + 平行移動）・正規化されていない四元数', async () => {
  const sph = await read('s.e57', buildE57({ scans: [{ fields: [{ name: 'sphericalRange', type: 'Float' }, { name: 'sphericalAzimuth', type: 'Float' }, { name: 'sphericalElevation', type: 'Float' }], records: [[2, 0, 0], [2, Math.PI / 2, 0], [2, 0, Math.PI / 2], [Math.SQRT2, Math.PI / 4, 0]] }] }));
  near([0, 1, 2, 3].flatMap(i => sph.pt(i)), [2, 0, 0, 0, 2, 0, 0, 0, 2, 1, 1, 0], 1e-9);
  const c = Math.SQRT1_2;
  const p = await read('p.e57', buildE57({ scans: [{ fields: XYZ, records: [[1, 0, 0], [0, 1, 0]], pose: { q: [c, 0, 0, c], t: [10, 20, 30] } }] }));
  near([...p.pt(0), ...p.pt(1)], [10, 21, 30, 9, 20, 30], 1e-9);
  const p2 = await read('p2.e57', buildE57({ scans: [{ fields: XYZ, records: [[1, 0, 0]], pose: { q: [2 * c, 0, 0, 2 * c] } }] }));
  near(p2.pt(0), [0, 1, 0], 1e-9);
});
const mixed = () => buildE57({ scans: [
  { fields: [...XYZ, { name: 'intensity', type: 'Integer', min: 0, max: 4095 }], records: Array.from({ length: 50 }, (_, i) => [i, 0, 0, 1000 + i]) },
  { fields: [...XYZ, { name: 'colorRed', type: 'Integer', min: 0, max: 255 }, { name: 'colorGreen', type: 'Integer', min: 0, max: 255 }, { name: 'colorBlue', type: 'Integer', min: 0, max: 255 }], records: Array.from({ length: 50 }, (_, i) => [i, 100, 0, 255, 0, 0]) },
] });
test('A04-012', 'E57: 色のないスキャンのあとに色のあるスキャンがあるとき、色のない点は灰色（黒にしない）', async () => {
  const r = await read('mix.e57', mixed());
  const cols = new Set(); for (let i = 0; i < r.n; i++) if (r.pt(i)[1] < 50) cols.add(r.col(i).join(','));
  eq([...cols], ['200,200,200']);
});
test('A04-012', 'E57: 間引き（cap 30）で、強度のないスキャンの点に別のスキャンの強度を残さない', async () => {
  const r = await read('mix.e57', mixed(), { cap: 30 });
  let stale = 0, n2 = 0; for (let i = 0; i < r.n; i++) if (r.pt(i)[1] > 50) { n2++; if (r.fields.intensity[i] !== 0) stale++; }
  eq(stale, 0, `${n2} 点中`);
});
isoTest('A04-025', 'E57: 頭書きのページの大きさが異常（4 バイト）でも止まらずにエラーを返す（5 秒以内）', 'iso/e57_page4.mjs', { timeoutMs: 5000, memMB: 400 });
test('OK-E04', 'E57: recordCount が実際より多い（途中で切れた）ときは日本語のエラー', async () => {
  const t = await tryRead('t.e57', buildE57({ scans: [{ fields: XYZ, records: [[1, 2, 3], [4, 5, 6]], recordCount: 1000 }] }));
  ok(!t.ok && isJapanese(t.error), t.error);
});

// ---- LAS（laspy でファイルを作る。なければ飛ばす）
let LASDIR = process.env.LAS_DIR || null;
function lasDir() {
  if (LASDIR && existsSync(join(LASDIR, 'expect.json'))) return LASDIR;
  const d = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'a04las-'));
  execFileSync('python3', [join(here, 'gen_las.py'), d], { stdio: 'pipe' });
  return (LASDIR = d);
}
test('OK-L01', 'LAS 点の形式 0〜10: 座標・強度・リターン番号・分類・点の元 ID・GPS 時刻（最初からの差）・RGB（16 bit → 8 bit）が全点一致', async () => {
  const D = lasDir(), E = JSON.parse(readFileSync(join(D, 'expect.json'), 'utf8'));
  for (let pf = 0; pf <= 10; pf++) {
    const e = E['pf' + pf], r = await read(`pf${pf}.las`, readFileSync(join(D, `pf${pf}.las`)));
    eq(r.n, 1000, `形式 ${pf}`);
    for (let i = 0; i < r.n; i++) {
      near(r.pt(i), [i * 0.01, -i * 0.02, 5 + i * 0.001], 1e-4, `形式 ${pf} 座標 ${i}`);
      eq([r.fields.intensity[i], r.fields.return_number[i], r.fields.classification[i], r.fields.point_source_id[i]], [e.intensity[i], e.return_number[i], e.classification[i], e.point_source_id[i]], `形式 ${pf} 点 ${i}`);
      if (e.gps_time) near(r.fields.gps_time[i], e.gps_time[i], 1e-3, `形式 ${pf} GPS ${i}`); else ok(!r.fields.gps_time, `形式 ${pf} に GPS 時刻の欄`);
      if (e.rgb16) eq(r.col(i), [e.rgb16[0][i] >> 8, e.rgb16[1][i] >> 8, e.rgb16[2][i] >> 8], `形式 ${pf} 色 ${i}`); else ok(!r.rgb, `形式 ${pf} に色`);
    }
  }
}, { timeout: 120000 });
test('A04-013', 'LAS: 先頭 2.5 万点が黒で、残りが 16 bit の色（v<<8）でも、残りの色が正しい', async () => {
  const D = lasDir(), E = JSON.parse(readFileSync(join(D, 'expect.json'), 'utf8'));
  const r = await read('dark256.las', readFileSync(join(D, 'dark256.las')));
  let bad = 0; for (let i = E.dark.first_colored; i < r.n; i++) if (r.col(i)[0] !== E.dark.v[i]) bad++;
  eq(bad, 0, `色の誤り（${r.n - E.dark.first_colored} 点中）`);
});
test('OK-L02', 'LAS: 先頭が黒で残りが v×257 の色（偶然下位バイトが同じ）', async () => {
  const D = lasDir(), E = JSON.parse(readFileSync(join(D, 'expect.json'), 'utf8'));
  const r = await read('dark257.las', readFileSync(join(D, 'dark257.las')));
  let bad = 0; for (let i = E.dark.first_colored; i < r.n; i++) if (r.col(i)[0] !== E.dark.v[i]) bad++;
  eq(bad, 0);
});
test('OK-L03', 'LAS: 点数より短いファイルは読めた所まで表示（エラーにしない）', async () => {
  const D = lasDir();
  const r = await read('truncated.las', readFileSync(join(D, 'truncated.las')));
  eq([r.n, r.total], [1000, 1000]);
});
test('A04-026', 'LAS: 頭書き（227 バイト）より短いファイルは日本語のエラー', async () => {
  const D = lasDir();
  const t = await tryRead('short.las', readFileSync(join(D, 'pf0.las')).subarray(0, 100));
  ok(!t.ok && isJapanese(t.error), `${t.name}: ${t.error}`);
});
