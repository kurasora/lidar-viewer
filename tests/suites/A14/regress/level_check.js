// 自動の水平補正（床の高さ・天井の高さ）を、正解の分かっている地図で確かめる（Chromium、X 不要）
//   node level_check.js <フォルダ（scans.pcd と truth.json）>...
//   出力: 1 行 1 JSON（検出した床・天井と、正解の床・天井の高さ（補正後の座標））
'use strict';
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  for (const dir of process.argv.slice(2)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(process.env.PAGE || 'file:///home/claude/pcd-viewer/dist/index.html');
    await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
    const truth = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'));
    await p.setInputFiles('#fileInput', path.join(dir, 'scans.pcd'));
    await p.waitForFunction(() => window.__pcd.S.files.length && window.__pcd.S.levelInfo, null, { timeout: 300000 }).catch(() => {});
    await p.waitForTimeout(500);
    const r = await p.evaluate(t => {
      const S = window.__pcd.S, L = S.levelInfo;
      if (!L) return { level: null, msg: document.getElementById('statMsg').textContent };
      const Rm = L.R; const ap = v => [0, 1, 2].map(i => Rm[i][0] * v[0] + Rm[i][1] * v[1] + Rm[i][2] * v[2]);
      const fz = ap(t.floor_point_M)[2], cz = ap(t.ceiling_point_M)[2];
      return { tilt: +L.tiltDeg.toFixed(2), yaw: +L.yawDeg.toFixed(2), floorZ_detected: L.floorZ == null ? null : +L.floorZ.toFixed(3), floorZ_true: +fz.toFixed(3), ceilZ_true: +cz.toFixed(3),
        floorOK: L.floorZ != null && Math.abs(L.floorZ - fz) < 0.05, ceilHideAt: S.ceilZ == null ? null : +S.ceilZ.toFixed(3), levelText: document.getElementById('levelResult').textContent.replace(/\n/g, ' / ') };
    }, truth);
    console.log(JSON.stringify({ dir: path.basename(dir), ...r }));
    await p.close();
  }
  await b.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
