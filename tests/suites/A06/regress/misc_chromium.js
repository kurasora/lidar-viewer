// その他の見た目の確認（Chromium）: 拡大率（DPR）が途中で変わったとき・測定中の表示の端・ドラッグ中の表示・強制カラー・
//   動きを減らす設定・900×600 で案内と知らせの重なり・背景を明るくしたときの文字・メッシュの情報の注記
const L = require('./lib.js');
const S = require('./states.js');
const { check } = require('./layout_checks.js');
(async () => {
  const out = {};
  const D = 'misc'; L.fs.mkdirSync(L.SHOTS + '/' + D, { recursive: true });
  // 1) DPR が 1 → 2 に変わる（拡大率の違う画面へ窓を移したのと同じ）
  {
    const { b, ctx, p, close } = await L.chromium({ w: 1280, h: 800, dpr: 1 });
    await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
    const cs = () => p.evaluate(() => { const c = window.__pcd.renderer.domElement; return { dpr: devicePixelRatio, canvas: [c.width, c.height], css: [c.clientWidth, c.clientHeight], rendererPR: window.__pcd.renderer.getPixelRatio() }; });
    out.dpr_before = await cs();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
    await p.waitForTimeout(1500);
    out.dpr_after = await cs();
    await L.shot(p, `${D}/dpr_changed_1to2`);
    await close();
    const c2 = await L.chromium({ w: 1280, h: 800, dpr: 2 });
    await L.openFiles(c2.p, [L.FILES + '/corr_intensity.pcd']);
    out.dpr_fresh2 = await c2.p.evaluate(() => { const c = window.__pcd.renderer.domElement; return { dpr: devicePixelRatio, canvas: [c.width, c.height], rendererPR: window.__pcd.renderer.getPixelRatio() }; });
    await L.shot(c2.p, `${D}/dpr_fresh2`);
    await c2.close();
  }
  const { p, close, errors } = await L.chromium({ w: 900, h: 600 });
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  // 2) 測定中の長さの表示（mLive）は 0.4.2 でなくした（2 点目を選ぶ前の表示はない）ので、確かめない
  await p.click('[data-tool="measure"]'); await L.closeCards(p);
  await p.keyboard.press('Escape');
  // 3) 900×600: 距離の案内と、長い知らせの重なり
  await p.evaluate(() => { const el = document.getElementById('statMsg'); el.textContent = '軌跡 trajectory.txt を開きました（テキスト、2,359 姿勢、226.0 m、471.6 秒）'; });
  await p.waitForTimeout(200);
  out.guide_vs_msg = await check(p);
  await L.shot(p, `${D}/guide_vs_msg_900`);
  await p.click('[data-tool="measure"]');
  // 4) ドラッグ中の表示
  await p.evaluate(() => { const dt = new DataTransfer(); window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true })); });
  await p.waitForTimeout(200); await L.shot(p, `${D}/drag_overlay`);
  await p.evaluate(() => { window.dispatchEvent(new DragEvent('dragleave', { bubbles: true })); });
  // 5) 背景をいちばん明るく（50）して、右上の文字・誤りの知らせ・空の画面の案内
  await p.evaluate(v => { const s = document.getElementById('bgLight'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }, 50);
  await L.openAs(p, L.FILES + '/scan.rdb', ['scan.rdb']);
  await L.closeCards(p);
  await L.shot(p, `${D}/bg50_error`);
  await L.closeAll(p);
  await p.waitForTimeout(300); await L.shot(p, `${D}/bg50_empty`);
  await p.evaluate(v => { const s = document.getElementById('bgLight'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }, 14);
  // 6) メッシュ（注記つき）の情報
  await L.openFiles(p, ['/home/claude/pcd-viewer/sample/formats/cc_mesh.stl']);
  await L.openCard(p, 'open'); await p.evaluate(() => { document.getElementById('infoBox').open = true; document.getElementById('infoBox').scrollIntoView(); });
  out.noteStyle = await p.evaluate(() => { const m = document.querySelector('#info .muted'); if (!m) return null; const cs = getComputedStyle(m), dd = getComputedStyle(m.parentElement); return { text: m.textContent, color: cs.color, ddColor: dd.color, muted: getComputedStyle(document.documentElement).getPropertyValue('--muted') }; });
  await L.shot(p, `${D}/mesh_info_note`);
  await L.closeAll(p); await L.closeCards(p);
  // 7) 天井のない点群で「天井を隠す」ボタンの状態
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  out.ceil = await p.evaluate(() => ({ ceilZ: window.__pcd.S.ceilZ, btnOn: document.getElementById('btnCeil').classList.contains('on') }));
  await L.closeAll(p);
  // 8) 動きを減らす設定・強制カラー（Windows のハイコントラスト）
  await close();
  {
    const c3 = await L.chromium({ w: 1280, h: 800, reducedMotion: 'reduce', forcedColors: 'active' });
    await L.openFiles(c3.p, [L.FILES + '/corr_int_label.pcd']);
    for (const c of ['color', 'display', 'section', 'level', 'settings']) {
      await L.closeCards(c3.p); await L.openCard(c3.p, c);
      if (c === 'color') { await c3.p.click('#tabColorDetail'); }
      await L.shot(c3.p, `${D}/forced_${c}`);
    }
    out.reduced = await c3.p.evaluate(() => ({ ptabTransition: getComputedStyle(document.createElement('div')).transition, popTransition: getComputedStyle(document.getElementById('pop')).transitionDuration }));
    await c3.close();
  }
  out.errors = errors;
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  L.fs.writeFileSync(L.W + '/out/misc_chromium.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
