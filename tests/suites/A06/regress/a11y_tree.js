// 読み上げ用の名前・役割（アクセシビリティ木）と、押す所の大きさ（WCAG 2.2 の 24×24 px）を調べる（Chromium）
const L = require('./lib.js');
(async () => {
  const { ctx, p, close } = await L.chromium({ w: 1280, h: 800 });
  await L.openFiles(p, [L.FILES + '/corr_int_label.pcd']);
  await p.setInputFiles('#trajInput', '/home/claude/pcd-viewer/sample/trajectory.txt'); await L.waitIdle(p);
  const cdp = await ctx.newCDPSession(p);
  const out = { states: {} };
  const interesting = new Set(['button', 'checkbox', 'slider', 'combobox', 'radio', 'tab', 'tabpanel', 'radiogroup', 'tablist', 'textbox', 'link', 'img', 'progressbar', 'status', 'switch', 'menuitem', 'ColorWell', 'spinbutton', 'group', 'navigation', 'complementary', 'table', 'row', 'cell', 'columnheader']);
  const snap = async state => {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const rows = [];
    for (const n of nodes) {
      if (n.ignored) continue;
      const role = n.role && n.role.value;
      if (!interesting.has(role)) continue;
      const name = (n.name && n.name.value) || '';
      const props = Object.fromEntries((n.properties || []).map(x => [x.name, x.value && x.value.value]));
      rows.push({ role, name, props });
    }
    // 押す所の大きさ
    const small = await p.evaluate(() => {
      const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
      return [...document.querySelectorAll('button, input:not([type=hidden]), select, summary, [role=button]')].filter(vis).filter(el => !el.closest('.dtrack')).map(el => { const r = el.getBoundingClientRect(); return { el: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.type ? '[' + el.type + ']' : ''}「${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 16)}」`, w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.w < 24 || x.h < 24);
    });
    out.states[state] = { rows, small };
  };
  await snap('loaded');
  for (const c of ['open', 'view', 'color', 'display', 'section', 'level']) { await L.closeCards(p); await L.openCard(p, c); if (c === 'open') await p.evaluate(() => { document.getElementById('infoBox').open = true; }); await snap(c); }
  await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#tabColorDetail'); await snap('color_detail');
  await L.closeCards(p); await p.click('[data-tool="measure"]');
  // 計測を 1 本
  const S = require('./states.js');
  const a = await S.findVisiblePoint(p), b = a && await S.findVisiblePoint(p, undefined, a.i + 300);
  if (a && b) { await p.mouse.click(a.x, a.y); await p.waitForTimeout(300); await p.mouse.click(b.x, b.y); await p.waitForTimeout(300); }
  await snap('measure');
  // まとめ: 名前のないもの・同じ名前が並ぶもの・状態を伝えない切り替えボタン
  const all = Object.entries(out.states).flatMap(([s, v]) => v.rows.map(r => ({ s, ...r })));
  const noName = all.filter(r => !r.name.trim() && ['button', 'checkbox', 'slider', 'combobox', 'radio', 'tab', 'ColorWell', 'link'].includes(r.role));
  const dupNames = {};
  for (const [s, v] of Object.entries(out.states)) { const c = {}; for (const r of v.rows) if (['button', 'ColorWell', 'checkbox'].includes(r.role)) c[r.role + ':' + r.name] = (c[r.role + ':' + r.name] || 0) + 1; for (const [k, n] of Object.entries(c)) if (n > 1) dupNames[k] = Math.max(dupNames[k] || 0, n); }
  const smallU = {}; for (const v of Object.values(out.states)) for (const x of v.small) smallU[x.el] = x;
  out.summary = { noName: [...new Set(noName.map(r => `${r.s}: ${r.role}`))], dupNames, small: Object.values(smallU),
    roles: [...new Set(all.map(r => `${r.role}「${r.name}」${r.props.pressed !== undefined ? ' pressed=' + r.props.pressed : ''}${r.props.checked !== undefined ? ' checked=' + r.props.checked : ''}${r.props.expanded !== undefined ? ' expanded=' + r.props.expanded : ''}${r.props.selected !== undefined ? ' selected=' + r.props.selected : ''}`))] };
  L.fs.writeFileSync(L.W + '/out/a11y_tree.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.summary, null, 1));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
