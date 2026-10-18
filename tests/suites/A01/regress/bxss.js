// 欄の名前に HTML / スクリプトを入れたファイルを、アプリ版のページ（CSP あり）と試作ページ（CSP なし）で開き、差し込み・実行されるかを見る
//   使い方: node bxss.js <出力フォルダ> <ファイル>...
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path');
const [OUT, ...files] = process.argv.slice(2);
const PAGES = { app: 'file:///home/claude/pcd-viewer/dist/index.html', artifact: 'file:///home/claude/pcd-viewer/dist-artifact/pcd-viewer.html' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const res = [];
  for (const [pname, url] of Object.entries(PAGES)) {
    for (const f of files) {
      const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
      const cons = [];
      p.on('console', m => cons.push(m.type() + ': ' + m.text().slice(0, 200)));
      p.on('pageerror', e => cons.push('pageerror: ' + e.message.slice(0, 200)));
      await p.goto(url);
      await p.waitForFunction(() => window.__pcd, null, { timeout: 120000 });
      if (pname === 'artifact') { await p.waitForFunction(() => window.__pcd.S.files.length >= 1 && document.getElementById('progress').hidden, null, { timeout: 300000 }).catch(() => {}); await p.waitForTimeout(1500); }
      const title0 = await p.title();
      await p.setInputFiles('#fileInput', [path.resolve(f)]);
      await p.waitForTimeout(6000);
      await p.evaluate(() => { const items = document.querySelectorAll('#fileList [data-act=select]'); if (items.length) items[items.length - 1].click(); const ib = document.getElementById('infoBox'); if (ib) ib.open = true; });
      await p.waitForTimeout(1500);
      const r = await p.evaluate(() => ({ title: document.title, injectedImg: document.querySelectorAll('#info img, #fieldSel img, #legend img').length, injectedH1: document.querySelectorAll('h1').length, info: (document.getElementById('info') || {}).innerHTML?.slice(0, 400) }));
      await p.screenshot({ path: path.join(OUT, `${pname}_${path.basename(f)}.png`) });
      res.push({ page: pname, file: path.basename(f), titleBefore: title0, ...r, console: cons.filter(c => /Content Security|xss|pageerror/i.test(c)).slice(0, 5) });
      console.log(JSON.stringify(res[res.length - 1]).slice(0, 600));
      await p.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'xss.json'), JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.log('fatal', e.message); process.exit(1); });
