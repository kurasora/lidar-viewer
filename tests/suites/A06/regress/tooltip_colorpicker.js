// 色の選択画面（input type=color を押すと出る Chromium の部品）の、スポイト・形式の切り替えなどに本物のマウスを乗せる
const L = require('./lib.js');
(async () => {
  const { app, p, close } = await L.electron({ w: 1280, h: 800, name: 'tooltip2' });
  const cb = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  await L.openCard(p, 'open');
  const col = await p.evaluate(() => { const r = document.querySelector('#fileList input[type=color]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  L.xmove(cb.x + 1200, cb.y + 400); await L.sleep(300);
  const base = L.xwindows();
  L.xclick(cb.x + col.x, cb.y + col.y); await L.sleep(1500);
  const pop = L.xwindows().filter(w => !base.some(b => b.id === w.id))[0];
  const res = { pop, hits: [] };
  if (pop) {
    const base2 = L.xwindows();
    const pts = { スポイト: [21, 162], 今の色の丸: [57, 162], 色相のつまみ: [153, 160], R: [50, 199], G: [109, 199], B: [168, 199], 形式の切り替え: [198, 233], 'R の文字': [52, 233], 色の面: [117, 60] };
    for (const [nm, [dx, dy]] of Object.entries(pts)) {
      L.xmove(cb.x + 1200, cb.y + 700); await L.sleep(300);
      L.xmove(pop.x + dx, pop.y + dy); await L.sleep(1500);
      const nw = L.xwindows().filter(w => !base2.some(b => b.id === w.id) && w.override);
      if (nw.length) L.xshot(`${L.SHOTS}/tooltip/FOUND_colorpicker_${nm}.png`);
      res.hits.push({ nm, tooltip: nw });
    }
    L.xmove(pop.x + 21, pop.y + 162); await L.sleep(1500); L.xshot(`${L.SHOTS}/tooltip/T12_colorpicker_eyedropper_hover.png`);
  }
  L.xkey('Escape'); await L.sleep(300);
  console.log(JSON.stringify(res, null, 1));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
