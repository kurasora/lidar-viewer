// ring.js — 画面側のライブの入れ物（輪のように使い回す LIVE_MAX=150 万点）の白箱試験。計測用の写し（proj、window.__lv を足しただけ）を Chromium で開く
//   heavy node t/ring.js
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info } = H;
const path = require('node:path');

(async () => {
  const br = await E.pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await br.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(H.W, 'proj', 'dist', 'index.html'));
  await page.waitForFunction(() => window.__lv && window.__pcd, null, { timeout: 60000 });

  // 1. 入れ物があふれたあと、全部の点の時間が切れても、消えずに残る点（輪の上書きで一覧から外れた箱の残り）
  const r1 = await page.evaluate(() => {
    const { LV, LIVE_MAX } = window.__lv;
    LV.src = { kind: 'test', label: 't' }; LV.persist = 5; LV.paused = false;
    const mk = n => { const xyz = new Float32Array(n * 3), refl = new Uint8Array(n); for (let i = 0; i < n; i++) { xyz[3 * i] = i % 100; xyz[3 * i + 1] = 1; xyz[3 * i + 2] = 0.5; refl[i] = 77; } return { n, xyz, refl }; };
    const b = mk(70000);
    for (let k = 0; k < 23; k++) window.__lv.liveIngest(b); // 161 万点（150 万点を超える）
    const visible0 = (() => { let c = 0; for (let i = 0; i < LIVE_MAX; i++) if (LV.col[4 * i + 3]) c++; return c; })();
    const tracked = LV.total;
    window.__lv.liveExpire(performance.now() + 60000); // 全部の箱の時間切れ
    let ghosts = 0; for (let i = 0; i < LIVE_MAX; i++) if (LV.col[4 * i + 3]) ghosts++;
    return { LIVE_MAX, ingested: 23 * 70000, visibleBeforeExpire: visible0, trackedBeforeExpire: tracked, batchesLeft: LV.batches.length, totalAfter: LV.total, ghostsAfterExpire: ghosts };
  });
  check('G5-ring-no-ghosts-after-expire', r1.ghostsAfterExpire === 0, { ...r1, note: '時間が切れても透明にならず残る点（ghosts）。上書きで追い出した箱のうち、上書きされなかった後ろの部分が一覧から外れて二度と消えない' });

  // 2. 重ねる時間どおりに消えるか（溢れない量）
  const r2 = await page.evaluate(async () => {
    const { LV, LIVE_MAX } = window.__lv;
    LV.col.fill(0); LV.batches = []; LV.total = 0; LV.head = 0; LV.persist = 1.0;
    const n = 10000, xyz = new Float32Array(n * 3).fill(1), refl = new Uint8Array(n).fill(10);
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) window.__lv.liveIngest({ n, xyz, refl });
    const at = dt => { window.__lv.liveExpire(t0 + dt); return LV.total; };
    return { after0_5s: at(500), after0_99s: at(990), after1_01s: at(1010 + (performance.now() - t0)) };
  });
  check('G5-persist-expiry', r2.after0_5s === 100000 && r2.after1_01s === 0, r2);

  // 3. 高さの色: NaN の点が 1 つ来ると、その後ずっと高さの色が壊れる（配信からの float は NaN になりうる）
  const r3 = await page.evaluate(() => {
    const { LV } = window.__lv;
    LV.col.fill(0); LV.batches = []; LV.total = 0; LV.head = 0; LV.persist = 1;
    LV.color = 'height';
    const n = 2000, xyz = new Float32Array(n * 3), refl = new Uint8Array(n);
    for (let i = 0; i < n; i++) { xyz[3 * i] = i; xyz[3 * i + 1] = 0; xyz[3 * i + 2] = (i % 30) / 10; }
    window.__lv.liveIngest({ n, xyz, refl });
    const before = { zLo: LV.zLo, zHi: LV.zHi, col0: [...LV.col.subarray(0, 4)] };
    xyz[2] = NaN; window.__lv.liveIngest({ n, xyz, refl });
    xyz[2] = 0; for (let k = 0; k < 5; k++) window.__lv.liveIngest({ n, xyz, refl });
    const last = 4 * ((LV.head - 1 + 1500000) % 1500000);
    return { before, after: { zLo: LV.zLo, zHi: LV.zHi, colLast: [...LV.col.subarray(last, last + 4)] } };
  });
  info('G6-nan-breaks-height-color', { ...r3, note: 'NaN の点が一度でも来ると zLo/zHi が NaN のままになり、高さの色がすべて同じ色（LUT の範囲外＝黒 0,0,0）になる' });

  // 4. 1 回の箱が LIVE_MAX を超える（配信元から 700 万点のメッセージなど）
  const r4 = await page.evaluate(() => {
    const { LV, LIVE_MAX } = window.__lv;
    LV.col.fill(0); LV.batches = []; LV.total = 0; LV.head = 0; LV.color = 'refl';
    const n = 2000000, xyz = new Float32Array(n * 3), refl = new Uint8Array(n);
    const t0 = performance.now(); window.__lv.liveIngest({ n, xyz, refl }); const ms = performance.now() - t0;
    return { total: LV.total, head: LV.head, batches: LV.batches.length, ms: Math.round(ms) };
  });
  info('G5-oversize-batch', r4);
  check('G9-ring-no-page-errors', errs.length === 0, errs);
  await br.close();
  H.save('ring');
  process.exit(0);
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
