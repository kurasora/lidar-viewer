// スクロールバー（カプセル形）とつまみ（溝のスライダー）の見え方と操作（Electron。headless の Chromium はスクロールバーを描かないため）
//   heavy xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" node scroll_slider.js [DPR]
const L = require('./lib.js');
const crop = (src, dst, box, scale = 4) => require('child_process').execFileSync('python3', ['-c',
  `from PIL import Image\nim=Image.open('${src}')\nc=im.crop(${JSON.stringify(box)})\nc=c.resize((c.width*${scale},c.height*${scale}),Image.NEAREST)\nc.save('${dst}')`]);
(async () => {
  const dpr = +(process.argv[2] || 1);
  const { app, p, close, errors } = await L.electron({ w: 900, h: 600, dpr, name: 'scroll' + dpr });
  const out = { dpr };
  const D = `${L.SHOTS}/scroll_d${dpr}`; L.fs.mkdirSync(D, { recursive: true });
  const shotFull = async n => { const f = `${D}/${n}.png`; await p.screenshot({ path: f }); return f; };
  // 1) スクロールバー: 30 個のファイルで「開く」のカードをあふれさせる
  await L.openAs(p, L.FILES + '/corr_xyz.pcd', Array.from({ length: 30 }, (_, i) => `scan_${String(i + 1).padStart(2, '0')}.pcd`));
  await L.openCard(p, 'open');
  const geo = () => p.evaluate(() => { const e = document.getElementById('pop'); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, st: e.scrollTop, sh: e.scrollHeight, ch: e.clientHeight, cw: e.clientWidth, ow: e.offsetWidth }; });
  const g = await geo(); out.pop = g;
  const f1 = await shotFull('01_scrollbar');
  // スクロールバーの部分を拡大（右端 16px、上から下まで）。写真は CSS px × DPR
  crop(f1, `${D}/01_scrollbar_zoom_top.png`, [Math.round((g.x + g.w - 18) * dpr), Math.round(g.y * dpr), Math.round((g.x + g.w + 2) * dpr), Math.round((g.y + 120) * dpr)], 6 / dpr);
  // つまみの位置を計算して、マウスでドラッグする
  const sbW = g.ow - g.cw - 2; // 縦のスクロールバーの幅（枠 1px × 2 を除く）
  out.scrollbarWidth = sbW;
  const track0 = g.y + 1 + 6, trackLen = g.h - 2 - 12, thumbLen = Math.max(18, trackLen * g.ch / g.sh);
  const tx = g.x + g.w - 1 - sbW / 2, ty = track0 + thumbLen / 2;
  await p.mouse.move(tx, ty); await p.mouse.down(); await p.mouse.move(tx, ty + 60, { steps: 6 }); await p.mouse.move(tx, ty + 120, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(300);
  out.afterDrag = (await geo()).st;
  const f2 = await shotFull('02_scrollbar_dragged');
  crop(f2, `${D}/02_scrollbar_zoom_dragged.png`, [Math.round((g.x + g.w - 18) * dpr), Math.round(g.y * dpr), Math.round((g.x + g.w + 2) * dpr), Math.round((g.y + g.h) * dpr)], 4 / dpr);
  // ホイール
  await p.mouse.move(g.x + 150, g.y + 200); await p.mouse.wheel(0, 300); await p.waitForTimeout(300);
  out.afterWheel = (await geo()).st;
  // 溝（つまみの外）をクリック → ページ送り
  await p.evaluate(() => { document.getElementById('pop').scrollTop = 0; });
  await p.mouse.click(tx, g.y + g.h - 30); await p.waitForTimeout(400);
  out.afterTrackClick = (await geo()).st;
  await L.closeAll(p); await L.closeCards(p);
  // 2) つまみ（点の大きさ）: マウスで動かす・キーボード
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  await L.openCard(p, 'display');
  const rr = await p.evaluate(() => { const r = document.getElementById('pointSize').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const val = () => p.evaluate(() => ({ v: document.getElementById('pointSize').value, p: document.getElementById('pointSize').style.getPropertyValue('--p'), shown: document.getElementById('pointSizeVal').textContent }));
  out.slider0 = await val();
  const f3 = await shotFull('03_slider');
  crop(f3, `${D}/03_slider_zoom.png`, [Math.round((rr.x - 6) * dpr), Math.round((rr.y - 6) * dpr), Math.round((rr.x + rr.w + 6) * dpr), Math.round((rr.y + rr.h + 6) * dpr)], 6 / dpr);
  // つまみの中心（値 2、範囲 1〜12）
  const thumbX = rr.x + 8 + (rr.w - 16) * (2 - 1) / 11;
  await p.mouse.move(thumbX, rr.y + rr.h / 2); await p.mouse.down(); await p.mouse.move(thumbX + 60, rr.y + rr.h / 2, { steps: 8 }); await p.mouse.up();
  out.sliderAfterDrag = await val();
  const f4 = await shotFull('04_slider_dragged');
  crop(f4, `${D}/04_slider_zoom_dragged.png`, [Math.round((rr.x - 6) * dpr), Math.round((rr.y - 6) * dpr), Math.round((rr.x + rr.w + 6) * dpr), Math.round((rr.y + rr.h + 6) * dpr)], 6 / dpr);
  await p.focus('#pointSize'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  out.sliderAfterKeys = await val();
  await p.keyboard.press('End'); out.sliderEnd = await val();
  await p.keyboard.press('Home'); out.sliderHome = await val();
  const f5 = await shotFull('05_slider_focus');
  crop(f5, `${D}/05_slider_zoom_focus.png`, [Math.round((rr.x - 6) * dpr), Math.round((rr.y - 8) * dpr), Math.round((rr.x + rr.w + 6) * dpr), Math.round((rr.y + rr.h + 8) * dpr)], 6 / dpr);
  // 3) 2 つつまみ（色の範囲）
  await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#tabColorDetail');
  const dr = await p.evaluate(() => { const r = document.querySelector('#colorRange .dtrack').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const dv = () => p.evaluate(() => { const [lo, hi] = document.querySelectorAll('#colorRange input'); return { lo: +lo.value, hi: +hi.value, shown: document.querySelector('#colorRange .dval').textContent }; });
  const pos = v => dr.x + 8 + (dr.w - 16) * v / 1000;
  const cy = dr.y + dr.h / 2;
  out.dual0 = await dv();
  const f6 = await shotFull('06_dual');
  crop(f6, `${D}/06_dual_zoom.png`, [Math.round((dr.x - 6) * dpr), Math.round((dr.y - 24) * dpr), Math.round((dr.x + dr.w + 6) * dpr), Math.round((dr.y + dr.h + 6) * dpr)], 4 / dpr);
  // 下限を真ん中へ、上限を真ん中へ（重ねる）
  let d0 = await dv();
  await p.mouse.move(pos(d0.lo), cy); await p.mouse.down(); await p.mouse.move(pos(500), cy, { steps: 10 }); await p.mouse.up();
  d0 = await dv();
  await p.mouse.move(pos(d0.hi), cy); await p.mouse.down(); await p.mouse.move(pos(400), cy, { steps: 10 }); await p.mouse.up();
  out.dualMet = await dv();
  // 重なったところから左へドラッグ（下限を下げたい）
  const m = await dv();
  await p.mouse.move(pos(m.lo), cy); await p.mouse.down(); await p.mouse.move(pos(m.lo) - 80, cy, { steps: 10 }); await p.mouse.up();
  out.dualDragLeftFromMet = await dv();
  // 右へドラッグ
  const m2 = await dv();
  await p.mouse.move(pos(m2.hi), cy); await p.mouse.down(); await p.mouse.move(pos(m2.hi) + 80, cy, { steps: 10 }); await p.mouse.up();
  out.dualDragRightFromMet = await dv();
  const f7 = await shotFull('07_dual_after');
  crop(f7, `${D}/07_dual_zoom_after.png`, [Math.round((dr.x - 6) * dpr), Math.round((dr.y - 24) * dpr), Math.round((dr.x + dr.w + 6) * dpr), Math.round((dr.y + dr.h + 6) * dpr)], 4 / dpr);
  // キーボード（下限にフォーカスして右へ）
  await p.focus('#colorRange input'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
  out.dualKeys = await dv();
  out.errors = errors;
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  L.fs.writeFileSync(`${L.W}/out/scroll_slider_d${dpr}.json`, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
