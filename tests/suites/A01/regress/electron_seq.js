// アプリ（Electron）で、ファイルを順に開いて様子を記録する（A01-001 などの実機 version での確認）
//   使い方: cd $W && $T/bin/heavy xvfb-run -a -n 110 node regress/electron_seq.js <出力 json> <ファイル>...
//   ・ファイルは 1 つずつ（前のものを閉じずに）開く。各段階で S.files・知らせ・ページのエラーを記録
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const [outJson, ...files] = process.argv.slice(2);
  const APPDIR = process.env.APPDIR || '/home/claude/pcd-viewer';
  const ud = process.env.USERDATA || path.join(path.dirname(path.resolve(outJson)), 'ud-electron-seq');
  const app = await pw._electron.launch({ executablePath: '/home/claude/pcd-viewer/node_modules/electron/dist/electron', args: ['--no-sandbox', path.join(APPDIR, 'main.js')], env: { ...process.env, PCDV_USERDATA: ud } });
  const p = await app.firstWindow();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.evaluate(() => { const el = document.getElementById('statMsg'); window.__msgs = []; new MutationObserver(() => { if (el.textContent) window.__msgs.push((el.style.color ? '[赤] ' : '') + el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true }); });
  const steps = [];
  for (const f of files) {
    await p.evaluate(() => { window.__msgs = []; });
    await p.setInputFiles('#fileInput', [path.resolve(f)]);
    await p.waitForTimeout(6000);
    steps.push(await p.evaluate(name => ({ opened: name, files: window.__pcd.S.files.map(x => [x.name, x.n]), msgs: window.__msgs.slice(), progressHidden: document.getElementById('progress').hidden, title: document.title }), path.basename(f)));
  }
  await p.screenshot({ path: outJson.replace(/\.json$/, '.png') });
  fs.writeFileSync(outJson, JSON.stringify({ steps, errors }, null, 1));
  console.log(JSON.stringify({ steps, errors }));
  await app.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
