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
    await L.card(p, 'level');
    const cur = await p.$eval('#autoLevel', e => e.checked);
    if (cur !== auto) await p.click('#autoLevel');
    await L.open(p, [`${D}/utm_map.pcd`]);
    await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(700);
    await p.keyboard.press('c').catch(() => {}); // 天井の扱いは関係ないので表示
    await p.click('[data-tool="info"]');
    // 画面の真ん中の点を選ぶ
    const box = await p.evaluate(() => { const r = window.__pcd.renderer.domElement.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.click(box.x, box.y); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      const S = window.__pcd.S, v = S.pick; if (!v) return null;
      const o = S.offset; const orig = [v.x + o[0], v.y + o[1], v.z + o[2]];
      const nums = [...document.querySelectorAll('#pickBox .pc-xyz span')].map(s => +s.textContent);
      return { offset: o, original: orig.map(x => +x.toFixed(3)), shown: nums, leveled: !!S.levelInfo, info: document.getElementById('info').textContent.match(/範囲 x[^範]*/)?.[0] };
    });
    if (!r) { R.ok(`U${auto ? 1 : 2} 前提: 点を選べた`, false); continue; }
    const same = r.shown.every((v, k) => Math.abs(v - r.original[k]) < 0.01);
    R.ok(`U${auto ? 1 : 2} ${auto ? '水平補正あり' : '水平補正なし'}: 座標の吹き出しの値が、ファイルの元の座標（UTM）と同じ`, same, r);
    await p.click('[data-tool="info"]');
  }
  await L.card(p, 'level'); if (!(await p.$eval('#autoLevel', e => e.checked))) await p.click('#autoLevel');
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
