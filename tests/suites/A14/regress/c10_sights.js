// C10 名所・裏通りツアー（細かい確かめをまとめて）
//   a) 軌跡だけ開いて「全体」→ 視点が合うか
//   b) 軌跡を 2 本（FAST-LIO の /Odometry と TUM）→ 色で区別できるか
//   c) ファイルを閉じて開き直したときの「1 色」の色がかぶらないか
//   d) 距離を 2 本測って、距離の道具を切ってから Delete → 見えない計測が消えないか
//   e) rosbag2 のフォルダ（拡張子なし）や metadata.yaml をドラッグしたときの知らせ
//   f) 座標と距離は同時に入らない（仕様）／Shift で水平な距離
'use strict';
const L = require('./lib.js');
(async () => {
  const { app, p, errors } = await L.launch('c10');
  const R = {};
  const msg = () => p.evaluate(() => document.getElementById('statMsg').textContent);
  // a)
  await L.open(p, [L.F + '/fastlio/bag_odom/bag_odom.mcap'], { input: '#trajInput' });
  const cam0 = await p.evaluate(() => window.__pcd.cam.position.toArray().map(v => +v.toFixed(2)));
  await p.click('[data-open="view"]'); await p.click('[data-view="fit"]'); await L.sleep(800);
  R.a_fitWithTrajOnly = { camBefore: cam0, camAfter: await p.evaluate(() => window.__pcd.cam.position.toArray().map(v => +v.toFixed(2))), msg: await msg() };
  await L.shot(p, 'c10_a_traj_only');
  // b)
  await L.open(p, [L.F + '/fastlio/odom_tum.txt'], { input: '#trajInput' });
  R.b_trajColors = await p.evaluate(() => window.__pcd.S.trajs.map(t => t.name + ':' + t.color));
  await p.evaluate(() => { let y; while ((y = document.querySelector('#trajList [data-act=tremove]'))) y.click(); });
  // c)
  await L.open(p, [L.F + '/liosam/GlobalMap.pcd']);
  await L.open(p, ['/home/claude/pcd-viewer/sample/formats/cc_cloud.xyz']);
  await p.click('[data-open="open"]');
  await p.click('#fileList li:first-child [data-act=remove]'); await L.sleep(300);
  await L.open(p, ['/home/claude/pcd-viewer/sample/formats/pcl_binary.pcd']);
  R.c_fileColors = await p.evaluate(() => window.__pcd.S.files.map(f => f.name + ':' + f.color));
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
  // d) 距離 2 本 → 道具を切る → Delete
  await L.open(p, [L.F + '/liosam/GlobalMap.pcd']);
  await p.evaluate(() => window.__pcd.setView('top', false)); await L.render(p);
  await p.click('[data-tool="measure"]');
  const box = await p.evaluate(() => { const r = window.__pcd.renderer.domElement.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  const tryClick = async (gx, gy) => { for (const d of [0, 6, -6, 12, -12, 20]) { const before = await p.evaluate(() => window.__pcd.S.measures.length + (window.__pcd.S.mPending ? 0.5 : 0)); await L.click(p, { x: box.l + box.w * gx + d, y: box.t + box.h * gy + d }); await L.sleep(800); const after = await p.evaluate(() => window.__pcd.S.measures.length + (window.__pcd.S.mPending ? 0.5 : 0)); if (after !== before) return true; } return false; };
  await tryClick(0.35, 0.5); await tryClick(0.45, 0.5); await tryClick(0.55, 0.5); await tryClick(0.65, 0.5);
  R.d_measuresMade = await p.evaluate(() => window.__pcd.S.measures.length);
  await p.click('[data-tool="measure"]'); await L.sleep(300); // 距離を切る（線は隠れる）
  await p.focus('[data-open="view"]').catch(() => {});
  await p.keyboard.press('Delete'); await L.sleep(300);
  R.d_afterDeleteWithToolOff = { measures: await p.evaluate(() => window.__pcd.S.measures.length), msg: await msg() };
  // f) 座標と距離
  await p.click('[data-tool="info"]'); await p.click('[data-tool="measure"]');
  R.f_tools = await p.evaluate(() => ({ ...window.__pcd.S.tools }));
  await p.click('[data-tool="measure"]');
  // e) フォルダ（拡張子なし）と metadata.yaml
  await p.evaluate(() => { window.__pcd.enqueue([new File([''], 'rosbag2_2026_10_17-14_00_00')]); });
  await L.sleep(1500); R.e_folderDrop = { msg: await msg(), err: await p.evaluate(() => !!document.getElementById('statMsg').style.color) };
  await p.evaluate(() => { window.__pcd.enqueue([new File(['rosbag2_bagfile_information:\n  version: 9\n  storage_identifier: mcap\n'], 'metadata.yaml')]); });
  await L.sleep(1500); R.e_yamlDrop = { msg: await msg() };
  // 背景を明るくしたときの軌跡（白）の見え方
  await L.open(p, [L.F + '/fastlio/bag_odom/bag_odom.mcap'], { input: '#trajInput' });
  await p.click('[data-open="settings"]');
  await p.evaluate(() => { const s = document.getElementById('bgLight'); s.value = 50; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await L.sleep(500); await L.shot(p, 'c10_bg50_traj');
  // h) 「床を z = 0 にする」は 0.4.1 から画面から外した（いつも元の原点のまま）ので確かめない
  R.h_pickAfterFloorToggle = '0.4.1 から画面にない（確かめない）';
  // g) 3 つ同時に選び、真ん中が開けないとき: 失敗の知らせに気づけるか（知らせの移り変わりを 0.1 秒ごとに記録）
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); window.__msgs = []; let last = ''; window.__mi = setInterval(() => { const t = document.getElementById('statMsg').textContent; if (t !== last) { window.__msgs.push(t); last = t; } }, 100); });
  await p.setInputFiles('#fileInput', [L.F + '/liosam/GlobalMap.pcd', L.F + '/wrong/empty.pcd', '/home/claude/pcd-viewer/sample/formats/pcl_binary.pcd']);
  await L.waitIdle(p); await L.sleep(1500);
  R.g_multiOpen = await p.evaluate(() => { clearInterval(window.__mi); return { msgs: window.__msgs, finalMsg: document.getElementById('statMsg').textContent, files: window.__pcd.S.files.map(f => f.name) }; });
  R.errors = errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e)).slice(0, 10);
  L.log(R);
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
