// claude.ai 役の枠の中での機能の試験
//   1 ファイルを開く（showOpenFilePicker は枠の中では使えない → input に切り替わるか）、軌跡を開く
//   2 ドラッグ＆ドロップ（ハンドラーの動き。DataTransfer に File を入れて drop を送る）
//   3 画像の保存（隠れているか／押せたら何が起きるか）、alert/confirm/prompt/print、ポップアップ、全画面
//   4 localStorage: 例外を投げる（sandbox に allow-same-origin がない・getter が例外）、変な値、保存と復元
//   5 ライブのカード（window.pcdLive なし）とデモ、今の点群を開く、止める
//   6 title（吹き出し）が残っていないか、キー操作
//   出力: out/iframe.json
'use strict';
const L = require('./lib');
const path = require('path');
const SAMPLE = '/home/claude/pcd-viewer/sample/formats';
(async () => {
  const srv = await L.startServers();
  const browser = await L.launch();
  const R = {};
  // ---------------- 1〜3, 5, 6: 既知の CSP の枠
  {
    const { ctx, page, logs } = await L.newPage(browser);
    await page.goto(L.parentURL({ csp: 'claude' }), { waitUntil: 'commit' });
    const frame = await L.artFrame(page);
    await L.waitStartup(frame);
    R.env = await frame.evaluate(() => ({ hasPicker: typeof window.showOpenFilePicker, topIsSelf: (() => { try { return window.top === window; } catch (e) { return 'err'; } })(), fullscreenEnabled: document.fullscreenEnabled, origin: location.origin, ls: (() => { try { localStorage.setItem('a13', '1'); return localStorage.getItem('a13'); } catch (e) { return 'throws: ' + e.name; } })() }));
    // 1) ファイルを開く
    await frame.click('[data-open="open"]');
    const fcP = page.waitForEvent('filechooser', { timeout: 8000 }).then(fc => fc).catch(e => null);
    await frame.click('#btnOpen');
    const fc = await fcP;
    R.openPicker = { fileChooser: !!fc, multiple: fc ? fc.isMultiple() : null, accept: await frame.evaluate(() => document.getElementById('fileInput').accept.split(',').length), pickerCalls: await frame.evaluate(() => window.__a13.log.filter(x => /showOpenFilePicker/.test(x.k)).length) };
    if (fc) {
      const seq = await frame.evaluate(() => window.__pcd.S.seq);
      await fc.setFiles([path.join(SAMPLE, 'pcl_binary.pcd'), path.join(SAMPLE, 'pyshp_points.shp'), path.join(SAMPLE, 'pyshp_points.shx'), path.join(SAMPLE, 'pyshp_points.dbf')]);
      await L.waitIdle(frame, { seq0: seq });
      const st = await L.fileStats(frame);
      R.openPicker.loaded = st.files.map(f => `${f.name}:${f.n}`); R.openPicker.msg = st.msg;
    }
    const tcP = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    await frame.click('#btnTraj');
    const tc = await tcP;
    R.trajPicker = { fileChooser: !!tc, multiple: tc ? tc.isMultiple() : null, accept: await frame.evaluate(() => document.getElementById('trajInput').accept) };
    if (tc) await tc.setFiles([]);
    // 2) ドラッグ＆ドロップ（ハンドラー）
    R.dnd = await frame.evaluate(async () => {
      const stage = document.getElementById('stage');
      const dt = new DataTransfer();
      const body = '# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 4\nHEIGHT 1\nPOINTS 4\nDATA ascii\n0 0 0\n1 0 0\n0 1 0\n0 0 1\n';
      dt.items.add(new File([body], 'dropped.pcd'));
      const fire = (type, target) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      const before = window.__pcd.S.files.length;
      fire('dragenter', stage); const dragClass1 = stage.classList.contains('drag');
      fire('dragenter', document.querySelector('.dock')); fire('dragleave', stage); const dragClass2 = stage.classList.contains('drag');
      fire('dragover', stage); const notCancelled = fire('drop', stage);
      const dragClass3 = stage.classList.contains('drag');
      await new Promise(r => setTimeout(r, 3000));
      return { dragClass1, dragClass2, dragClass3, dropDefaultPrevented: !notCancelled, filesBefore: before, filesAfter: window.__pcd.S.files.length, last: (window.__pcd.S.files.at(-1) || {}).name };
    });
    // 3) 画像の保存
    await frame.click('[data-open="view"]');
    R.shot = await frame.evaluate(() => { const b = document.getElementById('btnShot'); const r = b.getBoundingClientRect(); return { hidden: b.hidden, display: getComputedStyle(b).display, w: r.width, h: r.height }; });
    const d0 = logs.downloads.length, c0 = logs.console.length;
    R.shot.forced = await frame.evaluate(async () => { document.getElementById('btnShot').click(); await new Promise(r => setTimeout(r, 1500)); return { msg: document.getElementById('statMsg').textContent, aclick: window.__a13.log.filter(x => x.k === 'a.click') }; });
    await page.waitForTimeout(1500);
    R.shot.downloads = logs.downloads.slice(d0); R.shot.console = logs.console.slice(c0).filter(s => /download|sandbox/i.test(s));
    // 5) ライブのカード
    await frame.click('[data-open="live"]');
    await page.waitForTimeout(500);
    R.live = await frame.evaluate(() => ({ notApp: !document.getElementById('liveNotApp').hidden, notAppText: document.getElementById('liveNotApp').textContent, devices: document.getElementById('liveDevices').textContent, peers: document.getElementById('livePeers').textContent, demoBtn: !!document.getElementById('btnLiveDemo'), pcdLive: typeof window.pcdLive }));
    await page.screenshot({ path: `${L.OUT}/iframe_live_card.png` });
    await frame.click('#btnLiveDemo');
    await page.waitForTimeout(3500);
    R.live.demo = await frame.evaluate(() => ({ now: !document.getElementById('liveNow').hidden, src: document.getElementById('liveSrc').textContent, rate: document.getElementById('liveRate').textContent, shareBox: !document.getElementById('liveShareBox').hidden, msg: document.getElementById('statMsg').textContent, hiddenFiles: window.__pcd.S.files.filter(f => !f.points.visible).length, files: window.__pcd.S.files.length }));
    await page.screenshot({ path: `${L.OUT}/iframe_live_demo.png` });
    let seq = await frame.evaluate(() => window.__pcd.S.seq);
    await frame.click('#btnLiveSnap');
    await L.waitIdle(frame, { seq0: seq });
    R.live.snap = await L.fileStats(frame).then(s => ({ last: s.files.at(-1) && { name: s.files.at(-1).name, n: s.files.at(-1).n, fields: s.files.at(-1).fields }, msg: s.msg }));
    R.live.snapVisibleDuringLive = await frame.evaluate(() => { const S = window.__pcd.S; const f = S.files.at(-1); return { snapVisible: f.points.visible, liveOn: !document.getElementById('liveNow').hidden }; });
    await frame.click('#btnLiveStop');
    await page.waitForTimeout(800);
    R.live.stop = await frame.evaluate(() => ({ now: !document.getElementById('liveNow').hidden, pick: !document.getElementById('livePick').hidden, msg: document.getElementById('statMsg').textContent, visibleFiles: window.__pcd.S.files.filter(f => f.points.visible).length, files: window.__pcd.S.files.length }));
    // 全部閉じてからデモ
    await L.closeAll(frame);
    await frame.click('#btnLiveDemo');
    await page.waitForTimeout(800);
    R.live.demoNoFile = await frame.evaluate(() => ({ now: !document.getElementById('liveNow').hidden, msg: document.getElementById('statMsg').textContent }));
    // 6) title・キー操作・呼び出しの記録
    R.titles = await frame.evaluate(() => document.querySelectorAll('[title]').length);
    R.calls = await frame.evaluate(() => window.__a13.log.filter(x => x.k !== 'csp'));
    R.csp = await frame.evaluate(() => window.__a13.log.filter(x => x.k === 'csp'));
    R.dialogs = logs.dialogs; R.popups = logs.popups; R.downloads = logs.downloads; R.pageerror = logs.pageerror; R.console = logs.console.slice(0, 15);
    await ctx.close();
  }
  // ---------------- 4) localStorage
  R.storage = [];
  const storageScenes = [
    { name: 'sandbox に allow-same-origin なし（不透明なオリジン）', params: { csp: 'claude', sandbox: 'allow-scripts allow-forms allow-popups' } },
    { name: 'localStorage の getter が例外', params: { csp: 'claude' }, init: `if (location.port === '8831') Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });` },
    { name: '変な値（cap=abc, bg=-20）', params: { csp: 'claude' }, init: `if (location.port === '8831') { try { localStorage.setItem('pcdviewer.cap', 'abc'); localStorage.setItem('pcdviewer.bg', '-20'); } catch (e) {} }` },
    { name: '変な値（cap=1e9 の文字, bg=1e3）', params: { csp: 'claude' }, init: `if (location.port === '8831') { try { localStorage.setItem('pcdviewer.cap', '1e9'); localStorage.setItem('pcdviewer.bg', '1e3'); } catch (e) {} }` },
    { name: '保存したものが次回に戻るか（cap=1億, bg=30 を保存 → 読み直し）', params: { csp: 'claude' }, reload: true },
  ];
  for (const sc of storageScenes) {
    const { ctx, page, logs } = await L.newPage(browser, { init: sc.init });
    await page.goto(L.parentURL(sc.params), { waitUntil: 'commit' });
    let frame = await L.artFrame(page);
    const st = await L.waitStartup(frame, 90000);
    const r = { scene: sc.name, startupOk: !!(st && st.level), startupMsg: st && st.msg };
    r.initial = await frame.evaluate(() => ({ cap: document.getElementById('capSel').value, bg: document.getElementById('bgLight').value, bgVal: document.getElementById('bgLightVal').textContent, scene: getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() }));
    // 変えてみる
    await frame.evaluate(() => { const s = document.getElementById('capSel'); s.value = '100000000'; s.dispatchEvent(new Event('change', { bubbles: true })); const b = document.getElementById('bgLight'); b.value = '30'; b.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(300);
    r.afterChange = await frame.evaluate(() => ({ msg: document.getElementById('statMsg').textContent, bgVal: document.getElementById('bgLightVal').textContent }));
    if (sc.reload) {
      await page.reload({ waitUntil: 'commit' });
      frame = await L.artFrame(page);
      await L.waitStartup(frame, 90000);
      r.afterReload = await frame.evaluate(() => ({ cap: document.getElementById('capSel').value, bg: document.getElementById('bgLight').value }));
    }
    r.pageerror = logs.pageerror.slice(0, 5); r.console = logs.console.filter(s => !/favicon|404/.test(s)).slice(0, 5);
    R.storage.push(r);
    console.log(JSON.stringify(r));
    await ctx.close();
  }
  L.writeJSON('iframe.json', R);
  console.log(JSON.stringify(R, null, 1).slice(0, 6000));
  await browser.close(); await srv.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
