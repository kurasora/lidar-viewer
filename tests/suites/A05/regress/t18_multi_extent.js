// t18 範囲の違う点群を順に開く（隣り合う 3 つの区画）: 2 つ目以降の点が「切り出し」で黙って隠れないか
//   ・1 つ目を開いたあと 2 つ目・3 つ目を開く（別々に／一度に）
//   ・表示を切って入れ直す
//   heavy node t18_multi_extent.js
const L = require('./lib.js');
const fs = require('fs');

function tile(path, x0, n = 60000, z0 = 0) {
  // 20 m × 10 m の床と、高さ 3 m の壁 2 枚（水平補正が効くように）
  const buf = Buffer.alloc(n * 16); let s = 7;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) {
    const k = r(); let x = x0 + r() * 20, y = r() * 10, z = z0;
    if (k < 0.25) { y = 0; z = z0 + r() * 3; } else if (k < 0.5) { y = 10; z = z0 + r() * 3; }
    buf.writeFloatLE(x, 16 * i); buf.writeFloatLE(y, 16 * i + 4); buf.writeFloatLE(z, 16 * i + 8); buf.writeFloatLE(50, 16 * i + 12);
  }
  fs.writeFileSync(path, Buffer.concat([Buffer.from(`# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH ${n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS ${n}\nDATA binary\n`), buf]));
}
// 各ファイルのうち、今のシェーダーの切り抜き（uClipMin/Max）と天井の面の内側にある点の割合
async function shown(p) {
  return p.evaluate(() => {
    const S = window.__pcd.S, e = window.__pcd.world.matrixWorld.elements;
    return S.files.map(f => {
      const u = f.mat.uniforms, mn = u.uClipMin.value, mx = u.uClipMax.value, cn = u.uCeilN.value, cd = u.uCeilD.value;
      let ok = 0; const P = f.positions, m = Math.min(f.n, 20000);
      for (let i = 0; i < m; i++) {
        const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (wx >= mn.x && wx <= mx.x && wy >= mn.y && wy <= mx.y && wz >= mn.z && wz <= mx.z && cn.x * wx + cn.y * wy + cn.z * wz <= cd) ok++;
      }
      return { name: f.name, shown: +(ok / m).toFixed(3) };
    }).concat([{ clipX: [...document.querySelectorAll('#clipX input')].map(i => +i.value), clipText: document.querySelector('#clipX .dval').textContent }]);
  });
}

(async () => {
  const R = L.recorder('t18_multi_extent');
  const T = L.W + '/tmp';
  tile(`${T}/tile_a.pcd`, 0); tile(`${T}/tile_b.pcd`, 20); tile(`${T}/tile_c.pcd`, 40);
  const { p, errors, close } = await L.page();
  await L.open(p, [`${T}/tile_a.pcd`]);
  await L.open(p, [`${T}/tile_b.pcd`]);
  let s = await shown(p);
  R.ok('M1 1 つ目を開いたあとに、隣の区画（2 つ目）を開くと、2 つ目の点がすべて表示される', s[1].shown > 0.99, s);
  await L.open(p, [`${T}/tile_c.pcd`]);
  s = await shown(p);
  R.ok('M2 3 つ目も開くと、3 つ目の点がすべて表示される', s[2].shown > 0.99, s);
  await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(800);
  await L.shot(p, 't18_M2_three_tiles_top');
  await L.closeAll(p);
  // 一度に 3 つ選んだとき
  await L.open(p, [`${T}/tile_a.pcd`, `${T}/tile_b.pcd`, `${T}/tile_c.pcd`]);
  s = await shown(p);
  R.ok('M3 3 つを一度に選んでも、すべての点が表示される', s.slice(0, 3).every(x => x.shown > 0.99), s);
  await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(800);
  await L.shot(p, 't18_M3_three_tiles_at_once');
  // 全体表示が 3 つ全部を映すか
  await L.card(p, 'view'); await p.click('[data-view="fit"]'); await p.waitForTimeout(900);
  const t = await p.evaluate(() => window.__pcd.controlsTarget().map(v => +v.toFixed(1)));
  R.ok('M4 「全体」で 3 区画の真ん中（x≈30）を中心に映す', Math.abs(t[0] - 30) < 6, t);
  // 表示を切って入れ直す
  await L.closeAll(p);
  await L.open(p, [`${T}/tile_a.pcd`, `${T}/tile_b.pcd`]);
  await L.card(p, 'open');
  await p.click('#fileList li:nth-child(2) [data-act=vis]'); await p.waitForTimeout(300);
  await p.click('#fileList li:nth-child(2) [data-act=vis]'); await p.waitForTimeout(300);
  s = await shown(p);
  R.ok('M5 2 つ目の表示を切って入れ直すと、2 つ目の点がすべて表示される', s[1].shown > 0.99, s);
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
