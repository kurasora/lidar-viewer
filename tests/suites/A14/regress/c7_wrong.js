// C7 反対側のツアー（間違った使い方）をアプリ version でまとめて
//   空のファイル、軌跡でないものを軌跡として、CloudCompare の書き出しをドラッグ、同じファイルを 2 回、巨大な画像（最後）
'use strict';
const L = require('./lib.js');
const fs = require('fs');
const WR = L.F + '/wrong';
(async () => {
  const { app, p, errors } = await L.launch('c7');
  let crashed = false; p.on('crash', () => { crashed = true; });
  const R = { steps: [] };
  const step = async (label, fn) => {
    await p.evaluate(() => { document.getElementById('statMsg').textContent = ''; });
    const t0 = Date.now();
    let st;
    try { st = await fn(); } catch (e) { st = { error: e.message }; }
    const s = crashed ? { crashed: true } : await L.state(p).catch(e => ({ stateError: e.message }));
    R.steps.push({ label, ms: Date.now() - t0, msg: s.msg, msgErr: s.msgErr, files: (s.files || []).map(f => `${f.name}:${f.n}`), trajs: (s.trajs || []).map(t => `${t.name}:${t.count}姿勢:${t.length}m:${(t.duration || 0).toFixed(1)}s`), crashed: s.crashed, timedOut: st && st.timedOut });
    if (!crashed) await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); let y; while ((y = document.querySelector('#trajList [data-act=tremove]'))) y.click(); });
  };
  for (const e of ['pcd', 'las', 'laz', 'txt', 'e57', 'ply', 'bin']) await step(`空の .${e} を「点群を開く」`, () => L.open(p, [`${WR}/empty.${e}`], { wait: 30000 }));
  await step('空の .mcap を「軌跡を開く」', () => L.open(p, [`${WR}/empty.mcap`], { input: '#trajInput', wait: 30000 }));
  await step('KITTI の poses.txt を「軌跡を開く」', () => L.open(p, [L.F + '/fastlio/poses_kitti.txt'], { input: '#trajInput' }));
  await step('FAST-LIO の pos_log.txt を「軌跡を開く」', () => L.open(p, [L.F + '/fastlio/pos_log.txt'], { input: '#trajInput' }));
  await step('点群（cc_cloud.txt）を「軌跡を開く」', () => L.open(p, ['/home/claude/pcd-viewer/sample/formats/cc_cloud.txt'], { input: '#trajInput' }));
  await step('zstd の MCAP を「軌跡を開く」', () => L.open(p, [L.F + '/fastlio/bag_odom_zstd/bag_odom_zstd.mcap'], { input: '#trajInput' }));
  await step('/path だけの MCAP を「軌跡を開く」', () => L.open(p, [L.F + '/fastlio/bag_path_only/bag_path_only.mcap'], { input: '#trajInput' }));
  for (const f of fs.existsSync(L.F + '/cc') ? fs.readdirSync(L.F + '/cc').filter(n => /\.(txt|csv)$/.test(n)) : []) {
    await step(`CloudCompare の書き出し ${f} をドラッグ`, () => L.drop(p, [L.F + '/cc/' + f]));
    await step(`CloudCompare の書き出し ${f} を「点群を開く」`, () => L.open(p, [L.F + '/cc/' + f]));
  }
  await step('同じファイルを 2 回続けて選ぶ', async () => { await p.setInputFiles('#fileInput', L.F + '/liosam/GlobalMap.pcd'); await p.setInputFiles('#fileInput', L.F + '/liosam/GlobalMap.pcd'); return L.waitIdle(p); });
  await step('写真 8000x6000 の JPEG を開く', () => L.open(p, [WR + '/photo_8000x6000.jpg']));
  await L.shot(p, 'c7_before_huge');
  await step('巨大な PNG 16000x16000（ファイルは小さい）を開く', () => L.open(p, [WR + '/huge_16000.png'], { wait: 240000 }));
  R.crashed = crashed;
  if (!crashed) await L.shot(p, 'c7_after_huge').catch(() => {});
  R.errors = errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e)).slice(0, 20);
  for (const s of R.steps) L.log(s);
  L.log({ crashed: R.crashed, errors: R.errors });
  await app.close().catch(() => {});
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
