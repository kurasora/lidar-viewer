// 任意のファイルを開いて、自動の水平補正の結果だけを出す（Chromium）
'use strict';
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  for (const f of process.argv.slice(2)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(process.env.PAGE || 'http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html');
    await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
    await p.setInputFiles('#fileInput', f);
    await p.waitForFunction(() => window.__pcd.S.files.length && (window.__pcd.S.levelInfo || /できません/.test(document.getElementById('statMsg').textContent)), null, { timeout: 300000 }).catch(() => {});
    await p.waitForTimeout(800);
    console.log(JSON.stringify(await p.evaluate(name => { const S = window.__pcd.S, L = S.levelInfo; return { name, n: S.files[0] && S.files[0].n, level: L && { tilt: +L.tiltDeg.toFixed(2), yaw: +L.yawDeg.toFixed(2), floorZ: L.floorZ }, ceilZ: S.ceilZ, msg: document.getElementById('statMsg').textContent, levelText: document.getElementById('levelResult').textContent.replace(/\n/g, ' / '), zRange: [S.bounds.min[2], S.bounds.max[2]] }; }, path.basename(f))));
    await p.close();
  }
  await b.close();
})();
