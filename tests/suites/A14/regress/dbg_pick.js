// 調査用: 横から見たときに点が選べない理由を調べる
'use strict';
const L = require('./lib.js');
const fs = require('fs');
const truth = JSON.parse(fs.readFileSync(L.F + '/fastlio/truth.json', 'utf8'));
(async () => {
  const { app, p, errors } = await L.launch('dbg');
  await L.open(p, [L.F + '/fastlio/scans.pcd']);
  for (const v of ['side', 'front', 'top']) {
    await p.evaluate(v => window.__pcd.setView(v, false), v); await L.render(p); await L.sleep(300);
    const s = await L.screenOf(p, truth.box_top_center_M);
    const grid = await p.evaluate(async ({ s }) => {
      const out = [];
      for (const [dx, dy] of [[0, 0], [0, -40], [0, 40], [-200, 0], [200, 0], [0, -100], [0, 100]]) {
        const h = await window.__pcd.pickAt(s.x + dx, s.y + dy, true);
        out.push([dx, dy, h ? h.world.toArray().map(v => +v.toFixed(3)) : null]);
      }
      const r = window.__pcd.renderer.domElement.getBoundingClientRect();
      const c = await window.__pcd.pickAt(r.left + r.width / 2, r.top + r.height / 2, true);
      return { out, center: c ? c.world.toArray().map(v => +v.toFixed(3)) : null, cam: window.__pcd.cam.position.toArray().map(v => +v.toFixed(2)) };
    }, { s });
    L.log(v, s, grid);
  }
  L.log(errors.filter(e => !/GPU stall|swiftshader|Security Warning/i.test(e)));
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
