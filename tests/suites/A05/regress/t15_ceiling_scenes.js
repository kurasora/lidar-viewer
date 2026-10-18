// t15 「天井を隠す」（既定で入）が、天井でないもの（2 階・建物の屋根）を黙って隠さないか
//   heavy node t15_ceiling_scenes.js
const L = require('./lib.js');
const D = L.DATA;

(async () => {
  const R = L.recorder('t15_ceiling_scenes');
  const { p, errors, close } = await L.page();
  await p.evaluate(() => {
    window.__msgs = [];
    const el = document.getElementById('statMsg');
    new MutationObserver(() => { if (el.textContent) window.__msgs.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  for (const [f, what, upper] of [['two_floors.pcd', '2 階（床 2.9 m〜天井 5.5 m）', 2.9], ['outdoor.pcd', '建物の屋根（9 m）と木', 4.0], ['c_xyzi.pcd', '（対照）1 階だけの廊下', 9]]) {
    await L.closeAll(p);
    await p.evaluate(() => { window.__msgs = []; });
    await L.open(p, [`${D}/${f}`]);
    const r = await p.evaluate(up => {
      const S = window.__pcd.S; let hid = 0, upperN = 0, upperHid = 0, n = 0;
      for (const s of S.worldSample) for (let i = 0; i < s.length; i += 3) {
        n++; const z = s[i + 2]; const h = S.hideCeil && S.ceil && (S.ceil.n.x * s[i] + S.ceil.n.y * s[i + 1] + S.ceil.n.z * z > S.ceil.d);
        if (h) hid++; if (z >= up) { upperN++; if (h) upperHid++; }
      }
      return { ceilZ: S.ceilZ && +S.ceilZ.toFixed(2), hidden: +(hid / n).toFixed(3), upperHidden: upperN ? +(upperHid / upperN).toFixed(3) : null, msgs: window.__msgs };
    }, upper);
    await p.evaluate(() => window.__pcd.setView('iso', false)); await p.waitForTimeout(800);
    await L.shot(p, `t15_${f.replace('.pcd', '')}`);
    const told = r.msgs.some(m => /天井|隠/.test(m));
    if (f === 'c_xyzi.pcd') R.ok(`T0 ${f}: 天井だけが隠れる`, r.ceilZ > 2 && r.hidden > 0.1 && r.hidden < 0.4, r);
    else R.ok(`T1 ${f}: ${what} が、知らせなしに丸ごと隠れない`, !(r.upperHidden > 0.5 && !told), r);
  }
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
