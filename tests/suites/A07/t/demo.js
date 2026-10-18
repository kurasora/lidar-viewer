// demo.js — 画面だけで確かめられるライブ表示の試験（デモの にせ LiDAR を使う。Chromium＋計測用の写し proj）
//   ・大きな座標（UTM 風）の地図を開いているときの「今の点群を開く」の精度（グローバルシフトが掛かるか）
//   ・ライブ中のファイルの表示/非表示・閉じる、ライブ中の「座標」の点選び（隠れている地図の点を選ばないか）
//   heavy node t/demo.js
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info } = H;
const path = require('node:path');
const FMT = '/home/claude/pcd-viewer/sample/formats/';

async function open(page, files) {
  const n0 = await page.evaluate(() => window.__pcd.S.files.length);
  await page.setInputFiles('#fileInput', files);
  await page.waitForFunction(n => window.__pcd.S.files.length >= n || /赤|エラー/.test(''), n0 + files.length, { timeout: 120000 });
  await page.waitForTimeout(800);
}
async function snapErr(page) {
  // デモの点（LV.pos、センサーから見た座標）と、スナップショットのファイル（positions＋offset）の差
  return page.evaluate(async () => {
    const { LV, LIVE_MAX } = window.__lv;
    const idx = []; for (const b of LV.batches) for (let j = 0; j < b.n; j++) idx.push((b.start + j) % LIVE_MAX);
    const n0 = window.__pcd.S.files.length;
    document.getElementById('btnLiveSnap').click();
    const t0 = performance.now(); while (window.__pcd.S.files.length <= n0 && performance.now() - t0 < 60000) await new Promise(r => setTimeout(r, 100));
    const f = window.__pcd.S.files[window.__pcd.S.files.length - 1]; const o = window.__pcd.S.offset || [0, 0, 0];
    // スナップショットを撮った瞬間の LV（idx）と同じ順で並んでいる
    let maxErr = 0, sumErr = 0, k = 0;
    for (let i = 0; i < Math.min(f.n, idx.length); i++) {
      const s = idx[i];
      const e = Math.max(Math.abs(f.positions[3 * i] + o[0] - LV.pos[3 * s]), Math.abs(f.positions[3 * i + 1] + o[1] - LV.pos[3 * s + 1]), Math.abs(f.positions[3 * i + 2] + o[2] - LV.pos[3 * s + 2]));
      if (e > maxErr) maxErr = e; sumErr += e; k++;
    }
    return { name: f.name, n: f.n, snapN: idx.length, offset: o, maxErrM: maxErr, meanErrM: sumErr / Math.max(1, k) };
  });
}

(async () => {
  const br = await E.pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.join(H.W, 'proj', 'dist', 'index.html'));
  await page.waitForFunction(() => window.__lv && window.__pcd, null, { timeout: 60000 });

  // ---- 1. ふつうの座標の地図（PCD）でデモ → スナップショット（比べる基準）
  await open(page, [FMT + 'pcl_binary.pcd']);
  await page.click('[data-open="live"]'); await page.waitForTimeout(300);
  await page.click('#btnLiveDemo'); await page.waitForTimeout(1500);
  await page.click('#btnLivePause'); // 止めてから撮る（LV と比べるため）
  const e1 = await snapErr(page);
  check('G7-snapshot-exact-small-coords', e1.maxErrM < 1e-4, e1);
  await page.click('#btnLiveStop'); await page.waitForTimeout(300);
  // 全部閉じる
  await page.evaluate(() => { for (const b of [...document.querySelectorAll('#fileList [data-act=remove]')]) b.click(); });
  await page.waitForTimeout(800);

  // ---- 2. UTM 風の大きな座標の地図（LAS）を開いたままデモ → スナップショット
  await open(page, [FMT + 'laspy_utm.las']);
  const off = await page.evaluate(() => window.__pcd.S.offset);
  if (!(await page.isVisible('#btnLiveDemo'))) { await page.click('[data-open="live"]'); await page.waitForTimeout(300); } // ドックのボタンは開閉の切り替え
  await page.click('#btnLiveDemo'); await page.waitForTimeout(1500);
  await page.click('#btnLivePause');
  const e2 = await snapErr(page);
  check('G7-snapshot-exact-with-utm-map-open', e2.maxErrM < 1e-3, { ...e2, mapOffset: off, note: '大きな座標の地図を開いていると、スナップショットにもその地図のシフトが掛かり、float32 の丸めでセンサー座標が数 cm〜数十 cm ずれる' });
  await page.click('#btnLivePause'); // 再開

  // ---- 3. ライブ中のファイル操作と点選び
  const st = await page.evaluate(() => window.__pcd.S.files.map(f => ({ name: f.name, visibleFlag: f.visible, drawn: f.points.visible })));
  info('G8-files-during-live', { files: st, note: 'ライブ中は地図を隠すが、ファイル一覧のチェック（f.visible）は付いたまま' });
  // 座標（i）で画面の真ん中をクリック → 見えていない地図の点が選ばれるか
  const pick = await page.evaluate(async () => { try { const r = await window.__pcd.pickAt(innerWidth / 2, innerHeight / 2); return r ? { hit: true, file: r.file && r.file.name, p: r.p || r.point || null } : { hit: false }; } catch (e) { return { err: String(e) } } });
  info('G8-pick-during-live', { pick, note: 'ライブ中に「座標」で選ぶと、隠れている地図の点が選ばれるか（pickAt は f.visible のファイルから選ぶ）' });
  // ライブ中に地図のチェックを外す → 止める → 地図は？
  await page.evaluate(() => { const cb = document.querySelector('#fileList [data-act=vis]'); cb.click(); });
  await page.waitForTimeout(300);
  await page.click('#btnLiveStop'); await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__pcd.S.files.map(f => ({ name: f.name, checkbox: f.visible, drawn: f.points.visible })));
  check('G8-unchecked-during-live-stays-hidden', after.every(f => f.checkbox === f.drawn), { after, note: 'ライブ中にチェックを外した地図が、止めたあと「チェックなしなのに表示」になるか' });
  await page.screenshot({ path: path.join(H.W, 'logs', 'demo_after.png') });
  check('G9-demo-no-errors', errs.length === 0, errs);
  await br.close();
  H.save('demo');
  process.exit(0);
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
