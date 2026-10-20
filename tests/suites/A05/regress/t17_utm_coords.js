// t17 大きな座標（UTM・グローバルシフトあり）の点群で、座標の吹き出し・情報の欄・断面の位置に出る値が、何の座標か筋が通っているか
//   （水平補正で回したあとに、元のファイルのシフトを足して出していないか）
//   heavy node t17_utm_coords.js
const L = require('./lib.js');
const D = L.DATA;

(async () => {
  const R = L.recorder('t17_utm_coords');
  const { p, errors, close } = await L.page();
  for (const auto of [true, false]) {
    await L.closeAll(p);
    await L.card(p, 'settings'); await p.click('#setTabCtrl'); // 2026-10-20〜 自動補正は設定の「操作」
    const cur = await p.$eval('#autoLevel', e => e.checked);
    if (cur !== auto) await p.click('label:has(#autoLevel)');
    await L.card(p, 'settings');
    await L.open(p, [`${D}/utm_map.pcd`]);
    await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(700);
    await p.keyboard.press('c').catch(() => {}); // 天井の扱いは関係ないので表示
    await p.click('[data-tool="info"]');
    // 点を選ぶ。真ん中は中心の丸（0.4.2 から座標のモードでもつかめる）があるので、丸の外で点のある所を探す
    const box = await p.evaluate(async () => { const c = window.__pcd.renderer.domElement, r = c.getBoundingClientRect();
      for (const d of [60, 90, 120, 160]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) { const x = r.left + r.width / 2 + dx * d, y = r.top + r.height / 2 + dy * d; if (document.elementFromPoint(x, y) === c && await window.__pcd.pickAt(x, y, true)) return { x, y }; }
      return { x: r.left + r.width / 2 + 60, y: r.top + r.height / 2 }; });
    await p.mouse.click(box.x, box.y); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      const S = window.__pcd.S, v = S.pick; if (!v) return null;
      const o = S.offset; const orig = [v.x + o[0], v.y + o[1], v.z + o[2]];
      const nums = [...document.querySelectorAll('.pcall.pin.sel .pc-xyz span')].map(s => parseFloat(s.textContent)); // 0.4.1 から「1.234 m」（単位つき）
      return { offset: o, original: orig.map(x => +x.toFixed(3)), shown: nums, leveled: !!S.levelInfo, label: document.getElementById('pinUnit').textContent, info: document.getElementById('info').textContent.match(/範囲 x[^範]*/)?.[0] };
    });
    if (!r) { R.ok(`U${auto ? 1 : 2} 前提: 点を選べた`, false); continue; }
    if (auto) {
      // 0.4.1 から: 水平補正したあとは「補正後の座標」（回したあとの座標にシフトを足したもの）を出す。UTM の大きさで、近くの値になる
      const near = r.shown.length === 3 && r.shown.every((v, k) => Math.abs(v - r.original[k]) < 5);
      R.ok('U1 水平補正あり: 座標の吹き出しは「補正後の座標」で、シフトを足した UTM の大きさの値', near && /補正後の座標/.test(r.label), r);
    } else {
      const same = r.shown.every((v, k) => Math.abs(v - r.original[k]) < 0.01);
      R.ok('U2 水平補正なし: 座標の吹き出しの値が、ファイルの元の座標（UTM）と同じ', same, r);
    }
    await p.click('[data-tool="info"]');
  }
  await L.card(p, 'settings'); await p.click('#setTabCtrl'); if (!(await p.$eval('#autoLevel', e => e.checked))) await p.click('label:has(#autoLevel)'); // 2026-10-20〜 自動補正は設定の「操作」
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
