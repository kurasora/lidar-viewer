// 2 つつまみのスライダー: 2 つの丸が重なったとき、マウスで右へ（上限を上げる方へ）動かせるか（Chromium）
const L = require('./lib.js');
(async () => {
  const { p, close } = await L.chromium({ w: 1280, h: 800 });
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  const out = {};
  for (const [card, sel] of [['color', '#colorRange'], ['section', '#clipZ']]) {
    await L.closeCards(p); await L.openCard(p, card);
    if (card === 'color') await p.click('#tabColorDetail'); else await p.click('#tabClip');
    const dr = await p.evaluate(s => { const r = document.querySelector(s + ' .dtrack').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
    const dv = () => p.evaluate(s => { const [lo, hi] = document.querySelectorAll(s + ' input'); return { lo: +lo.value, hi: +hi.value, loZ: lo.style.zIndex, shown: document.querySelector(s + ' .dval').textContent }; }, sel);
    const pos = v => dr.x + 8 + (dr.w - 16) * v / 1000, cy = dr.y + dr.h / 2;
    const drag = async (from, to) => { await p.mouse.move(pos(from), cy); await p.mouse.down(); await p.mouse.move(pos(to), cy, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(150); return dv(); };
    const r = {};
    const reset = () => p.evaluate(s => { const [lo, hi] = document.querySelectorAll(s + ' input'); lo.value = 0; hi.value = 1000; lo.dispatchEvent(new Event('input')); hi.dispatchEvent(new Event('input')); }, sel);
    // a) 真ん中で重ねる → 右へ・左へ
    await reset(); let v = await dv();
    v = await drag(v.lo, 500); v = await drag(v.hi, 500);
    r.met500 = v;
    r.dragRightFromMet = await drag(500, 800);
    v = await dv(); r.dragLeftFromMet = await drag(v.lo, 200);
    // b) 両方を左端へ → 右へ
    await reset(); v = await dv();
    v = await drag(v.hi, 0);
    r.bothLeft = v;
    r.dragRightFromLeftEnd = await drag(0, 400);
    // c) 両方を右端へ → 左へ
    await reset(); v = await dv();
    v = await drag(v.lo, 1000);
    r.bothRight = v;
    r.dragLeftFromRightEnd = await drag(1000, 600);
    await reset();
    await L.shot(p, `misc/dual_${card}`);
    out[card] = r;
  }
  L.fs.writeFileSync(L.W + '/out/dual_stuck.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
