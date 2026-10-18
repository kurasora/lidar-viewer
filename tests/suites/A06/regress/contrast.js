// 文字と背景の対比（WCAG 2.x のコントラスト比）を、画面のすべての文字について計算する（Chromium）
//   node contrast.js [背景の明るさの一覧 例 "0,14,30,50"]
//   ・文字の色: 計算済みの color（要素と祖先の opacity を合成）
//   ・背景: 祖先をたどって背景色を合成（半透明は下の色と混ぜる）。3D 画面の上の文字は、画面の背景（--scene）を背景とする
//   ・基準: 4.5:1（大きな文字 24px 以上・太字 18.66px 以上は 3:1）
//   ・部品の境界や選択状態（1.4.11、3:1）も主なものを計算する
const L = require('./lib.js');
const PAGEFN = () => {
  const parse = s => {
    if (!s || s === 'transparent') return [0, 0, 0, 0];
    let m = s.match(/^rgba?\(([^)]+)\)/);
    if (m) { const v = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; }
    m = s.match(/^color\(srgb ([^)]+)\)/);
    if (m) { const v = m[1].split(/[\s\/]+/).filter(Boolean).map(Number); return [v[0] * 255, v[1] * 255, v[2] * 255, v.length > 3 ? v[3] : 1]; }
    // 名前の色など: いったん要素に塗って読み直す
    const d = document.createElement('div'); d.style.color = s; document.body.append(d); const c = getComputedStyle(d).color; d.remove();
    return c === s ? [0, 0, 0, 1] : parse(c);
  };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  // 背景: 祖先の背景色を下から順に重ねる
  const bgOf = el => {
    const chain = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) chain.push(e);
    let c = parse(getComputedStyle(document.body).backgroundColor);
    for (const e of chain.reverse()) {
      const cs = getComputedStyle(e);
      const b = parse(cs.backgroundColor);
      if (b[3] > 0) c = over([b[0], b[1], b[2], b[3] * (+cs.opacity || 1)], c);
    }
    return c;
  };
  const opac = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const rows = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.textContent.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || seen.has(el) || !vis(el) || el.closest('.sr, select[hidden], [aria-hidden=true]')) continue;
    if (el.closest('svg') && el.tagName !== 'text') continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const bg = bgOf(el);
    let fg = parse(el.tagName === 'text' ? cs.fill : cs.color);
    fg = over([fg[0], fg[1], fg[2], fg[3] * opac(el)], bg);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 600;
    const need = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
    const r = ratio(fg, bg);
    rows.push({ text: t.slice(0, 40), el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').join('.') : ''), fg: hex(fg), bg: hex(bg), size, bold, ratio: +r.toFixed(2), need, ok: r >= need });
  }
  // 部品の境界・選択状態
  const ui = [];
  const add = (name, a, b, need = 3) => ui.push({ name, a: hex(a), b: hex(b), ratio: +ratio(a, b).toFixed(2), need, ok: ratio(a, b) >= need });
  const css = v => parse(getComputedStyle(document.documentElement).getPropertyValue(v).trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`));
  const pop = document.getElementById('pop');
  const popBg = vis(pop) ? bgOf(pop) : over([...css('--panel').slice(0, 3), 0.94], css('--scene'));
  add('つまみの溝（塗っていない所）の縁 --line と カードの背景', css('--line'), popBg);
  add('つまみの溝の中 --sunk と カードの背景', css('--sunk'), popBg);
  add('つまみの丸 --fg と 溝 --sunk', css('--fg'), css('--sunk'));
  add('つまみの塗った所 --accent と カードの背景', css('--accent'), popBg);
  const segBg = over([...css('--scene').slice(0, 3), 0.6], css('--panel'));
  add('切り替え（くっきり/なめらか/しま・基本/詳細・断面/切り出し）の選ばれた背景 --line と 台の背景', css('--line'), segBg);
  add('切り替えの選ばれた文字 --fg と 選ばれていない文字 --muted', css('--fg'), css('--muted'));
  add('ボタンの枠 --line と カードの背景', css('--line'), popBg);
  add('フォーカスの輪 --accent と カードの背景', css('--accent'), popBg);
  add('ドックの開いているボタンの文字 --accent と その背景', css('--accent'), over([...css('--accent').slice(0, 3), 0.18], over([...css('--panel').slice(0, 3), 0.92], css('--scene'))), 4.5);
  return { rows, ui, scene: hex(css('--scene')) };
};
(async () => {
  const levels = (process.argv[2] || '0,14,30,50').split(',').map(Number);
  const { p, close } = await L.chromium({ w: 1280, h: 800 });
  await L.openFiles(p, [L.FILES + '/corr_int_label.pcd']);
  await p.setInputFiles('#trajInput', '/home/claude/pcd-viewer/sample/trajectory.txt'); await L.waitIdle(p);
  const all = {};
  const collect = async (state, lv) => {
    const r = await p.evaluate(PAGEFN);
    for (const x of r.rows) { const k = `${lv}|${x.el}|${x.fg}|${x.bg}`; if (!all[k]) all[k] = { level: lv, scene: r.scene, state, ...x }; }
    return r;
  };
  let ui = null;
  for (const lv of levels) {
    await p.evaluate(v => { const s = document.getElementById('bgLight'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }, lv);
    await L.closeCards(p);
    await p.evaluate(() => { document.getElementById('navHint').hidden = false; });
    await collect('loaded', lv);
    // 誤りの知らせ（赤）
    await L.openAs(p, L.FILES + '/scan.rdb', ['scan.rdb']);
    await collect('error', lv);
    for (const c of ['open', 'live', 'view', 'color', 'display', 'section', 'level']) {
      await L.closeCards(p); await L.openCard(p, c);
      if (c === 'open') await p.evaluate(() => { document.getElementById('infoBox').open = true; });
      const r = await collect(c, lv); if (c === 'display' && lv === 14) ui = r.ui;
    }
    await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#tabColorDetail'); await collect('color_detail', lv); await p.click('#tabColorBasic');
    await L.closeCards(p);
    for (const c of ['live', 'open', 'view']) await p.click(`[data-open="${c}"]`);
    await collect('stack', lv);
    await L.closeCards(p);
  }
  const rows = Object.values(all);
  const bad = rows.filter(r => !r.ok).sort((a, b) => a.ratio - b.ratio);
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  L.fs.writeFileSync(L.W + '/out/contrast.json', JSON.stringify({ rows, ui }, null, 1));
  console.log('文字の数', rows.length, '基準未満', bad.length);
  const uniq = {};
  for (const b of bad) { const k = `${b.el}|${b.fg}|${b.bg}`; (uniq[k] = uniq[k] || { ...b, levels: [] }).levels.push(b.level); }
  for (const u of Object.values(uniq)) console.log(`  ${u.ratio}:1 (要 ${u.need}) 背景の明るさ ${u.levels.join('/')} ${u.el}「${u.text}」 文字 ${u.fg} 背景 ${u.bg} ${u.size}px`);
  console.log('部品の境界・選択状態（背景の明るさ 14）');
  for (const x of ui || []) console.log(`  ${x.ok ? 'OK ' : 'NG '} ${x.ratio}:1 (要 ${x.need}) ${x.name} ${x.a} / ${x.b}`);
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
