// スマートフォン（幅 400 px 前後）での試験: 配置の重なり、ドックのはみ出し、タッチ操作（1 本指・ピンチ・2 本指）、縦横の切り替え、明るい設定
//   claude.ai 役の枠（親ページは viewport の meta あり、枠は画面いっぱい）。比較のため、試作ページを直接（骨組みなし）開いた場合も
//   出力: out/mobile.json, out/mobile_*.png
'use strict';
const L = require('./lib');
const rectOf = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; }, sel);
const camState = frame => frame.evaluate(() => { const P = window.__pcd, c = P.cam.position, t = P.controlsTarget(); const dx = c.x - t[0], dy = c.y - t[1], dz = c.z - t[2]; return { dist: +Math.hypot(dx, dy, dz).toFixed(3), az: +(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2), el: +(Math.atan2(dz, Math.hypot(dx, dy)) * 180 / Math.PI).toFixed(2), target: t.map(v => +v.toFixed(3)) }; });
async function touch(cdp, type, pts) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 5, radiusY: 5, force: 1 })) }); }
async function gesture(cdp, from, to, steps = 12) {
  await touch(cdp, 'touchStart', from);
  for (let s = 1; s <= steps; s++) { const t = s / steps; await touch(cdp, 'touchMove', from.map((p, i) => [p[0] + (to[i][0] - p[0]) * t, p[1] + (to[i][1] - p[1]) * t])); await new Promise(r => setTimeout(r, 16)); }
  await touch(cdp, 'touchEnd', []);
  await new Promise(r => setTimeout(r, 400));
}
(async () => {
  const srv = await L.startServers();
  const browser = await L.launch();
  const R = {};
  const VW = 400, VH = 800;
  {
    const { ctx, page, logs } = await L.newPage(browser, { viewport: { width: VW, height: VH }, dpr: 2.5, isMobile: true, hasTouch: true });
    await page.goto(L.parentURL({ csp: 'claude' }), { waitUntil: 'commit' });
    const frame = await L.artFrame(page);
    await L.waitStartup(frame);
    await page.waitForTimeout(500);
    R.inner = await frame.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, canvas: [document.querySelector('#stage canvas').width, document.querySelector('#stage canvas').height], touchPoints: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches }));
    await page.screenshot({ path: `${L.OUT}/mobile_1_start.png` });
    // ドック
    R.dock = await frame.evaluate(() => { const d = document.getElementById('dock'), r = d.getBoundingClientRect(); return { scrollW: d.scrollWidth, clientW: d.clientWidth, left: Math.round(r.left), right: Math.round(r.right), hiddenButtons: [...d.querySelectorAll('button')].filter(b => { const q = b.getBoundingClientRect(); return q.right > r.right + 1 || q.left < r.left - 1; }).map(b => b.textContent.trim()) }; });
    R.navHint = { hint: await rectOf(frame, '#navHint'), dock: await rectOf(frame, '#dock'), text: await frame.evaluate(() => document.getElementById('navHint').textContent), emptyKeys: await frame.evaluate(() => document.querySelector('.empty .keys').textContent) };
    // 「開く」のカード → サンプルのボタンを押して、知らせが見えるか
    await frame.click('[data-open="open"]');
    await frame.evaluate(() => { document.getElementById('fmtSamples').open = true; });
    const seq = await frame.evaluate(() => window.__pcd.S.seq);
    await frame.click('#fmtSampleList button[data-sg="点群"][data-si="1"]');
    await L.waitIdle(frame, { seq0: seq });
    R.cardVsMsg = { pop: await rectOf(frame, '#pop'), msg: await rectOf(frame, '#statMsg'), hud: await rectOf(frame, '.hud'), text: await frame.evaluate(() => document.getElementById('statMsg').textContent),
      covered: await frame.evaluate(() => { const m = document.getElementById('statMsg').getBoundingClientRect(); const pts = [[m.left + 4, m.top + m.height / 2], [m.left + m.width / 2, m.top + m.height / 2], [m.right - 4, m.top + m.height / 2]]; return pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.closest('#pop') ? 'カード' : e.id || e.className || e.tagName) : null; }); }) };
    await page.screenshot({ path: `${L.OUT}/mobile_2_open_card.png` });
    // カードを 4 枚重ねる
    for (const n of ['color', 'display', 'section']) await frame.click(`[data-open="${n}"]`).catch(e => { R.dockClickErr = (R.dockClickErr || []).concat(n + ': ' + e.message.split('\n')[0]); });
    R.stack = { pop: await rectOf(frame, '#pop'), tabs: await frame.evaluate(() => [...document.querySelectorAll('.ptab')].map(t => t.textContent)), maxH: await frame.evaluate(() => document.getElementById('pop').style.maxHeight), dock: await rectOf(frame, '#dock') };
    await page.screenshot({ path: `${L.OUT}/mobile_3_stack.png` });
    // 全部閉じる（カード）
    await frame.evaluate(() => { let i = 0; while (!document.getElementById('pop').hidden && i++ < 10) document.getElementById('popClose').click(); });
    // タッチ: 1 本指で回す・ピンチ・2 本指で動かす・2 本指でひねる
    const cdp = await ctx.newCDPSession(page);
    const cx = VW / 2, cy = VH / 2 - 60;
    const s0 = await camState(frame);
    await gesture(cdp, [[cx, cy]], [[cx + 120, cy]]);
    const s1 = await camState(frame);
    await gesture(cdp, [[cx - 40, cy], [cx + 40, cy]], [[cx - 140, cy], [cx + 140, cy]]);
    const s2 = await camState(frame);
    await gesture(cdp, [[cx - 60, cy], [cx + 60, cy]], [[cx - 60, cy + 150], [cx + 60, cy + 150]]);
    const s3 = await camState(frame);
    // ひねる（2 本指を中心のまわりに 60 度回す）
    const tw = []; const r0 = 70; for (let a = 0; a <= 60; a += 5) { const t = a * Math.PI / 180; tw.push([[cx - r0 * Math.cos(t), cy - r0 * Math.sin(t)], [cx + r0 * Math.cos(t), cy + r0 * Math.sin(t)]]); }
    await touch(cdp, 'touchStart', tw[0]); for (const p of tw.slice(1)) { await touch(cdp, 'touchMove', p); await page.waitForTimeout(16); } await touch(cdp, 'touchEnd', []); await page.waitForTimeout(400);
    const s4 = await camState(frame);
    R.touch = { start: s0, after1finger: s1, afterPinchOut: s2, after2fingerDrag: s3, afterTwist: s4 };
    // タップで座標（座標ボタン → 点のある所をタップ）
    await frame.click('[data-tool="info"]');
    await frame.evaluate(() => window.__pcd.setView('top', false));
    await page.waitForTimeout(500);
    // 点のある画面上の位置を探す: 地図の中心付近
    let tapped = null;
    for (const [dx, dy] of [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10], [20, 20], [-20, -20], [30, 0], [-30, 0]]) {
      await touch(cdp, 'touchStart', [[cx + dx, cy + 60 + dy]]); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(1200);
      const vis = await frame.evaluate(() => !!document.querySelector('.pcall.pin.sel'));
      if (vis) { tapped = [dx, dy]; break; }
    }
    R.tapPick = { tapped, box: await rectOf(frame, '#pickBox'), inView: await frame.evaluate(() => { const b = (document.querySelector('.pcall.pin.sel .pc-box') || document.createElement('div')).getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight; }) };
    await page.screenshot({ path: `${L.OUT}/mobile_4_pick.png` });
    await frame.click('[data-tool="info"]');
    // 横向き
    await page.setViewportSize({ width: VH, height: VW });
    await page.waitForTimeout(1200);
    R.landscape = { inner: await frame.evaluate(() => [innerWidth, innerHeight]), canvas: await frame.evaluate(() => { const c = document.querySelector('#stage canvas'); return [c.width, c.height, c.clientWidth, c.clientHeight]; }), dock: await rectOf(frame, '#dock') };
    await frame.click('[data-open="open"]');
    await frame.click('[data-open="color"]');
    R.landscape.pop = await rectOf(frame, '#pop');
    R.landscape.popMaxH = await frame.evaluate(() => document.getElementById('pop').style.maxHeight);
    await page.screenshot({ path: `${L.OUT}/mobile_5_landscape.png` });
    R.pageerror = logs.pageerror; R.console = logs.console.filter(s => !/favicon|404/.test(s)).slice(0, 10);
    await ctx.close();
  }
  // 明るい設定（OS が明るい）
  {
    const { ctx, page } = await L.newPage(browser, { viewport: { width: VW, height: VH }, dpr: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
    await page.goto(L.parentURL({ csp: 'claude' }), { waitUntil: 'commit' });
    const frame = await L.artFrame(page);
    await L.waitStartup(frame);
    R.light = await frame.evaluate(() => ({ scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', bg: getComputedStyle(document.body).backgroundColor, panel: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim(), colorScheme: getComputedStyle(document.documentElement).colorScheme }));
    await frame.click('[data-open="settings"]');
    await page.screenshot({ path: `${L.OUT}/mobile_6_light.png` });
    await ctx.close();
  }
  // 骨組みなしのファイルを直接（最上位）スマートフォンで開いた場合（viewport の meta がない）
  {
    const { ctx, page } = await L.newPage(browser, { viewport: { width: VW, height: VH }, dpr: 2.5, isMobile: true, hasTouch: true });
    await page.goto(L.childURL({ csp: 'claude', wrap: 'raw' }), { waitUntil: 'commit' });
    await L.waitStartup(page.mainFrame());
    R.rawTop = await page.evaluate(() => ({ innerWidth, innerHeight, vv: window.visualViewport ? [Math.round(visualViewport.width), Math.round(visualViewport.height), visualViewport.scale] : null, compat: document.compatMode }));
    await page.screenshot({ path: `${L.OUT}/mobile_7_raw_top.png` });
    await ctx.close();
  }
  // 安全領域（iPhone の切り欠き・ホームバー）: アプリの WebView でページが画面いっぱいに出る場合を想定（最上位で骨組みあり＋ CDP で安全領域を設定）
  R.safeArea = [];
  for (const strip of ['', 'padfix']) {
    const { ctx, page } = await L.newPage(browser, { viewport: { width: 390, height: 844 }, dpr: 3, isMobile: true, hasTouch: true });
    const cdp = await ctx.newCDPSession(page);
    let ok = true;
    try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, topMax: 47, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } }); } catch (e) { ok = 'CDP 非対応: ' + e.message; }
    await page.goto(L.childURL({ csp: 'claude', wrap: 'skeleton', ...(strip ? { strip } : {}) }), { waitUntil: 'commit' });
    await L.waitStartup(page.mainFrame());
    await page.click('[data-open="open"]');
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const r = s => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { top: Math.round(q.top), bottom: Math.round(q.bottom) }; };
      const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);width:1px'; document.body.append(probe);
      const insetTop = probe.getBoundingClientRect().height; probe.remove();
      return { insetTop, rootPadTop: getComputedStyle(document.documentElement).paddingTop, innerH: innerHeight, popHead: r('#pop .pophead'), close: r('#popClose'), hud: r('.hud'), dock: r('#dock') };
    });
    R.safeArea.push({ variant: strip ? '余白の打ち消しを外した version ' : '今の version（:root の余白を 0 に）', cdp: ok, ...m });
    await page.screenshot({ path: `${L.OUT}/mobile_8_safearea${strip ? '_nofix' : ''}.png` });
    await ctx.close();
  }
  L.writeJSON('mobile.json', R);
  console.log(JSON.stringify(R, null, 1).slice(0, 8000));
  await browser.close(); await srv.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
