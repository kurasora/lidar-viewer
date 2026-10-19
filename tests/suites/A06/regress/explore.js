// 下見: 1 つの大きさで、空の画面・ファイルを開いた画面・各カードの写真を撮る
//   node explore.js <幅> <高さ> <DPR> <dark|light> <出力の小フォルダ>
const L = require('./lib.js');
(async () => {
  const [w, h, dpr, scheme, sub] = [+process.argv[2] || 1280, +process.argv[3] || 800, +process.argv[4] || 1, process.argv[5] || 'dark', process.argv[6] || 'explore'];
  const { p, errors, close } = await L.chromium({ w, h, dpr, scheme });
  const pre = `${sub}/${w}x${h}_d${dpr}_${scheme}`;
  await L.shot(p, pre + '_00_empty');
  await L.openCard(p, 'open'); await L.shot(p, pre + '_01_open_empty');
  await L.closeCards(p);
  const r = await L.openFiles(p, [L.FILES + '/corr_int_label.pcd', '/home/claude/pcd-viewer/sample/trajectory.txt']);
  await p.waitForTimeout(500);
  await L.shot(p, pre + '_02_loaded');
  for (const c of ['open', 'view', 'color', 'display', 'section', 'level']) {
    await L.closeCards(p); await L.openCard(p, c); await L.shot(p, pre + '_03_card_' + c);
  }
  await L.closeCards(p);
  await p.click('[data-open="color"]'); await p.click('#tabColorDetail'); await p.waitForTimeout(200); await L.shot(p, pre + '_04_color_detail');
  await L.closeCards(p);
  for (const c of ['open', 'view', 'color', 'display', 'section', 'level']) await p.click(`[data-open="${c}"]`);
  await p.click('[data-tool="measure"]'); await p.waitForTimeout(500);
  await L.shot(p, pre + '_05_stack8');
  console.log(JSON.stringify({ r, errors }));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
