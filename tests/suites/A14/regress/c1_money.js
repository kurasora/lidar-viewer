// C1 お金のツアー: FAST-LIO の地図（scans.pcd）と /Odometry の bag を開き、見て・測る。正解（truth.json）と比べる
//   heavy xvfb-run -a -n 240 node c1_money.js
'use strict';
const L = require('./lib.js');
const fs = require('fs');
const truth = JSON.parse(fs.readFileSync(L.F + '/fastlio/truth.json', 'utf8'));
const parseBox = s => { const m = s.match(/X\s*(-?[\d.]+)\s*Y\s*(-?[\d.]+)\s*Z\s*(-?[\d.]+)/); return m ? m.slice(1, 4).map(Number) : null; };
(async () => {
  const { app, p, errors } = await L.launch('c1');
  const R = {};
  // 1. 地図を開く
  let t0 = Date.now();
  R.openMap = await L.open(p, [L.F + '/fastlio/scans.pcd']);
  R.openMap.wall = Date.now() - t0;
  await L.shot(p, 'c1_01_map');
  // 2. 軌跡（rosbag2 の MCAP）を開く
  R.openTraj = await L.open(p, [L.F + '/fastlio/bag_odom/bag_odom.mcap'], { input: '#trajInput' });
  R.trajStart = await p.evaluate(() => { const t = window.__pcd.S.trajs[0]; return t ? Array.from(t.P.slice(0, 3)) : null; });
  await L.shot(p, 'c1_02_traj');
  // 3. 真上から見て、座標の道具で箱の上面の中心をクリック（天井は既定で隠れている）
  await p.click('[data-open="view"]');
  await p.click('[data-view="top"]'); await L.sleep(800);
  await p.click('[data-tool="info"]');
  const tgt = truth.box_top_center_M;
  let s = await L.screenOf(p, tgt);
  await L.click(p, s); await L.sleep(1500);
  R.pickBoxTop_ceilHidden = { screen: s, shown: await p.evaluate(() => (document.querySelector('.pcall.pin.sel .pc-box') || document.createElement('div')).innerText), hideCeil: await p.evaluate(() => window.__pcd.S.hideCeil), ceilZ: await p.evaluate(() => window.__pcd.S.ceilZ) };
  await L.shot(p, 'c1_03_pick_top_ceilhidden');
  // 3b. 天井を表示してから同じ所
  await p.click('#btnCeil'); await L.sleep(500);
  s = await L.screenOf(p, tgt);
  await L.click(p, s); await L.sleep(1500);
  R.pickBoxTop_ceilShown = { shown: await p.evaluate(() => (document.querySelector('.pcall.pin.sel .pc-box') || document.createElement('div')).innerText), hideCeil: await p.evaluate(() => window.__pcd.S.hideCeil) };
  await p.click('#btnCeil'); await L.sleep(300); // 元に戻す（隠す）
  // 4. 斜めから見て箱の上面の中心（天井に遮られない向き）
  await p.click('[data-view="side"]'); await L.sleep(800);
  s = await L.screenOf(p, tgt);
  await L.click(p, s); await L.sleep(1500);
  R.pickBoxTop_side = { shown: await p.evaluate(() => (document.querySelector('.pcall.pin.sel .pc-box') || document.createElement('div')).innerText) };
  await L.shot(p, 'c1_04_pick_side');
  R.fileCoordOfBoxTop = tgt;
  R.level = await p.evaluate(() => { const r = window.__pcd.S.levelInfo; return r && { tilt: r.tiltDeg, yaw: r.yawDeg, floorZ: r.floorZ, R: r.R }; });
  R.levelText = await p.evaluate(() => document.getElementById('levelResult').textContent);
  // 5. 距離: 真上から、床（箱の横）→ 箱の上面。正解は 高さの差 +0.8 m・水平 0.5 m 前後
  await p.click('[data-view="top"]'); await L.sleep(800);
  await p.click('[data-tool="measure"]');
  // 箱の横の床（建物座標 (10.0, -0.3, 0)）を地図座標に
  const B2M = b => { const R0 = truth.R0, t = truth.t0, d = [b[0] - t[0], b[1] - t[1], b[2] - t[2]]; return [0, 1, 2].map(j => d[0] * R0[0][j] + d[1] * R0[1][j] + d[2] * R0[2][j]); };
  const floorNear = B2M([10.0, -0.3, 0.0]);
  s = await L.screenOf(p, floorNear); await L.click(p, s); await L.sleep(1200);
  s = await L.screenOf(p, tgt); await L.click(p, s); await L.sleep(1500);
  R.measureTop = await p.evaluate(() => [...document.querySelectorAll('#measureTable tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')));
  R.measureObj = await p.evaluate(() => window.__pcd.S.measures.map(m => ({ a: m.a.toArray(), b: m.b.toArray() })));
  await L.shot(p, 'c1_05_measure_top');
  // 6. 廊下の幅: 横断の断面で、壁から壁（x 方向の断面 → 正面から）
  R.errors = errors.slice(0, 20);
  L.log(R);
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
