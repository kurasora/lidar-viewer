// 1 つ（または複数）のファイルを開き、ページのエラーをスタック付きで出す（調査用）
//   node dbg_one.js <ファイル>... ; PAGE で写しの dist を指定
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message, '\n', (e.stack || '').split('\n').slice(0, 12).join('\n')));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text()); });
  await p.goto(process.env.PAGE || 'http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html');
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  for (const f of process.argv.slice(2)) {
    await p.setInputFiles('#fileInput', [path.resolve(f)]);
    await p.waitForTimeout(4000);
    console.log(await p.evaluate(() => JSON.stringify({ files: window.__pcd.S.files.map(f => [f.name, f.n]), msg: document.getElementById('statMsg').textContent, prog: document.getElementById('progress').hidden, offset: window.__pcd.S.offset })));
  }
  await b.close();
})();
