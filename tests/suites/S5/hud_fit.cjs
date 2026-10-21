// 右上の表示（点数・投影・知らせ）と下の操作の案内の下地の箱が、日本語・英語とも文字の幅に合っているか（Chromium・dist/index.html）
//   折り返した長い文で箱が最大幅のまま残っていた（英語で目立った）。カードを開くと 900×600 で案内とカードが重なっていた
//   使い方: node tests/suites/S5/hud_fit.cjs   （http://127.0.0.1:8740/abs/… の配り口が要る: tests/env/bin/servedist）
'use strict';
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const PAGE = process.env.PAGE || `http://127.0.0.1:8740/abs${ROOT}/dist/index.html`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let n = 0, ng = 0;
  const ok = (name, cond, detail) => { n++; if (!cond) ng++; console.log(`${cond ? 'OK' : 'NG'}  ${name}  … ${detail}`); };
  // 箱の幅 − 文字の行の一番広い所（左右の余白 16 px ＋丸め 1〜2 px を超えたら合っていない）
  const extra = p => p.evaluate(() => [...document.querySelectorAll('.hud > span, #navHint')].filter(s => s.textContent && !s.hidden && s.getBoundingClientRect().width).map(s => {
    const b = s.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(s);
    let lo = 1e9, hi = -1e9; for (const q of rg.getClientRects()) if (q.width) { lo = Math.min(lo, q.left); hi = Math.max(hi, q.right); }
    const cs = getComputedStyle(s); return { id: s.id, extra: Math.round(b.width - (hi - lo) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), h: Math.round(b.height), sw: s.style.width, t: s.textContent.slice(0, 40) };
  }));
  for (const lang of ['ja', 'en']) for (const [w, h] of [[1280, 800], [900, 600]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(PAGE);
    await p.evaluate(l => localStorage.setItem('pcdviewer.settings', JSON.stringify({ lang: l })), lang);
    await p.reload(); await p.waitForFunction(() => window.__pcd);
    // 長い点数の表示（天井・切り出しの注記つき）になる地図と、開けないファイルの知らせ
    await p.setInputFiles('#fileInput', [path.join(ROOT, 'sample/map.laz')]); await p.waitForTimeout(4500);
    let r = await extra(p);
    ok(`${lang} ${w}×${h}: 地図を開いたあとの右上の箱が文字に合う`, r.every(x => x.extra <= 3), JSON.stringify(r));
    await p.setInputFiles('#fileInput', [path.join(ROOT, 'sample/formats/pcl_binary.pcd'), path.join(ROOT, 'README.md')]); await p.waitForTimeout(3500);
    r = await extra(p);
    ok(`${lang} ${w}×${h}: 開けなかったときの知らせの箱も合う`, r.every(x => x.extra <= 3), JSON.stringify(r));
    // カードを開いて案内を出す: 案内はカードと重ならず、箱は文字に合う
    await p.click('[data-open="open"]'); await p.evaluate(() => { document.getElementById('navHint').hidden = false; }); await p.waitForTimeout(400);
    const ov = await p.evaluate(() => { const a = document.getElementById('pop').getBoundingClientRect(), c = document.getElementById('navHint').getBoundingClientRect(); return { overlap: a.right > c.left && c.right > a.left && a.bottom > c.top && c.bottom > a.top, pop: [a.left, a.right, a.bottom].map(Math.round), hint: [c.left, c.right, c.top].map(Math.round) }; });
    r = await extra(p);
    ok(`${lang} ${w}×${h}: カードを開いても下の案内と重ならない`, !ov.overlap, JSON.stringify(ov));
    ok(`${lang} ${w}×${h}: 下の案内の箱も文字に合う`, r.filter(x => x.id === 'navHint').every(x => x.extra <= 3), JSON.stringify(r.filter(x => x.id === 'navHint')));
    await p.close();
  }
  await b.close();
  console.log(`\n${n - ng} / ${n} OK`);
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
