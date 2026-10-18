// 距離の道具を切って線が見えないときに Delete / Backspace を押すと、測った線が黙って消えるか（Chromium）
const L = require('./lib.js');
const S = require('./states.js');
(async () => {
  const { p, close } = await L.chromium({ w: 1280, h: 800 });
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  await p.click('[data-tool="measure"]'); // 距離を入れる（距離のカードも出る）
  const pts = []; let st = 0;
  for (let i = 0; i < 4; i++) { const q = await S.findVisiblePoint(p, undefined, st); if (!q) break; pts.push(q); st = q.i + 250; }
  for (const q of pts) { await p.mouse.click(q.x, q.y); await p.waitForTimeout(250); }
  const n0 = await p.evaluate(() => window.__pcd.S.measures.length);
  await p.click('[data-tool="measure"]'); // 道具を切る（線は隠れる）
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const vis = await p.evaluate(() => window.__pcd.S.measures.map(m => m.line.visible));
  await p.keyboard.press('Backspace'); await p.waitForTimeout(200);
  const n1 = await p.evaluate(() => window.__pcd.S.measures.length);
  const msg = await p.evaluate(() => document.getElementById('statMsg').textContent);
  // ドックのボタンにフォーカスがあるときの Delete
  await p.focus('[data-open="view"]'); await p.keyboard.press('Delete'); await p.waitForTimeout(200);
  const n2 = await p.evaluate(() => window.__pcd.S.measures.length);
  const out = { measuredBefore: n0, linesVisibleWhenToolOff: vis, afterBackspace: n1, msgAfter: msg, afterDeleteOnDockButton: n2 };
  L.fs.writeFileSync(L.W + '/out/backspace.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
