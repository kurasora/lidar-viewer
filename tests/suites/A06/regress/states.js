// 画面の状態を順に作って、写真と崩れの検査をする（Chromium・Electron 共通）
const L = require('./lib.js');
const { check } = require('./layout_checks.js');

// 点 i の画面上の位置（ページの座標）
async function pointOnScreen(p, i = 0, fileIdx = 0) {
  return p.evaluate(([i, fi]) => {
    const P = window.__pcd;
    const f = P.S.files[fi]; const V = P.cam.position.constructor;
    const v = new V(f.positions[3 * i], f.positions[3 * i + 1], f.positions[3 * i + 2]).applyMatrix4(P.world.matrixWorld).project(P.cam);
    const r = P.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, z: v.z };
  }, [i, fileIdx]);
}
// 画面の中ほどにある点を探す（カードやドックに隠れない所）
async function findVisiblePoint(p, area = { x0: 0.4, x1: 0.75, y0: 0.25, y1: 0.7 }, start = 0) {
  const vp = await p.evaluate(() => [innerWidth, innerHeight]);
  for (let i = start; i < 5000; i += 7) {
    const s = await pointOnScreen(p, i);
    if (s.z > -1 && s.z < 1 && s.x > vp[0] * area.x0 && s.x < vp[0] * area.x1 && s.y > vp[1] * area.y0 && s.y < vp[1] * area.y1) {
      const top = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [s.x, s.y]);
      if (top === 'CANVAS') return { i, ...s };
    }
  }
  return null;
}

async function run(p, pre, opts = {}) {
  const out = [];
  const snap = async (name, extra) => {
    await p.waitForTimeout(opts.settle || 350);
    const f = await L.shot(p, `${pre}_${name}`);
    const issues = await check(p);
    out.push({ state: name, shot: f, issues, ...(extra || {}) });
  };
  await snap('00_empty');
  await L.openCard(p, 'open'); await snap('01_open_empty');
  await L.closeCards(p);
  await L.openFiles(p, [L.FILES + '/corr_int_label.pcd']);
  await p.setInputFiles('#trajInput', '/home/claude/pcd-viewer/sample/trajectory.txt'); await L.waitIdle(p);
  await snap('02_loaded');
  for (const c of ['open', 'view', 'color', 'display', 'section', 'level']) { await L.closeCards(p); await L.openCard(p, c); await snap('03_' + c); }
  // 開くカードで情報の欄も開く
  await L.closeCards(p); await L.openCard(p, 'open');
  await p.evaluate(() => { document.getElementById('infoBox').open = true; });
  await snap('03_open_info');
  await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#tabColorDetail'); await snap('04_color_detail');
  await p.click('#tabColorBasic');
  await L.closeCards(p); await L.openCard(p, 'section'); await p.click('#tabClip'); await snap('04_clip');
  await p.click('#tabSec');
  // 8 枚重ね
  await L.closeCards(p);
  for (const c of ['open', 'view', 'color', 'display', 'section', 'level']) await p.click(`[data-open="${c}"]`);
  await p.click('[data-tool="measure"]');
  await snap('05_stack8');
  // 距離を 2 本
  const a = await findVisiblePoint(p, undefined, 0), b = a && await findVisiblePoint(p, undefined, a.i + 300);
  if (a && b) {
    await p.mouse.click(a.x, a.y); await p.waitForTimeout(400); await p.mouse.move(b.x, b.y); await p.waitForTimeout(500);
    await snap('06_measure_pending');
    await p.mouse.click(b.x, b.y); await p.waitForTimeout(400);
    const c = await findVisiblePoint(p, undefined, b.i + 300), d = c && await findVisiblePoint(p, undefined, c.i + 300);
    if (c && d) { await p.mouse.click(c.x, c.y); await p.waitForTimeout(300); await p.mouse.click(d.x, d.y); await p.waitForTimeout(300); }
    await snap('06_measure_done');
  }
  await L.closeCards(p);
  // 座標（画面の右端・上端の近くの点も）
  await p.click('[data-tool="info"]');
  const q = await findVisiblePoint(p);
  if (q) { await p.mouse.click(q.x, q.y); await p.waitForTimeout(600); await snap('07_pick'); }
  const qr = await findVisiblePoint(p, { x0: 0.82, x1: 0.99, y0: 0.05, y1: 0.95 });
  if (qr) { await p.mouse.click(qr.x, qr.y); await p.waitForTimeout(600); await snap('07_pick_right'); }
  const qt = await findVisiblePoint(p, { x0: 0.3, x1: 0.9, y0: 0.0, y1: 0.15 });
  if (qt) { await p.mouse.click(qt.x, qt.y); await p.waitForTimeout(600); await snap('07_pick_top'); }
  await p.click('[data-tool="info"]');
  return out;
}
module.exports = { run, pointOnScreen, findVisiblePoint };
