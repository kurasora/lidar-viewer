// 「座標」で出る値は、ファイルの座標か？（既定の自動水平補正・廊下の向きそろえ・床を 0 のまま）
//   ローカル座標の地図（floor_h0.3）と UTM 風の地図（map_utm.las）で、クリックした点の
//   表示された X Y Z と、その点のファイル上の座標（local + offset）を比べる
'use strict';
const L = require('./lib.js');
(async () => {
  const { app, p, errors } = await L.launch('c5b');
  const R = {};
  const close = () => p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
  async function pickCompare(tag) {
    await p.evaluate(() => window.__pcd.setView('side', false)); await L.render(p);
    if (!(await p.evaluate(() => window.__pcd.S.tools.info))) await p.click('[data-tool="info"]');
    const box = await p.evaluate(() => { const r = window.__pcd.renderer.domElement.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    const out = [];
    for (const [gx, gy] of [[0.3, 0.5], [0.5, 0.5], [0.7, 0.5], [0.6, 0.45]]) {
      await L.click(p, { x: box.l + box.w * gx, y: box.t + box.h * gy }); await L.sleep(900);
      const r = await p.evaluate(() => {
        const S = window.__pcd.S, o = S.offset || [0, 0, 0];
        if (!document.querySelector('.pcall.pin.sel') || !S.pick) return null;
        const shown = ((document.querySelector('.pcall.pin.sel .pc-box') || document.createElement('div')).innerText.match(/-?\d+\.\d+/g) || []).slice(0, 3).map(Number);
        const file = S.pick.toArray().map((v, k) => +(v + o[k]).toFixed(3)); // その点のファイル上の座標（local + offset）
        return { shown, file, diff: shown.map((v, k) => +(v - file[k]).toFixed(3)) };
      });
      if (r) out.push(r);
    }
    R[tag] = { level: (await L.state(p)).level, offset: (await L.state(p)).offset, picks: out };
  }
  await L.open(p, [L.F + '/floor_h0.3/scans.pcd']);
  await pickCompare('local_default');
  await L.shot(p, 'c5b_local');
  await close();
  await L.open(p, [L.F + '/shift/map_utm.las']);
  await pickCompare('utm_default');
  await L.shot(p, 'c5b_utm');
  // 情報のカードの「範囲」
  R.utm_info = await p.evaluate(() => document.getElementById('info').innerText.replace(/\n/g, ' | '));
  R.errors = errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e));
  L.log(R);
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
