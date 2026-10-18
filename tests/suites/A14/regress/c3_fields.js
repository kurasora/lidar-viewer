// C2/C3 LIO-SAM と livox の値の欄で色付けする（画面で）
//   livox_frame.pcd: timestamp（double ns）・tag（0/16/32/48）・line で色分け → 凡例と色
//   transformations.pcd: time（double 秒）で色分け
//   LAS の分類（2/6/9/18 など、離れた値）で色分け → 種類ごとの色がかぶらないか
'use strict';
const L = require('./lib.js');
(async () => {
  const { app, p, errors } = await L.launch('c3');
  const R = {};
  const colorBy = async (field) => {
    await p.evaluate(f => { const s = document.getElementById('colorMode'); s.value = 'field'; s.dispatchEvent(new Event('change')); }, field);
    await L.sleep(300);
    await p.evaluate(f => { const s = document.getElementById('fieldSel'); s.value = f; s.dispatchEvent(new Event('change')); }, field);
    await L.sleep(800);
    return p.evaluate(() => ({ field: window.__pcd.S.field, legend: document.getElementById('legend').innerText.replace(/\n/g, ' | ').slice(0, 300),
      legendColors: [...document.querySelectorAll('#legend .cats i')].map(i => i.style.background), rangeHidden: document.getElementById('rangeBox').hidden, fields: [...document.getElementById('fieldSel').options].map(o => o.value) }));
  };
  await p.click('[data-open="color"]'); await p.click('#tabColorDetail');
  await L.open(p, [L.F + '/livox/livox_frame.pcd']);
  R.livox_default = await p.evaluate(() => ({ fieldSel: document.getElementById('fieldSel').value }));
  R.livox_timestamp = await colorBy('timestamp');
  await L.shot(p, 'c3_livox_timestamp');
  R.livox_tag = await colorBy('tag');
  await L.shot(p, 'c3_livox_tag');
  R.livox_line = await colorBy('line');
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
  await L.open(p, [L.F + '/liosam/transformations.pcd']);
  R.liosam_time = await colorBy('time');
  await L.shot(p, 'c3_liosam_time');
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
  await L.open(p, [L.F + '/cls/classified.las']).catch(e => { R.clsErr = e.message; });
  R.las_class = await colorBy('classification');
  await L.shot(p, 'c3_las_class');
  R.errors = errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e)).slice(0, 10);
  L.log(R);
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
