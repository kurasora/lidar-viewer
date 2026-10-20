'use strict';
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const FILE = path.resolve(process.argv[2]);
const PAGE = process.env.PAGE || 'http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files','--disable-background-networking','--disable-component-update','--no-first-run'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.setInputFiles('#fileInput', FILE);
  await p.waitForFunction(() => window.__pcd && window.__pcd.S.files.length === 1, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
    const inj = document.querySelector('#info div[style*="fixed"]');
    return {
      overlayInjected: !!inj,
      overlayCoversCenter: !!(inj && (el === inj || (inj && inj.contains(el)))),
      centerElementTag: el ? el.tagName + (el.className?('.'+el.className):'') : null,
      overlayText: inj ? inj.textContent : null,
    };
  });
  console.log(JSON.stringify(r, null, 2));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
