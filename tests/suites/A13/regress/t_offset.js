// 起動時に開く廊下の地図（シフトなし → S.offset = [0,0,0]）のあとに、UTM 座標のサンプルを開いたときの試験
//   1) 地図を開いたまま .las（laspy_utm.las）を押す → 座標の細かさ（minGap）、知らせ、ページのエラー
//   2) そのあと、ほかのサンプル（.pcd ascii）を押す → 開けるか（読み込みの順番待ちが止まっていないか）
//   3) 比較: 全部閉じてから .las を押す（きれいな状態）→ 並べた座標を点ごとに比べて、ずれの最大を出す
//   4) 自前の UTM ファイル（utm_cloud.pcd、double）でも同じ（試作ページ・アプリ版の両方。アプリ版は小さな点群を先に開く）
//   出力: out/offset.json
'use strict';
const L = require('./lib');
const path = require('path');
const FILES = path.join(L.W, 'files');
(async () => {
  const srv = await L.startServers();
  const browser = await L.launch();
  const R = {};
  const clickChip = async (frame, group, label) => {
    const seq = await frame.evaluate(() => window.__pcd.S.seq);
    const ids0 = await frame.evaluate(() => window.__pcd.S.files.map(f => f.id));
    await frame.evaluate(() => { document.getElementById('fmtSamples').open = true; });
    const idx = await frame.evaluate(([g, l]) => [...document.querySelectorAll(`#fmtSampleList button[data-sg="${g}"]`)].findIndex(b => b.textContent === l), [group, label]);
    await frame.click(`#fmtSampleList button[data-sg="${group}"][data-si="${idx}"]`);
    const w = await L.waitIdle(frame, { seq0: seq, limit: 30000 });
    const ids = await frame.evaluate(() => window.__pcd.S.files.map(f => f.id));
    const st = await L.fileStats(frame, ids.filter(i => !ids0.includes(i)));
    const ui = await frame.evaluate(() => ({ progress: !document.getElementById('progress').hidden, progressText: document.getElementById('progressText').textContent }));
    return { label, timedOut: w.timedOut, ...st, ui };
  };
  // ---- 試作ページ（枠＋既知の CSP）
  {
    const { ctx, page, logs } = await L.newPage(browser);
    await page.goto(L.parentURL({ csp: 'claude' }), { waitUntil: 'commit' });
    const frame = await L.artFrame(page);
    await L.waitStartup(frame);
    await frame.click('[data-open="open"]');
    R.mapOffset = await frame.evaluate(() => window.__pcd.S.offset);
    R.withMap_las = await clickChip(frame, '点群', '.las');
    R.withMap_las.pageerror = logs.pageerror.slice();
    R.withMap_las.sorted = await L.sortedAxes(frame, R.withMap_las.files[0] && R.withMap_las.files[0].id, 5000);
    await page.screenshot({ path: `${L.OUT}/offset_withmap_las.png` });
    const pe0 = logs.pageerror.length;
    R.withMap_next = await clickChip(frame, '点群', '.pcd ascii');
    R.withMap_next.pageerror = logs.pageerror.slice(pe0);
    // きれいな状態で同じもの（ページを読み直す）
    await page.reload({ waitUntil: 'commit' });
    const f2 = await L.artFrame(page);
    await L.waitStartup(f2);
    await f2.click('[data-open="open"]');
    await L.closeAll(f2);
    R.clean_las = await clickChip(f2, '点群', '.las');
    R.clean_las.sorted = await L.sortedAxes(f2, R.clean_las.files[0] && R.clean_las.files[0].id, 5000);
    // 点ごとの比較（並べた座標どうし）
    const a = R.withMap_las.sorted, b = R.clean_las.sorted;
    if (a && b) R.diff = [0, 1, 2].map(k => { let mx = 0; for (let i = 0; i < Math.min(a[k].length, b[k].length); i++) mx = Math.max(mx, Math.abs(a[k][i] - b[k][i])); return +mx.toFixed(4); });
    delete R.withMap_las.sorted; delete R.clean_las.sorted;
    // 座標の表示（座標ボタンで点を選ぶ）: 地図を開いたまま UTM の点を選んだときの表示の桁
    await ctx.close();
  }
  // ---- 自前の UTM ファイル: 試作ページ（地図のあと）とアプリ版（小さな点群のあと）
  for (const sc of [{ name: '試作ページ: 地図のあと utm_cloud.pcd', url: L.parentURL({ csp: 'claude' }), iframe: true, first: null },
    { name: 'アプリ版: map.laz（廊下の地図・自動で水平）のあと utm_cloud.pcd', url: L.APP, iframe: false, first: '/home/claude/pcd-viewer/sample/map.laz' },
    { name: 'アプリ版: small_local.pcd（水平補正できない小さな箱）のあと utm_cloud.pcd', url: L.APP, iframe: false, first: 'small_local.pcd' },
    { name: 'アプリ版: utm_cloud.pcd だけ', url: L.APP, iframe: false, first: false }]) {
    const { ctx, page, logs } = await L.newPage(browser);
    await page.goto(sc.url, { waitUntil: 'commit' });
    const frame = sc.iframe ? await L.artFrame(page) : page.mainFrame();
    await frame.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
    if (sc.iframe) await L.waitStartup(frame);
    if (sc.first) { const s = await frame.evaluate(() => window.__pcd.S.seq); await frame.setInputFiles('#fileInput', sc.first.startsWith('/') ? sc.first : path.join(FILES, sc.first)); await L.waitIdle(frame, { seq0: s, limit: 120000 }); await frame.waitForFunction(() => document.getElementById('levelResult').textContent || document.getElementById('statMsg').style.color, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500); }
    const lvl = await frame.evaluate(() => ({ level: document.getElementById('levelResult').textContent, offset: window.__pcd.S.offset }));
    const s = await frame.evaluate(() => window.__pcd.S.seq);
    await frame.setInputFiles('#fileInput', path.join(FILES, 'utm_cloud.pcd'));
    const w = await L.waitIdle(frame, { seq0: s, limit: 30000 });
    const st = await L.fileStats(frame);
    const r = { scene: sc.name, firstLevel: lvl, timedOut: w.timedOut, offset: st.offset, msg: st.msg, files: st.files.map(f => ({ name: f.name, n: f.n, min: f.min, max: f.max, minGap: f.minGap })), pageerror: logs.pageerror.slice(0, 3),
      ui: await frame.evaluate(() => ({ progress: !document.getElementById('progress').hidden, progressText: document.getElementById('progressText').textContent })) };
    // 続けてもう 1 つ開けるか
    const s2 = await frame.evaluate(() => window.__pcd.S.seq);
    await frame.setInputFiles('#fileInput', path.join(FILES, 'xss_field.pcd').replace('xss_field', 'small_local'));
    const w2 = await L.waitIdle(frame, { seq0: s2, limit: 20000 });
    r.nextOpen = { timedOut: w2.timedOut, files: (await L.fileStats(frame)).files.length };
    R[sc.name] = r;
    console.log(JSON.stringify(r));
    await ctx.close();
  }
  L.writeJSON('offset.json', R);
  console.log(JSON.stringify(R, null, 1).slice(0, 5000));
  await browser.close(); await srv.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
