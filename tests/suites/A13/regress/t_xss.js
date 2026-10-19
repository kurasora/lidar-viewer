// 点群ファイルの中の文字（項目名）が innerHTML に入る所で、スクリプトが動くか（試作ページは CSP の meta を持たない）
//   場面: 試作ページ（claude.ai 役の枠＋既知の CSP）、試作ページ（file:// で直接）、アプリ version（dist/index.html。CSP の meta あり）
//   1) xss_field.pcd を開く → 「選んだファイルの情報」（updateInfo）と「項目」の選択肢（refreshFieldSelect）に項目名が入る
//   2) xss_field_cat.pcd を開いて、色を「反射」（値）にする → 凡例（drawLegend の分類）に項目名が入る
//   3) ファイル名に HTML を入れた File を開く（名前の側は escapeHtml されているはず）
//   出力: out/xss.json
'use strict';
const L = require('./lib');
const path = require('path');
const FILES = path.join(L.W, 'files');
(async () => {
  const srv = await L.startServers();
  const browser = await L.launch();
  const scenes = [
    { name: '試作ページ（枠＋CSP claude）', url: L.parentURL({ csp: 'claude' }), iframe: true, startup: true },
    { name: '試作ページ（file:// 直接）', url: 'file://' + L.ART, iframe: false, startup: true },
    { name: 'アプリ version dist（CSP meta あり）', url: L.APP, iframe: false, startup: false },
  ];
  const results = [];
  for (const sc of scenes) {
    const { ctx, page, logs } = await L.newPage(browser);
    await page.goto(sc.url, { waitUntil: 'commit' });
    const frame = sc.iframe ? await L.artFrame(page) : page.mainFrame();
    await frame.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
    if (sc.startup) await L.waitStartup(frame);
    const r = { scene: sc.name };
    // 1) 項目名
    let seq = await frame.evaluate(() => window.__pcd.S.seq);
    await frame.setInputFiles('#fileInput', path.join(FILES, 'xss_field.pcd'));
    await L.waitIdle(frame, { seq0: seq });
    await page.waitForTimeout(800);
    r.field = await frame.evaluate(() => ({ xss: window.__xss || 0, imgInInfo: document.querySelectorAll('#info img').length, imgInSelect: document.querySelectorAll('#fieldSel img').length, options: [...document.getElementById('fieldSel').options].map(o => o.value), infoFields: (document.querySelector('#info dl') || {}).innerHTML?.match(/<dt>項目<\/dt><dd>(.*?)<\/dd>/)?.[1] || null, csp: window.__a13.log.filter(x => x.k === 'csp') }));
    // 2) 分類の項目で色分け → 凡例
    seq = await frame.evaluate(() => window.__pcd.S.seq);
    await frame.setInputFiles('#fileInput', path.join(FILES, 'xss_field_cat.pcd'));
    await L.waitIdle(frame, { seq0: seq });
    await frame.click('[data-open="color"]');
    await frame.click('#colorBasic [data-val="field"]');
    await page.waitForTimeout(1200);
    r.legend = await frame.evaluate(() => ({ xss: window.__xss || 0, imgInLegend: document.querySelectorAll('#legend img').length, legendText: document.getElementById('legend').textContent.slice(0, 120), colorMode: document.getElementById('colorMode').value, field: window.__pcd.S.field }));
    // 3) ファイル名
    seq = await frame.evaluate(() => window.__pcd.S.seq);
    await frame.evaluate(() => { const body = '# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 3\nHEIGHT 1\nPOINTS 3\nDATA ascii\n0 0 0\n1 0 0\n0 1 1\n'; window.__pcd.enqueue([new File([body], '<img src=x onerror=window.__xssName=1>.pcd')]); });
    await L.waitIdle(frame, { seq0: seq });
    await page.waitForTimeout(800);
    r.name = await frame.evaluate(() => ({ xssName: window.__xssName || 0, imgAnywhere: document.querySelectorAll('#fileList img, #info img, #legend img').length, csp: window.__a13.log.filter(x => x.k === 'csp').length }));
    r.console = logs.console.filter(s => /Content Security Policy|inline/i.test(s)).slice(0, 5);
    await page.screenshot({ path: `${L.OUT}/xss_${results.length + 1}.png` });
    results.push(r);
    console.log(JSON.stringify(r));
    await ctx.close();
  }
  L.writeJSON('xss.json', results);
  await browser.close(); await srv.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
