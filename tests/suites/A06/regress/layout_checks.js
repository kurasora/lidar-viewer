// 画面の崩れを自動で調べる（ページの中で動かす）
//   ・画面の外にはみ出した部品 ・文字が省略（…）や切れで読めない部品 ・カードの横スクロール
//   ・浮かんでいる箱どうしの重なり ・ラベルが 2 行以上に折り返している所
module.exports.check = async function check(p) {
  return p.evaluate(() => {
    const vw = innerWidth, vh = innerHeight, issues = [];
    const vis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
    const desc = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).join('.'); const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30); return t ? `${s}「${t}」` : s; };
    const R = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    // 1) 画面の外（1px の余裕）
    const scope = [...document.querySelectorAll('#pop *, #pop, .ptab, .dock, .dock *, .hud span, #mGuide, #navHint, #progress, #progress *, #pickBox, #mLive, .labels .mnum, .empty p')].filter(vis);
    for (const el of scope) {
      const r = el.getBoundingClientRect();
      // カードの中でスクロールして見えなくなっているだけのものは除く（カードの見える範囲の外）
      const pop = el.closest('#pop');
      if (pop && el !== pop) { const pr = pop.getBoundingClientRect(); if (r.bottom > pr.bottom - 1 || r.top < pr.top - 1) continue; } // カードの中でスクロールして隠れている所は除く
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) issues.push({ kind: '画面外', el: desc(el), rect: R(el), vw, vh });
    }
    // 2) 文字が入りきらない（省略・切れ）。overflow が visible でなく、中身が箱より大きい
    for (const el of scope) {
      if (!el.childNodes.length || el.children.length > 3 || el.closest('.sr')) continue;
      const cs = getComputedStyle(el);
      const txt = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!txt) continue;
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible') issues.push({ kind: cs.textOverflow === 'ellipsis' ? '省略（…）' : '横に切れ', el: desc(el), sw: el.scrollWidth, cw: el.clientWidth, text: el.textContent.slice(0, 120) });
      else if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible' && cs.whiteSpace.startsWith('nowrap')) issues.push({ kind: '箱からはみ出し', el: desc(el), sw: el.scrollWidth, cw: el.clientWidth, text: el.textContent.slice(0, 120) });
    }
    // 3) カードの横スクロール
    const pop = document.getElementById('pop');
    if (vis(pop) && pop.scrollWidth > pop.clientWidth + 1) issues.push({ kind: 'カードが横にスクロール', sw: pop.scrollWidth, cw: pop.clientWidth });
    // 4) 箱どうしの重なり
    const boxes = [];
    const add = (name, el) => { if (vis(el)) boxes.push({ name, r: el.getBoundingClientRect() }); };
    add('カード', pop); add('距離の案内', document.getElementById('mGuide')); add('操作の案内', document.getElementById('navHint'));
    add('ドック', document.getElementById('dock')); add('読み込み中', document.getElementById('progress'));
    add('座標の吹き出し', document.getElementById('pickBox')); add('測定中の表示', document.getElementById('mLive'));
    for (const s of document.querySelectorAll('.hud span')) if (s.textContent.trim()) add('右上 ' + s.id, s);
    document.querySelectorAll('.ptab').forEach(t => add('重なったカードの見出し「' + t.textContent + '」', t));
    const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const tabA = a.name.startsWith('重なった'), tabB = b.name.startsWith('重なった');
      if ((tabA && (tabB || b.name === 'カード')) || (tabB && a.name === 'カード')) continue; // 仕様の重なり
      if (a.name.startsWith('右上') && b.name.startsWith('右上')) continue;
      const o = ov(a.r, b.r);
      if (o > 4) issues.push({ kind: '重なり', a: a.name, b: b.name, area: Math.round(o) });
    }
    // 5) ラベルの折り返し（1 行のはずの短いラベル）
    for (const el of [...document.querySelectorAll('#pop .row > label, #pop .crow .lbl, #pop .srow label, #pop .srow .lbl, #pop .check, .dock button, .ptab, #pop summary, #pop button')].filter(vis)) {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
      // 文字の部分だけの行数（チェックボックスなどの部品は数えない）
      const rects = [];
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (!n.textContent.trim() || n.parentElement.closest('.sr')) continue; const rg = document.createRange(); rg.selectNodeContents(n); rects.push(...rg.getClientRects()); }
      const lines = new Set(rects.filter(r => r.width > 0).map(r => Math.round(r.top / 4))).size;
      if (lines > 1 && !el.matches('.dock button, #pop .ctiles button, #pop .axes3 button, #pop .bigbtns button')) issues.push({ kind: '折り返し', el: desc(el), lines, w: Math.round(el.getBoundingClientRect().width), lh });
    }
    return issues;
  });
};
