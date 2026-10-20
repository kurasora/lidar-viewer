// 説明の吹き出しが一切出ないことを、本物のマウスで確かめる（Electron・xvfb・自分の netns の中で）
//   heavy ip netns exec a061 xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" node tooltip_app.js
//   ・各状態で、見えている要素すべての真ん中（と 3D 画面の格子点）に X のポインタを動かして止め（DWELL ミリ秒）、
//     新しく出た override_redirect の窓（吹き出し）がないかを X の窓一覧で調べる
//   ・DOM の中の title 属性・SVG の <title>・見えている <input type=file> も全状態で数える
//   環境変数: DWELL（既定 1100）、QUICK=1 で要素を間引く
const L = require('./lib.js');
const S = require('./states.js');
const DWELL = +(process.env.DWELL || 1100);
(async () => {
  const { app, p, errors, close } = await L.electron({ w: 1280, h: 800, name: 'tooltip' });
  const cb = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
  L.fs.mkdirSync(L.SHOTS + '/tooltip', { recursive: true });
  const report = { contentBounds: cb, dwell: DWELL, states: [], popups: [], domTitles: [] };
  const hovered = new Set();
  const park = () => L.xmove(cb.x + cb.width - 3, cb.y + Math.round(cb.height / 2));
  park(); await L.sleep(500);
  let base = L.xwindows();
  const domScan = async state => {
    const r = await p.evaluate(() => ({
      titleAttr: [...document.querySelectorAll('[title]')].map(e => e.outerHTML.slice(0, 120)),
      svgTitle: [...document.querySelectorAll('svg title, title')].filter(t => t.parentElement && t.parentElement.tagName !== 'HEAD').map(e => e.outerHTML.slice(0, 120)),
      xlinkTitle: [...document.querySelectorAll('*')].filter(e => e.hasAttribute && e.hasAttribute('xlink:title')).length,
      visibleFile: [...document.querySelectorAll('input[type=file]')].filter(e => e.getClientRects().length).length,
      abbr: document.querySelectorAll('abbr').length,
    }));
    report.domTitles.push({ state, ...r });
  };
  const targets = async () => p.evaluate(quick => {
    const out = [], seen = new Set();
    const key = el => `${el.tagName}#${el.id}.${typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || ''}|${(el.textContent || '').trim().slice(0, 40)}|${el.getAttribute('aria-label') || ''}`;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      const x = Math.min(innerWidth - 2, Math.max(1, r.left + r.width / 2)), y = Math.min(innerHeight - 2, Math.max(1, r.top + r.height / 2));
      const top = document.elementFromPoint(x, y);
      if (!top || !(top === el || el.contains(top))) continue;
      if (seen.has(top)) continue; seen.add(top);
      if (top.tagName === 'CANVAS' && top.parentElement.id === 'stage') continue; // 3D 画面は格子点で別に
      out.push({ x, y, k: key(top), d: `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}「${(top.textContent || top.getAttribute('aria-label') || '').trim().slice(0, 20)}」` });
    }
    // 3D 画面の格子点（5 × 4）
    const c = document.querySelector('#stage > canvas').getBoundingClientRect();
    for (let i = 1; i <= 5; i++) for (let j = 1; j <= 4; j++) {
      const x = c.left + c.width * i / 6, y = c.top + c.height * j / 5, top = document.elementFromPoint(x, y);
      if (top && top.tagName === 'CANVAS') out.push({ x, y, k: `canvas@${i},${j}`, d: `canvas(${Math.round(x)},${Math.round(y)})` });
    }
    return quick ? out.filter((_, i) => i % 2 === 0) : out;
  }, process.env.QUICK === '1');
  const hoverState = async (state, opts = {}) => {
    await p.waitForTimeout(300);
    await domScan(state);
    const ts = await targets();
    const st = { state, targets: 0, skipped: 0, tooltips: [] };
    park(); await L.sleep(300);
    base = L.xwindows();
    for (const t of ts) {
      if (hovered.has(t.k) && !opts.all) { st.skipped++; continue; }
      hovered.add(t.k); st.targets++;
      L.xmove(cb.x + t.x, cb.y + t.y);
      await L.sleep(DWELL);
      const nw = L.xwindows().filter(w => !base.some(b => b.id === w.id) && w.override);
      if (nw.length) {
        const f = `${L.SHOTS}/tooltip/FOUND_${state}_${st.tooltips.length}.png`;
        L.xshot(f);
        st.tooltips.push({ target: t.d, x: Math.round(t.x), y: Math.round(t.y), windows: nw, shot: f });
        park(); await L.sleep(800);
      }
    }
    park();
    report.states.push(st);
    console.log(JSON.stringify({ state, targets: st.targets, skipped: st.skipped, tooltips: st.tooltips.length }));
  };

  await hoverState('T00_empty');
  await L.openCard(p, 'open'); await hoverState('T01_open_empty');
  await L.closeCards(p);
  await L.openFiles(p, [L.FILES + '/corr_int_label.pcd']);
  await p.setInputFiles('#trajInput', '/home/claude/pcd-viewer/sample/trajectory.txt'); await L.waitIdle(p);
  await hoverState('T03_loaded');
  await L.openCard(p, 'open'); await p.evaluate(() => { document.getElementById('infoBox').open = true; }); await hoverState('T04_open_files_info');
  for (const c of ['view', 'color', 'section', 'level', 'settings']) { await L.closeCards(p); await L.openCard(p, c); await hoverState('T05_' + c); }
  await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#tabColorDetail'); await hoverState('T06_color_detail');
  await p.click('#tabColorBasic');
  await L.closeCards(p); await L.openCard(p, 'section'); await p.click('#tabClip'); await hoverState('T06_clip');
  await p.click('#tabSec');
  // 断面を入れて、帯（しま）の設定も
  await L.closeCards(p);
  for (const c of ['open', 'view', 'color', 'section', 'level', 'settings']) await p.click(`[data-open="${c}"]`);
  await p.click('[data-tool="measure"]');
  const a = await S.findVisiblePoint(p), b = a && await S.findVisiblePoint(p, undefined, a.i + 300);
  if (a && b) { await p.mouse.click(a.x, a.y); await p.waitForTimeout(300); await p.mouse.click(b.x, b.y); await p.waitForTimeout(300); }
  await hoverState('T07_stack_measure');
  await L.closeCards(p);
  await p.click('[data-tool="info"]');
  const q = await S.findVisiblePoint(p);
  if (q) { await p.mouse.click(q.x, q.y); await p.waitForTimeout(500); }
  await hoverState('T08_pick', { all: false });
  await p.click('[data-tool="info"]');
  // ネイティブの部品: 色の選択（input type=color）と select の一覧を開いた状態でも調べる
  await L.closeCards(p); await L.openCard(p, 'open');
  const col = await p.evaluate(() => { const r = document.querySelector('#fileList input[type=color]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  park(); await L.sleep(300); base = L.xwindows();
  L.xclick(cb.x + col.x, cb.y + col.y); await L.sleep(1500);
  const pops = L.xwindows().filter(w => !base.some(b => b.id === w.id));
  L.xshot(`${L.SHOTS}/tooltip/T10_color_popup.png`);
  const popRes = { kind: 'input[type=color] の選択画面', windows: pops, tooltips: [] };
  for (const pw of pops) {
    const base2 = L.xwindows();
    for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) {
      L.xmove(pw.x + pw.w * i / 7, pw.y + pw.h * j / 7); await L.sleep(DWELL);
      const nw = L.xwindows().filter(w => !base2.some(b => b.id === w.id) && w.override);
      if (nw.length) { const f = `${L.SHOTS}/tooltip/FOUND_colorpopup_${i}_${j}.png`; L.xshot(f); popRes.tooltips.push({ at: [i, j], windows: nw, shot: f }); }
    }
  }
  report.popups.push(popRes);
  L.xkey('Escape'); await L.sleep(500);
  await L.closeCards(p); await L.openCard(p, 'display');
  const sel = await p.evaluate(() => { const r = document.getElementById('capSel').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  park(); await L.sleep(300); base = L.xwindows();
  L.xclick(cb.x + sel.x, cb.y + sel.y); await L.sleep(1200);
  const pops2 = L.xwindows().filter(w => !base.some(b => b.id === w.id));
  L.xshot(`${L.SHOTS}/tooltip/T11_select_popup.png`);
  const popRes2 = { kind: 'select（読み込む最大点数）の一覧', windows: pops2, tooltips: [] };
  for (const pw of pops2) {
    const base2 = L.xwindows();
    for (let j = 1; j <= 5; j++) {
      L.xmove(pw.x + pw.w / 2, pw.y + pw.h * j / 6); await L.sleep(DWELL);
      const nw = L.xwindows().filter(w => !base2.some(b => b.id === w.id) && w.override);
      if (nw.length) { const f = `${L.SHOTS}/tooltip/FOUND_selectpopup_${j}.png`; L.xshot(f); popRes2.tooltips.push({ at: j, windows: nw, shot: f }); }
    }
  }
  report.popups.push(popRes2);
  L.xkey('Escape'); await L.sleep(400);
  report.errors = errors;
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  L.fs.writeFileSync(L.W + '/out/tooltip_app.json', JSON.stringify(report, null, 1));
  console.log('TOTAL tooltips:', report.states.reduce((a, s) => a + s.tooltips.length, 0), 'popup tooltips:', report.popups.map(x => x.tooltips.length), 'dom:', JSON.stringify(report.domTitles.filter(d => d.titleAttr.length || d.svgTitle.length || d.xlinkTitle || d.visibleFile || d.abbr)));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
