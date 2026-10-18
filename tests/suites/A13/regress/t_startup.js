// 起動の試験: 最初の表示（地図＋軌跡＋自動の水平補正）までの時間、長いタスク、メモリ、エラー、CSP の違反
//   場面: (1) file:// で直接開く（doctype・charset なし）、(2) claude.ai 役の枠（既知の CSP）、(3) 枠（CSP なし）
//   出力: out/startup.json
'use strict';
const L = require('./lib');
(async () => {
  const srv = await L.startServers();
  const browser = await L.launch();
  const results = [];
  const scenes = [
    { name: 'file直接', url: 'file://' + L.ART, iframe: false },
    { name: '枠+CSP(claude)', url: L.parentURL({ csp: 'claude' }), iframe: true },
    { name: '枠+CSPなし', url: L.parentURL({ csp: 'none' }), iframe: true },
  ];
  for (const sc of scenes) {
    const { ctx, page, logs } = await L.newPage(browser);
    const t0 = Date.now();
    await page.goto(sc.url, { waitUntil: 'commit' });
    const frame = sc.iframe ? await L.artFrame(page) : page.mainFrame();
    // 途中の様子を 100 ms ごとに記録（枠の中の performance.now() で）
    const marks = {};
    const tl = Date.now();
    let peakRss = 0;
    while (Date.now() - tl < 180000) {
      const s = await frame.evaluate(() => {
        const P = window.__pcd; const now = performance.now();
        if (!P) return { now };
        const S = P.S;
        return { now, pcd: true, files: S.files.length, trajs: S.trajs.length, level: !!S.levelInfo, progress: !document.getElementById('progress').hidden, ptext: document.getElementById('progressText').textContent, msg: document.getElementById('statMsg').textContent, err: !!document.getElementById('statMsg').style.color };
      }).catch(e => ({ e: e.message }));
      peakRss = Math.max(peakRss, L.treeRssMB(browser.process ? browser.process().pid : 0));
      if (s.pcd && marks.appReady == null) marks.appReady = Math.round(s.now);
      if (s.progress && marks.progressShown == null) marks.progressShown = Math.round(s.now);
      if (s.files >= 1 && marks.mapLoaded == null) marks.mapLoaded = Math.round(s.now);
      if (s.trajs >= 1 && marks.trajLoaded == null) marks.trajLoaded = Math.round(s.now);
      if (s.level && marks.leveled == null) marks.leveled = Math.round(s.now);
      if (s.err) { marks.error = s.msg; break; }
      if (s.files >= 1 && s.trajs >= 1 && s.level && !s.progress) { marks.done = Math.round(s.now); marks.msg = s.msg; break; }
      await L.sleep(100);
    }
    marks.wallMs = Date.now() - t0;
    await L.sleep(1500); // 点の間隔の計算などが終わるのを待つ
    const after = await frame.evaluate(() => ({
      mem: performance.memory ? { used: Math.round(performance.memory.usedJSHeapSize / 1048576), total: Math.round(performance.memory.totalJSHeapSize / 1048576) } : null,
      a13: window.__a13, title: document.title, charset: document.characterSet, compatMode: document.compatMode, lang: document.documentElement.lang,
      empty: getComputedStyle(document.querySelector('.empty p.big') || document.body).fontFamily,
      emptyText: (document.querySelector('.empty p.big') || {}).textContent,
      files: window.__pcd.S.files.map(f => ({ name: f.name, n: f.n })), trajs: window.__pcd.S.trajs.map(t => ({ name: t.name, count: t.count })),
      level: document.getElementById('levelResult').textContent,
      shotHidden: document.getElementById('btnShot').hidden, sampleShown: !document.getElementById('btnSample').hidden, fmtShown: !document.getElementById('fmtSamples').hidden,
      chips: document.querySelectorAll('#fmtSampleList button').length,
    }));
    // CDP で JS ヒープ（枠のプロセス）を見る
    let cdpMetrics = null;
    try {
      const cdp = await ctx.newCDPSession(sc.iframe ? frame : page);
      await cdp.send('Performance.enable');
      const m = await cdp.send('Performance.getMetrics');
      cdpMetrics = Object.fromEntries(m.metrics.filter(x => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'ScriptDuration', 'TaskDuration'].includes(x.name)).map(x => [x.name, x.name.startsWith('JS') ? Math.round(x.value / 1048576) + ' MB' : +x.value.toFixed(2)]));
    } catch (e) { cdpMetrics = { error: e.message }; }
    const lt = after.a13 ? after.a13.longtasks : [];
    const r = { scene: sc.name, marks, peakRssMB: peakRss, cdpMetrics, longtasks: { count: lt.length, total: lt.reduce((a, x) => a + x[1], 0), max: lt.reduce((a, x) => Math.max(a, x[1]), 0), first10: lt.slice(0, 10) },
      log: after.a13 ? after.a13.log : null, title: after.title, charset: after.charset, compatMode: after.compatMode, lang: after.lang, emptyText: after.emptyText,
      files: after.files, trajs: after.trajs, level: after.level, shotHidden: after.shotHidden, sampleShown: after.sampleShown, fmtShown: after.fmtShown, chips: after.chips, mem: after.mem,
      console: logs.console.slice(0, 20), pageerror: logs.pageerror, dialogs: logs.dialogs, downloads: logs.downloads, requestsFailed: logs.requestsFailed.slice(0, 10) };
    await page.screenshot({ path: `${L.OUT}/startup_${results.length + 1}.png` });
    results.push(r);
    console.log(JSON.stringify(r));
    await ctx.close();
  }
  L.writeJSON('startup.json', results);
  await browser.close(); await srv.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
