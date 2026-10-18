// 試作ページだけの「別スレッドの代理」（app.js 14–26 行）の故障注入
//   (a) DecompressionStream がないブラウザ（古い Safari/Firefox の代わりに、ページの始めで消す）
//   (b) CSP で Worker が禁止されている（worker-src 'none'）
//   (c) 正常（比較用）
//   それぞれ 20 秒待って、画面の様子（読み込み中の表示・知らせ・エラー）と、サンプルのボタン・デモを押したときの様子を記録
//   出力: out/worker_fail.json
'use strict';
const L = require('./lib');
(async () => {
  const srv = await L.startServers();
  const browser = await L.launch();
  const scenes = [
    { name: '(a) DecompressionStream なし', url: L.parentURL({ csp: 'claude' }), init: `if (location.port === '8831') { try { delete window.DecompressionStream; } catch (e) {} window.DecompressionStream = undefined; }` },
    { name: '(b) CSP worker-src none', url: L.parentURL({ csp: 'noworker' }) },
    { name: '(c) 正常', url: L.parentURL({ csp: 'claude' }) },
  ];
  const results = [];
  for (const sc of scenes) {
    const { ctx, page, logs } = await L.newPage(browser, { init: sc.init });
    await page.goto(sc.url, { waitUntil: 'commit' });
    const frame = await L.artFrame(page);
    await frame.waitForFunction(() => window.__pcd, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(20000);
    const ui = () => frame.evaluate(() => ({ hasPcd: !!window.__pcd, files: window.__pcd ? window.__pcd.S.files.length : null, progress: !document.getElementById('progress').hidden, progressText: document.getElementById('progressText').textContent, msg: document.getElementById('statMsg').textContent, msgErr: !!document.getElementById('statMsg').style.color, empty: !document.getElementById('empty').hidden })).catch(e => ({ error: e.message }));
    const r = { scene: sc.name, after20s: await ui() };
    // サンプルのボタン（.pcd ascii）を押す
    await frame.click('[data-open="open"]').catch(() => {});
    await frame.evaluate(() => { document.getElementById('fmtSamples').open = true; }).catch(() => {});
    await frame.click('#fmtSampleList button[data-sg="点群"][data-si="0"]').catch(e => { r.clickErr = e.message; });
    await page.waitForTimeout(8000);
    r.afterChip = await ui();
    // 座標のボタン → 点をクリック（別スレッドに問い合わせる）
    r.pageerror = logs.pageerror.slice(0, 5); r.console = logs.console.slice(0, 5);
    await page.screenshot({ path: `${L.OUT}/worker_fail_${results.length + 1}.png` });
    results.push(r);
    console.log(JSON.stringify(r));
    await ctx.close();
  }
  L.writeJSON('worker_fail.json', results);
  await browser.close(); await srv.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
