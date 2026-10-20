// キーボードだけの操作（Tab の順番・フォーカスの見え方・Esc・ショートカットと修飾キー）
//   node keyboard.js            … Chromium
//   ELECTRON=1 node keyboard.js … Electron（xvfb-run の中で）
const L = require('./lib.js');
const DESC = () => { const e = document.activeElement; if (!e || e === document.body) return { d: 'body' }; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  const name = e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent.trim()) || (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return { d: `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.type ? '[' + e.type + ']' : ''}「${name}」`, inPop: !!e.closest('#pop'), inDock: !!e.closest('#dock'), vis: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight,
    fv: e.matches(':focus-visible'), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; };
(async () => {
  const E = process.env.ELECTRON === '1';
  const ctx = E ? await L.electron({ w: 1280, h: 800, name: 'kbd' }) : await L.chromium({ w: 1280, h: 800 });
  const p = ctx.p;
  const res = {};
  const tabSeq = async (n, start) => {
    if (start) await p.evaluate(s => document.querySelector(s).focus(), start); else await p.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    const seq = [];
    for (let i = 0; i < n; i++) { await p.keyboard.press('Tab'); seq.push(await p.evaluate(DESC)); }
    return seq;
  };
  // 1) 何も開いていないときの Tab の順
  res.tab_empty = await tabSeq(14);
  // 2) 色のカードをキーボードで開く → カードの中にどう入るか
  await p.evaluate(() => document.querySelector('[data-open="color"]').focus());
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  res.after_enter_color = { popName: await p.evaluate(() => document.getElementById('pop').dataset.name), focus: await p.evaluate(DESC) };
  const seq = [];
  for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); const d = await p.evaluate(DESC); seq.push(d); if (d.inPop) break; }
  res.tabs_from_dock_to_card = { presses: seq.length, reached: seq[seq.length - 1], path: seq.map(s => s.d) };
  // 3) Esc でカードを閉じる（フォーカスの位置ごと）
  await L.openFiles(p, [L.FILES + '/corr_int_label.pcd']);
  const escCases = [
    ['なし（body）', null, 'display'],
    ['ドックのボタン', '[data-open="settings"]', 'display'],
    ['カードの閉じるボタン', '#popClose', 'display'],
    ['カードのチェックボックス', '#showAxes', 'display'],
    ['カードのつまみ（range）', '#pointSize', 'display'],
    ['カードの select', '#capSel', 'display'],
    ['色のカードのタイル（button）', '#colorBasic [data-val="height"]', 'color'],
    ['2 つつまみの下限（range）', '#colorRange input', 'color'],
    ['ファイルの一覧のチェックボックス', '#fileList input[type=checkbox]', 'open'],
    ['ファイルの一覧の色（input color）', '#fileList input[type=color]', 'open'],
  ];
  res.esc = [];
  for (const [label, sel, card] of escCases) {
    await L.closeCards(p); await L.openCard(p, card);
    if (card === 'color' && sel && sel.includes('colorRange')) await p.click('#tabColorDetail');
    if (sel) await p.evaluate(s => document.querySelector(s).focus(), sel); else await p.evaluate(() => document.activeElement && document.activeElement.blur());
    const before = await p.evaluate(DESC);
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    const after = await p.evaluate(() => ({ pop: document.getElementById('pop').hidden ? null : document.getElementById('pop').dataset.name }));
    const focusAfter = await p.evaluate(DESC);
    res.esc.push({ case: label, focus: before.d, closed: after.pop === null, popAfter: after.pop, focusAfter: focusAfter.d });
    if (card === 'color') await p.click('#tabColorBasic').catch(() => {});
  }
  // 4) カードを閉じたあとのフォーカスの行き先（×ボタン・ドックのボタン）
  await L.closeCards(p); await L.openCard(p, 'view');
  await p.evaluate(() => document.getElementById('popClose').focus()); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  res.focus_after_close_button = await p.evaluate(DESC);
  // 5) 修飾キー付きのショートカット（Ctrl+C でコピーしようとすると…）
  const state = () => p.evaluate(() => ({ hideCeil: window.__pcd.S ? document.getElementById('btnCeil').classList.contains('on') : null, proj: document.getElementById('btnProj').textContent, tools: { ...window.__pcd.S.tools }, cam: window.__pcd.cam.position.toArray().map(v => +v.toFixed(2)), msg: document.getElementById('statMsg').textContent }));
  await L.closeCards(p);
  await L.openCard(p, 'open'); await p.evaluate(() => { document.getElementById('infoBox').open = true; });
  res.mod = [];
  for (const combo of ['Control+c', 'Control+a', 'Control+s', 'Control+f', 'Control+t', 'Control+p', 'Control+m', 'Control+i', 'Alt+c', 'Shift+C', 'Meta+c']) {
    // 情報の欄の文字（ファイル名）を選んでからキーを押す
    await p.evaluate(() => { const dd = document.querySelector('#info dd'); const r = document.createRange(); r.selectNodeContents(dd); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.activeElement && document.activeElement.blur(); });
    const b = await state();
    await p.keyboard.press(combo); await p.waitForTimeout(600);
    const a = await state();
    const changed = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]) && k !== 'msg');
    const clip = (E && combo === 'Control+c') ? await ctx.app.evaluate(({ clipboard }) => clipboard.readText()) : undefined;
    res.mod.push({ combo, changed, msg: a.msg !== b.msg ? a.msg : '', ceilFound: await p.evaluate(() => !!window.__pcd.S.ceilZ), clipboard: clip });
    // 元に戻す
    if (a.tools.measure) await p.evaluate(() => document.querySelector('[data-tool="measure"]').click());
    if (a.tools.info) await p.evaluate(() => document.querySelector('[data-tool="info"]').click());
    if (a.proj !== b.proj) await p.evaluate(() => document.getElementById('btnProj').click());
    if (a.hideCeil !== b.hideCeil) await p.evaluate(() => document.getElementById('btnCeil').click());
    await L.openCard(p, 'open');
  }
  // 6) Delete / Backspace はフォーカスがボタンにあっても計測を消すか
  res.notes = [];
  // 7) 矢印キーでラジオ・タブを移れるか（WAI-ARIA の作法）
  await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#tabColorDetail');
  await p.evaluate(() => document.querySelector('#colorDetail .segc [data-val="1"]').focus());
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  res.arrow_radio = { focus: (await p.evaluate(DESC)).d, mapMode: await p.evaluate(() => document.getElementById('mapMode').value) };
  await p.evaluate(() => document.getElementById('tabColorBasic').focus());
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  res.arrow_tab = { focus: (await p.evaluate(DESC)).d, detailShown: await p.evaluate(() => !document.getElementById('colorDetail').hidden) };
  // 8) 3D 画面をキーボードで回せるか
  await L.closeCards(p);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const c0 = (await state()).cam;
  for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp', '+', '-']) await p.keyboard.press(k);
  await p.waitForTimeout(400);
  res.arrow_camera = { before: c0, after: (await state()).cam };
  // 9) フォーカスできない操作部品（クリックだけで動くもの）
  res.unfocusable_clickables = await p.evaluate(() => [...document.querySelectorAll('#fileList .name, #trajList .name, .mtable tr, #pivot, .handles g')].map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className)} tabIndex=${e.tabIndex}`));
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  L.fs.writeFileSync(L.W + `/out/keyboard_${E ? 'electron' : 'chromium'}.json`, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
  await ctx.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
