// 天井を隠したまま真上から点を選ぶと、見えていない天井の点が選ばれる（座標・距離）
//   1) 正解つきの地図（floor_h0.3: 床の検出が正しく働く高さ）で、箱の上面（床から 0.8 m）を真上からクリック
//   2) アプリ付属の sample/map.laz で、真上から画面の何か所かをクリックし、選ばれた点の高さと「隠す高さ」を比べる
'use strict';
const L = require('./lib.js');
const fs = require('fs');
(async () => {
  const { app, p, errors } = await L.launch('c1b');
  const R = {};
  const dir = L.F + '/floor_h0.3';
  const truth = JSON.parse(fs.readFileSync(dir + '/truth.json', 'utf8'));
  await L.open(p, [dir + '/scans.pcd']);
  R.level = (await L.state(p)).level; R.ceilZ = (await L.state(p)).ceilZ;
  await p.evaluate(() => window.__pcd.setView('top', false)); await L.render(p);
  await p.click('[data-tool="info"]');
  const B2M = b => { const R0 = truth.R0, t = truth.t0, d = [b[0] - t[0], b[1] - t[1], b[2] - t[2]]; return [0, 1, 2].map(j => d[0] * R0[0][j] + d[1] * R0[1][j] + d[2] * R0[2][j]); };
  const pickShown = async () => (await p.evaluate(() => (document.querySelector('.pcall.pin.sel .pc-box') || document.createElement('div')).innerText)).replace(/\n/g, ' ');
  // 箱の上面の中心（正解: 補正後 z = 0.8）
  let s = await L.screenOf(p, truth.box_top_center_M); await L.click(p, s); await L.sleep(1200);
  R.boxTop_hidden = await pickShown();
  await L.shot(p, 'c1b_01_top_pick_hidden');
  // 箱の横の床（正解: z = 0）
  s = await L.screenOf(p, B2M([12.0, 0.0, 0.0])); await L.click(p, s); await L.sleep(1200);
  R.floor_hidden = await pickShown();
  // 天井を表示して同じ所
  await p.keyboard.press('c'); await L.sleep(300);
  R.hideCeilAfterC = await p.evaluate(() => window.__pcd.S.hideCeil);
  s = await L.screenOf(p, truth.box_top_center_M); await L.click(p, s); await L.sleep(1200);
  R.boxTop_shown = await pickShown();
  await p.keyboard.press('c'); await L.sleep(300);
  // 距離: 床 → 箱の上面（正解: 高さの差 +0.8）
  await p.click('[data-tool="measure"]');
  s = await L.screenOf(p, B2M([10.0, -0.4, 0.0])); await L.click(p, s); await L.sleep(1200);
  s = await L.screenOf(p, truth.box_top_center_M); await L.click(p, s); await L.sleep(1500);
  R.measure_hidden = await p.evaluate(() => [...document.querySelectorAll('#measureTable tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')));
  await L.shot(p, 'c1b_02_top_measure_hidden');
  // 2) 付属の sample/map.laz
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
  await p.click('[data-tool="measure"]'); // 距離を切る
  await L.open(p, ['/home/claude/pcd-viewer/sample/map.laz']);
  await p.evaluate(() => window.__pcd.setView('top', false)); await L.render(p);
  await p.click('[data-tool="info"]');
  const st = await L.state(p);
  R.sample = { level: st.level, ceilZ: st.ceilZ, hideCeil: st.hideCeil, picks: [] };
  const box = await p.evaluate(() => { const r = window.__pcd.renderer.domElement.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  // 画面の中央付近の格子で点を選ぶ（選べた点の z を集める）
  for (let gy = 0.3; gy <= 0.7; gy += 0.1) for (let gx = 0.3; gx <= 0.7; gx += 0.1) {
    const h = await p.evaluate(async ({ x, y }) => { const h = await window.__pcd.pickAt(x, y, true); return h && h.world.toArray(); }, { x: box.l + box.w * gx, y: box.t + box.h * gy });
    if (h) R.sample.picks.push(+h[2].toFixed(2));
  }
  R.sample.pickedAboveHidePlane = R.sample.picks.filter(z => st.ceilZ != null && z > st.ceilZ).length;
  R.sample.total = R.sample.picks.length;
  await L.shot(p, 'c1b_03_sample_top');
  R.errors = errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e));
  L.log(R);
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
