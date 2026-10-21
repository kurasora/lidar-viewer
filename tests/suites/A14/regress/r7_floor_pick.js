// R7-004 の確かめ: 斜めから見た床の、truth の点の画面位置をクリックして、選ばれた点がどれだけずれるか（補正後の座標で）
'use strict';
const L = require('./lib.js');
const fs = require('fs');
(async () => {
  const { app, p } = await L.launch('r7');
  const dir = L.F + '/floor_h0.3';
  const truth = JSON.parse(fs.readFileSync(dir + '/truth.json', 'utf8'));
  await L.open(p, [dir + '/scans.pcd']);
  await p.click('[data-tool="info"]');
  const out = [];
  for (const view of ['iso', 'top', 'front']) {
    await p.evaluate(v => window.__pcd.setView(v, false), view); await L.render(p);
    for (const key of ['floor_point_M', 'wall_s_M', 'wall_n_M']) {
      const s = await L.screenOf(p, truth[key]);
      if (!(s.x > 0 && s.y > 0)) continue;
      const w = await p.evaluate(async ([x, y]) => { const h = await window.__pcd.pickAt(x, y, true); return h && h.world.toArray(); }, [s.x, s.y]);
      out.push({ view, key, dist: w ? Math.hypot(w[0] - s.world[0], w[1] - s.world[1], w[2] - s.world[2]) : null });
    }
  }
  console.log(JSON.stringify(out));
  await app.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
