// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
// C5 複数ファイルの重ね合わせとグローバルシフト
//   (a) ローカル座標の地図 → UTM 風の地図 の順に開く: 2 つ目の座標の細かさ（float32 の量子化）を調べる
//   (b) UTM 風の地図 → ローカル座標の地図 の順
//   (c) UTM 風の地図 + UTM 風の軌跡（TUM）: 軌跡が地図に重なるか
//   (d) 1 点目が (0,0,0) の UTM ファイル 1 つだけ
'use strict';
const L = require('./lib.js');
const D = L.F + '/shift';
// 開いたファイルの点（オフセットを足した値）の「細かさ」: 値を並べたときの隣との差の最小（0 を除く）と、異なる値の数
async function grain(p, idx) {
  return p.evaluate(i => {
    const S = window.__pcd.S, f = S.files[i], o = S.offset || [0, 0, 0], P = f.sample;
    const m = Math.min(f.n, 200000), out = [];
    for (let k = 0; k < 3; k++) {
      const a = new Float64Array(m); for (let j = 0; j < m; j++) a[j] = P[3 * j + k];
      a.sort(); let mind = Infinity, uniq = 1; for (let j = 1; j < m; j++) { const d = a[j] - a[j - 1]; if (d > 0) { uniq++; if (d < mind) mind = d; } }
      out.push({ step: +mind.toPrecision(3), uniq, sample: +(a[m >> 1] + o[k]).toFixed(4) });
    }
    return { name: f.name, offset: o, axes: out };
  }, idx);
}
const close = p => p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); let y; while ((y = document.querySelector('#trajList [data-act=tremove]'))) y.click(); });
(async () => {
  const { app, p, errors } = await L.launch('c5');
  const R = {};
  // (a)
  await L.open(p, [D + '/map_local.las']); await L.open(p, [D + '/map_utm.las']);
  R.a = { st: await L.state(p), local: await grain(p, 0), utm: await grain(p, 1) };
  await L.shot(p, 'c5_a_local_then_utm');
  await p.evaluate(() => window.__pcd.setView('top', false)); await L.render(p);
  await L.shot(p, 'c5_a_top');
  await close(p); await L.sleep(500);
  // (a') 比べる: UTM だけ
  await L.open(p, [D + '/map_utm.las']);
  R.utmAlone = await grain(p, 0);
  await close(p); await L.sleep(500);
  // (b)
  await L.open(p, [D + '/map_utm.las']); await L.open(p, [D + '/map_local.las']);
  R.b = { offset: (await L.state(p)).offset, utm: await grain(p, 0), local: await grain(p, 1) };
  await close(p); await L.sleep(500);
  // (c) UTM の地図 + UTM の軌跡
  await L.open(p, [D + '/map_utm.las']);
  R.c = { open: await L.open(p, [D + '/traj_utm.tum'], { input: '#trajInput' }) };
  R.c.trajFirst = await p.evaluate(() => { const t = window.__pcd.S.trajs[0]; return t && Array.from(t.P.slice(0, 3)); });
  R.c.mapCenterLocal = await p.evaluate(() => { const b = window.__pcd.S.files[0].bbox; return [0, 1, 2].map(k => (b.min[k] + b.max[k]) / 2); });
  await p.evaluate(() => window.__pcd.setView('fit', false)); await L.render(p);
  await L.shot(p, 'c5_c_utm_traj');
  // 軌跡に沿って動かすスライダーを中ほどへ
  await p.click('[data-open="view"]');
  await p.evaluate(() => { const s = document.getElementById('trajPos'); s.value = 500; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await L.sleep(500);
  R.c.centerAfterSlider = await p.evaluate(() => window.__pcd.controlsTarget());
  await L.shot(p, 'c5_c_slider');
  await close(p); await L.sleep(500);
  // (d) 1 点目が原点の UTM ファイル
  await L.open(p, [D + '/map_utm_zero_first.las']);
  R.d = { offset: (await L.state(p)).offset, grain: await grain(p, 0), msg: (await L.state(p)).msg };
  await L.shot(p, 'c5_d_zero_first');
  R.errors = errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e));
  L.log(R);
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
