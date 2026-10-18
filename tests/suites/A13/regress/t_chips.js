// 埋め込みサンプル（形式ごとのボタン 73 個）を全部開いて、結果を記録する
//   node t_chips.js <場面> <やり方> [出力名]
//     場面:  top（file:// で直接）| claude（claude.ai 役の枠＋既知の CSP）| <CSP の名前>（lib.js の CSP_PROFILES）
//     やり方: withmap … 起動時に開く廊下の地図を開いたまま、ボタンを 1 つずつ押す（利用者の手順。押したものだけ閉じてから次へ）
//            clean   … 毎回すべて閉じてから押す（アプリ版の試験と同じ条件）
//   環境変数: ONLY=ラベルの正規表現（一部だけ試す）、SHOTS=1（ボタンごとに画面写真）
//   出力: out/chips_<場面>_<やり方>.json
'use strict';
const L = require('./lib');
const scene = process.argv[2] || 'claude', mode = process.argv[3] || 'withmap';
const outName = process.argv[4] || `chips_${scene}_${mode}`;
(async () => {
  const srv = await L.startServers();
  const browser = await L.launch();
  const { ctx, page, logs } = await L.newPage(browser);
  const url = scene === 'top' ? 'file://' + L.ART : L.parentURL({ csp: scene });
  let frame, st, mapId, reloads = 0;
  // ページを開き直す（固まったときも、ここから続ける）
  const open = async () => {
    await page.goto(url, { waitUntil: 'commit' });
    frame = scene === 'top' ? page.mainFrame() : await L.artFrame(page);
    st = await L.waitStartup(frame);
    mapId = await frame.evaluate(() => (window.__pcd.S.files[0] || {}).id);
    // 「開く」のカードを出し、「形式ごとのサンプル」を開く（利用者と同じ操作）
    await frame.click('[data-open="open"]');
    await frame.evaluate(() => { document.getElementById('fmtSamples').open = true; });
  };
  await open();
  let chips = await L.chipList(frame);
  if (process.env.ONLY) chips = chips.filter(c => new RegExp(process.env.ONLY).test(c.label));
  const results = [];
  for (const c of chips) {
    if (mode === 'clean') await L.closeAll(frame); else await L.closeFilesExcept(frame, [mapId]);
    await page.waitForTimeout(150);
    const before = await frame.evaluate(() => ({ ids: window.__pcd.S.files.map(f => f.id), seq: window.__pcd.S.seq, log: window.__a13.log.length }));
    const nc0 = logs.console.length, pe0 = logs.pageerror.length;
    const t0 = Date.now();
    const sel = `#fmtSampleList button[data-sg="${c.group}"][data-si="${c.index}"]`;
    await frame.click(sel);
    // 押した直後の知らせ（「取得しています」）
    const firstMsg = await frame.evaluate(() => document.getElementById('statMsg').textContent);
    const w = await L.waitIdle(frame, { seq0: before.seq, limit: /step|ifc/i.test(c.label) ? 150000 : 60000 });
    const ms = Date.now() - t0;
    const after = await frame.evaluate(() => window.__pcd.S.files.map(f => f.id));
    const newIds = after.filter(id => !before.ids.includes(id));
    const stats = await L.fileStats(frame, newIds);
    const extra = await frame.evaluate(([sel, n0]) => {
      const b = document.querySelector(sel);
      return { ok: b.classList.contains('ok'), seq: window.__pcd.S.seq, log: window.__a13.log.slice(n0), progressText: document.getElementById('progressText').textContent, infoFmt: (document.querySelector('#info dl') || {}).textContent || '' };
    }, [sel, before.log]);
    const r = { group: c.group, label: c.label, ms, timedOut: w.timedOut, firstMsg, msg: stats.msg, msgIsError: stats.msgIsError, files: stats.files, offset: stats.offset, chipOk: extra.ok, loads: extra.seq - before.seq,
      csp: extra.log.filter(x => x.k === 'csp'), calls: extra.log.filter(x => x.k !== 'csp'), console: logs.console.slice(nc0), pageerror: logs.pageerror.slice(pe0) };
    if (process.env.SHOTS) await page.screenshot({ path: `${L.OUT}/${outName}_${results.length + 1}.jpg`, type: 'jpeg', quality: 45 });
    if (w.timedOut) { r.stuck = await frame.evaluate(() => ({ progress: !document.getElementById('progress').hidden, progressText: document.getElementById('progressText').textContent, msg: document.getElementById('statMsg').textContent })).catch(e => e.message); await open(); reloads++; r.reloadedAfter = true; }
    results.push(r);
    console.log(JSON.stringify({ label: c.label, ms, n: r.files.map(f => f.n), msg: r.msg.slice(0, 90), err: r.msgIsError, off: r.offset, gap: r.files.map(f => f.minGap), ok: r.chipOk, csp: r.csp.length }));
  }
  L.writeJSON(`${outName}.json`, { scene, mode, startup: st, reloads, http: logs.http, results, downloads: logs.downloads, dialogs: logs.dialogs, popups: logs.popups });
  await ctx.close(); await browser.close(); await srv.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
