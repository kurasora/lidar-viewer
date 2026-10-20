// 屋外の地図（地面・高さ 12 m の建物・高さ 4.5〜7 m の並木）で、既定の「天井を隠す」が何を隠すか（Chromium）
'use strict';
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = require('./lib.js');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(process.env.PAGE || 'http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html');
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.setInputFiles('#fileInput', L.F + '/outdoor/scans.pcd');
  await p.waitForFunction(() => window.__pcd.S.files.length && window.__pcd.S.levelInfo, null, { timeout: 300000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const S = window.__pcd.S, L = S.levelInfo;
    // 隠れている点の割合（標本）
    let hidden = 0, tot = 0; const c = S.ceil;
    for (const s of S.worldSample) for (let i = 0; i < s.length; i += 3) { tot++; if (c && c.n.x * s[i] + c.n.y * s[i + 1] + c.n.z * s[i + 2] > c.d) hidden++; }
    return { level: L && { tilt: +L.tiltDeg.toFixed(2), yaw: +L.yawDeg.toFixed(2), floorZ: L.floorZ }, ceilZ: S.ceilZ, hideCeil: S.hideCeil, hiddenShare: +(hidden / Math.max(1, tot)).toFixed(3),
      msg: document.getElementById('statMsg').textContent, btnCeilOn: document.getElementById('btnCeil').classList.contains('on'), zRange: [S.bounds.min[2], S.bounds.max[2]] };
  });
  await p.evaluate(() => window.__pcd.setView('side', false)); await p.waitForTimeout(800);
  await p.screenshot({ path: L.OUT + '/c1c_outdoor_hidden.png' });
  await p.keyboard.press('c'); await p.waitForTimeout(800);
  await p.screenshot({ path: L.OUT + '/c1c_outdoor_shown.png' });
  console.log(JSON.stringify(r));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
