// 測っている途中の長さの表示（カーソルの右下）が画面の端で切れるか／900×600 で距離の案内と右上の知らせが重なるか（Chromium）
const L = require('./lib.js');
const S = require('./states.js');
const { check } = require('./layout_checks.js');
(async () => {
  const out = {};
  const { p, close } = await L.chromium({ w: 900, h: 600 });
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  await L.closeCards(p);
  // 近づいて、点が画面いっぱいに広がるようにする
  await p.evaluate(() => window.__pcd.setView('top', false));
  await p.waitForTimeout(300);
  await p.mouse.move(450, 300);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(120); }
  await p.waitForTimeout(500);
  await p.click('[data-tool="measure"]'); // 距離を入れる（距離のカードが左上に出る）
  // 測っている途中の長さの表示（mLive）は 0.4.2 でなくしたので、右端・下端で切れるかは確かめない（A06-037 は対象がない）
  // 900×600: 距離の案内（上の中央）と右上の長い知らせ
  await p.evaluate(() => { const el = document.getElementById('statMsg'); el.style.color = ''; el.textContent = '軌跡 trajectory.txt を開きました（テキスト、2,359 姿勢、226.0 m、471.6 秒）'; });
  await p.waitForTimeout(200);
  out.guide_vs_msg = (await check(p)).filter(i => i.kind === '重なり');
  out.guideShown = await p.evaluate(() => !document.getElementById('mGuide').hidden);
  await L.shot(p, 'misc/guide_vs_msg_900_measure');
  L.fs.writeFileSync(L.W + '/out/misc2.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
