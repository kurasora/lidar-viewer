// A12: 画面（Chromium で dist/index.html）で、読み込み部品の不具合が実際の表示に出るかを確かめる
//   node render_checks.js <data フォルダ>
//   確認するもの:
//     A12-html-field … 項目名に HTML を含む PCD を開くと、エスケープされず innerHTML に入る。
//                        CSP（script-src に 'unsafe-inline' なし）で inline の onerror が動くかどうかも見る
//     A12-csv-dem    … 名前に dem を含むだけの CSV 点群が「高さの表」にされ、点数・座標が変わる
//     A12-las-trunc  … 途中で切れた LAS を黙って少ない点数で開く（的外れでない知らせが出るか）
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const D = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files','--disable-component-update','--disable-background-networking','--no-first-run','--disable-sync','--disable-features=Translate,OptimizationHints'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const cspBlocked = [];
  p.on('console', m => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) cspBlocked.push(t.slice(0, 120)); });
  await p.goto('file:///home/claude/pcd-viewer/dist/index.html');
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  const open = async f => {
    await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); document.getElementById('statMsg').textContent = ''; document.title = 'LiDAR Viewer'; });
    await p.setInputFiles('#fileInput', path.resolve(D, f));
    await p.waitForTimeout(2500);
  };

  // --- A12-html-field
  await open('html_field.pcd');
  // 色を「値（field）」にして refreshFieldSelect / drawLegend を通す
  await p.evaluate(() => { const s = document.getElementById('colorMode'); s.value = 'field'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(800);
  const html = await p.evaluate(() => ({
    title: document.title,
    fieldSelHTML: document.getElementById('fieldSel').innerHTML.slice(0, 200),
    infoHTML: document.getElementById('info').innerHTML.includes('<img'),
    imgNodes: document.querySelectorAll('#fieldSel img, #info img, #legend img').length,
  }));
  console.log('[A12-html-field]', JSON.stringify(html), 'CSPでブロックされたか:', cspBlocked.length ? cspBlocked.slice(0, 2) : 'ログなし');
  console.log('  → document.title が XSS なら inline コード実行（CSP 破れ）、"LiDAR Viewer" のままなら CSP が防いでいる。imgNodes>0 なら生の HTML が注入されている');

  // --- A12-csv-dem
  await open('demo.csv');
  const dem = await p.evaluate(() => { const f = window.__pcd.S.files[0]; return { n: f.n, fmt: f.header.data, msg: document.getElementById('statMsg').textContent }; });
  console.log('[A12-csv-dem]', JSON.stringify(dem), '（期待: 5000 点・文字の点群。実際に 35000 点・CSV の高さの表なら誤判定）');

  // --- A12-las-trunc
  await open('las_truncated.las');
  const tr = await p.evaluate(() => { const f = window.__pcd.S.files[0]; return { n: f.n, note: f.header.note, msg: document.getElementById('statMsg').textContent, isErr: !!document.getElementById('statMsg').style.color }; });
  console.log('[A12-las-trunc]', JSON.stringify(tr), '（ヘッダーは 5000 点。黙って 3499 点で開き、注記も誤りも出なければ問題）');

  await b.close();
})().catch(e => { console.log('fatal', e.message); process.exit(1); });
