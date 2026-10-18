'use strict';
// PoC C: ファイルの項目名（PCD FIELDS）が #info の innerHTML に無エスケープで入る（app.js:1541）。
//   header.fields.join(' ') がトークン間に空白を戻すため、複数トークンで <img ... onerror=...> を再構成できる。
//   期待（アプリの意図）: 項目名もファイル名同様にエスケープされ、HTML として解釈されない。
//   確認点: (1) #info に <img>/<h2> 要素が実際に生成されるか（HTML 注入の成立）
//           (2) onerror の JS が走るか（CSP に 'unsafe-inline' がないため走らないはず＝注入の影響は限定）
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const FILE = path.resolve(process.argv[2] || 'poc/mal/xss_fields.pcd');
const PAGE = process.env.PAGE || 'file:///home/claude/pcd-viewer/dist/index.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.setInputFiles('#fileInput', FILE);
  // 読み込み完了 + spacing(→updateInfo) を待つ
  await p.waitForFunction(() => window.__pcd && window.__pcd.S.files.length === 1, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const info = document.getElementById('info');
    return {
      headerFields: window.__pcd.S.files[0].header.fields,
      infoInnerHTML: info ? info.innerHTML : null,
      injectedImg: document.querySelectorAll('#info img').length,
      injectedH2: document.querySelectorAll('#info h2').length,
      injectedH2Text: (document.querySelector('#info h2') || {}).textContent || null,
      fieldSelHTML: document.getElementById('fieldSel').innerHTML,
      xssFired: typeof window.__xss !== 'undefined',
    };
  });
  console.log(JSON.stringify({
    htmlInjection: (r.injectedImg + r.injectedH2) > 0,
    injectedImg: r.injectedImg, injectedH2: r.injectedH2, injectedH2Text: r.injectedH2Text,
    scriptExecuted_xssFired: r.xssFired,
    headerFields: r.headerFields,
    infoInnerHTML: r.infoInnerHTML,
    fieldSelHTML: r.fieldSelHTML,
    cspOrOtherConsoleErrors: consoleErrors.slice(0, 8),
  }, null, 2));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
