// t05 計測と座標: 2 点・Shift で水平・複数・選ぶ・消す・すべて消す・途中でやめる・測っている途中の表示、
//     座標の印（吹き出しと 3D の丸）がカメラを動かしても・ほかの点に隠れても見えるか、天井を隠したときに選ぶ点
//   heavy node t05_measure.js
const L = require('./lib.js');
const D = L.DATA;
const ACC = [126, 166, 255]; // --accent #7ea6ff

async function table(p) {
  return p.evaluate(() => ({
    rows: [...document.querySelectorAll('#measureTable tbody tr')].map(tr => [...tr.querySelectorAll('td')].slice(0, 4).map(td => td.textContent.trim())),
    sel: [...document.querySelectorAll('#measureTable tbody tr')].findIndex(tr => tr.classList.contains('sel')),
    // 0.4.1 から: 測った線の番号は吹き出し（.mcall、中に「#番号」）
    tags: window.__pcd.S.measures.map(m => ({ t: (/#(\d+)/.exec(m.tag.textContent) || [])[1], sel: m.tag.classList.contains('sel'), shown: m.tag.isConnected && m.tag.style.display !== 'none' })),
    hint: !document.getElementById('measureHint').hidden, count: document.getElementById('measureCount').textContent,
    n: window.__pcd.S.measures.length, pending: !!window.__pcd.S.mPending,
    marker: window.__pcd.world.children.find(c => c.isPoints && c.renderOrder === 10)?.visible,
    mLiveGone: !document.getElementById('mLive'),
  }));
}
const near = (a, b, t) => Math.abs(a - b) <= t;

(async () => {
  const R = L.recorder('t05_measure');
  const { p, errors, close } = await L.page();
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  // 0.4.1 から: 補正しても原点は変えない（床は z = 0 ではない）。床の高さ = 表示範囲の下端
  const FZ = await p.evaluate(() => window.__pcd.S.bounds.min[2]);
  // ---- 天井を隠した状態で床を選ぶ（A05-001） ----
  await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(600);
  await p.click('[data-tool="info"]');
  for (const [x, y] of [[5, 0.2], [15, -0.3], [25, 0.5]]) {
    const sc = await L.screenOf(p, [x, y, FZ]);
    await p.mouse.click(sc.x, sc.y); await p.waitForTimeout(900);
    const z = await p.evaluate(() => { const S = window.__pcd.S, e = window.__pcd.world.matrixWorld.elements, v = S.pick; return v ? +(e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]).toFixed(3) : null; });
    R.ok(`H1 天井を隠した状態・上から床 (${x}, ${y}) を選ぶ → 床の点（z≈床）が選ばれる`, z !== null && Math.abs(z - FZ) < 0.15, `選ばれた点の z = ${z}（床 ${FZ.toFixed(3)}）`);
  }
  await p.click('[data-tool="info"]');
  // 以下は天井を表示した状態で
  await p.click('[data-open="view"]'); await p.click('#btnCeil'); await p.click('[data-open="view"]');
  await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(600);
  // ---- 2 点の距離 ----
  await p.click('[data-tool="measure"]');
  const pa = await L.screenOf(p, [8, 0, FZ + 2.6]), pb = await L.screenOf(p, [12, 0, FZ + 2.6]), pc = await L.screenOf(p, [12, 0.6, FZ + 2.6]), pd = await L.screenOf(p, [20, -0.5, FZ + 2.6]);
  await p.mouse.click(pa.x, pa.y); await p.waitForTimeout(800);
  let t = await table(p);
  R.ok('M1 1 点目: 途中の印（3D の丸）が出て、案内が「もう 1 点をクリック」', t.pending && t.marker && (await p.textContent('#mGuide')).includes('もう 1 点'), t);
  await p.mouse.move(pb.x, pb.y); await p.waitForTimeout(900);
  t = await table(p);
  R.ok('M2 測っている途中の長さの表示（mLive）はない（2026-10-20 に削除。使われていなかった）', t.mLiveGone, t);
  await p.mouse.click(pb.x, pb.y); await p.waitForTimeout(800);
  t = await table(p);
  R.ok('M3 2 点目で 1 本できる（表 1 行・番号 1・印は消える・案内は最初に戻る）', t.n === 1 && t.rows.length === 1 && t.tags.length === 1 && t.tags[0].t === '1' && !t.pending && !t.marker && t.count === '1 本' && !t.hint, t);
  R.ok('M3b 長さ ≈ 4 m（8 m と 12 m の位置をクリック）', near(+t.rows[0][1], 4, 0.3), t.rows[0]);
  // Shift で水平
  await p.mouse.click(pa.x, pa.y); await p.waitForTimeout(800);
  await p.keyboard.down('Shift'); await p.mouse.click(pc.x, pc.y); await p.keyboard.up('Shift'); await p.waitForTimeout(800);
  t = await table(p);
  R.ok('M4 Shift を押して 2 点目 → 水平な距離（高さの差 +0.000、長さ = 水平）', t.n === 2 && (t.rows[1][3] === '+0.000' || t.rows[1][3] === '0.000') && t.rows[1][1] === t.rows[1][2], t.rows[1]);
  await p.mouse.click(pb.x, pb.y); await p.waitForTimeout(800); await p.mouse.click(pd.x, pd.y); await p.waitForTimeout(800);
  t = await table(p);
  R.ok('M5 3 本目: 番号 1・2・3、新しいものが選ばれる', t.n === 3 && t.tags.map(x => x.t).join() === '1,2,3' && t.sel === 2 && t.tags[2].sel, t.tags);
  // 表の 2 行目を選ぶ
  await L.card(p, 'measure');
  await p.click('#measureTable tbody tr:nth-child(2) td:nth-child(2)'); await p.waitForTimeout(200);
  t = await table(p);
  R.ok('M6 表の 2 行目を押すと 2 本目が選ばれる（表と番号の両方）', t.sel === 1 && t.tags[1].sel && !t.tags[2].sel, t.tags);
  // 2 本目を × で消す
  const rowsBefore = t.rows;
  await p.click('#measureTable [data-del="1"]'); await p.waitForTimeout(200);
  t = await table(p);
  R.ok('M7 2 本目を × で消すと 2 本になり、番号が 1・2 に詰まる（残ったのは 1 本目と 3 本目）', t.n === 2 && t.tags.map(x => x.t).join() === '1,2' && t.rows[0][1] === rowsBefore[0][1] && t.rows[1][1] === rowsBefore[2][1], t.rows);
  // 番号の丸を押して選ぶ
  await p.evaluate(() => window.__pcd.S.measures[0].tag.querySelector('.mc-box').click()); await p.waitForTimeout(200);
  t = await table(p);
  R.ok('M8 画面の番号を押すと、その計測が選ばれる', t.sel === 0 && t.tags[0].sel, t.tags);
  // Delete で選んでいる計測を消す
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Delete'); await p.waitForTimeout(200);
  t = await table(p);
  R.ok('M9 Delete で選んでいる計測（1 本目）が消える', t.n === 1 && t.rows[0][1] === rowsBefore[2][1], t.rows);
  // 途中で Esc
  await p.mouse.click(pa.x, pa.y); await p.waitForTimeout(800);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  t = await table(p);
  R.ok('M10 1 点目のあと Esc → 途中だけ取り消し（距離は入ったまま・計測は残る）', !t.pending && !t.marker && t.n === 1 && (await p.evaluate(() => window.__pcd.S.tools.measure)), t);
  // 途中で距離を切る
  await p.mouse.click(pa.x, pa.y); await p.waitForTimeout(800);
  await p.click('[data-tool="measure"]'); await p.waitForTimeout(200);
  t = await table(p);
  R.ok('M11 1 点目のあと距離を切る → 途中の印が消える（測った線と番号は残る）', !t.pending && !t.marker && t.tags.length > 0 && t.tags.every(x => x.shown), t);
  await p.click('[data-tool="measure"]'); await p.waitForTimeout(200);
  // すべて消す
  await L.card(p, 'measure');
  await p.click('#btnMeasureClear'); await p.waitForTimeout(200);
  t = await table(p);
  R.ok('M12 すべて消す → 0 本・案内の文が戻る', t.n === 0 && t.rows.length === 0 && t.tags.length === 0 && t.hint && t.count === '', t);
  // ---- 3D の丸（1 点目の印）がほかの点に隠れても見えるか ----
  await p.mouse.click(pa.x, pa.y); await p.waitForTimeout(800); // 天井の上の点
  const mk = await p.evaluate(() => { const S = window.__pcd.S, e = window.__pcd.world.matrixWorld.elements, v = S.mPending; return [e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]]; });
  for (const view of ['front', 'side', 'iso']) {
    await p.evaluate(v => window.__pcd.setView(v, false), view); await p.waitForTimeout(600);
    const sc = await L.screenOf(p, mk);
    const px = await L.pixelAt(p, sc.x, sc.y);
    R.ok(`V1 1 点目の印（3D の丸）が ${view} の向きでも見える（画素が強調色）`, px.every((v, k) => Math.abs(v - ACC[k]) <= 12), { px, at: [Math.round(sc.x), Math.round(sc.y)] });
  }
  await p.keyboard.press('Escape');
  await p.click('[data-tool="measure"]');
  // ---- 座標の吹き出し: 床の点を選んで、壁の向こうになる向きから見る ----
  await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(600);
  await p.click('[data-open="view"]'); await p.click('#btnCeil'); await p.click('[data-open="view"]'); // 天井を隠す（床を選ぶため）
  await p.click('[data-tool="info"]');
  // 天井を隠した状態では A05-001 で天井が選ばれるので、天井を描かない高さの切り抜きで床を選ぶ
  await p.evaluate(() => { const i = document.querySelectorAll('#clipZ input'); i[1].value = 300; i[1].dispatchEvent(new Event('input')); });
  const pf = await L.screenOf(p, [15, 0.3, FZ]);
  await p.mouse.click(pf.x, pf.y); await p.waitForTimeout(900);
  await p.click('[data-open="section"]'); await p.click('#tabClip'); await p.click('#btnClipReset'); await p.click('#tabSec'); await p.click('[data-open="section"]');
  const pk = await p.evaluate(() => { const S = window.__pcd.S, e = window.__pcd.world.matrixWorld.elements, v = S.pick; return v && [e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]]; });
  R.ok('V2 前提: 床の点を選べた', pk && Math.abs(pk[2] - FZ) < 0.15, pk);
  const views = [['side', '横（壁の向こう）'], ['front', '正面'], ['iso', '斜め']];
  for (const [v, label] of views) {
    await p.evaluate(v => window.__pcd.setView(v, false), v); await p.waitForTimeout(700);
    const sc = await L.screenOf(p, pk);
    const pos = await p.evaluate(() => { const el = (() => { const q = window.__pcd.S.pins; return q.length ? q[q.length - 1].el : { hidden: true, style: {} }; })(); const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform); const r = document.getElementById('stage').getBoundingClientRect(); return { hidden: el.hidden, vis: el.style.visibility, x: m ? +m[1] + r.left : null, y: m ? +m[2] + r.top : null }; });
    const inView = sc.x >= 0 && sc.x <= 1280 && sc.y >= 0 && sc.y <= 800 && sc.z < 1;
    R.ok(`V3 座標の印が ${label} から見ても選んだ点の位置に見える`, !pos.hidden && pos.vis !== 'hidden' && (!inView || (Math.abs(pos.x - sc.x) < 2 && Math.abs(pos.y - sc.y) < 2)), { pos, sc: [Math.round(sc.x), Math.round(sc.y)] });
  }
  // マウスで回したあとも追いかける
  await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(760, 340, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(600);
  {
    const sc = await L.screenOf(p, pk);
    const pos = await p.evaluate(() => { const el = (() => { const q = window.__pcd.S.pins; return q.length ? q[q.length - 1].el : { hidden: true, style: {} }; })(); const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform); const r = document.getElementById('stage').getBoundingClientRect(); return { hidden: el.hidden, vis: el.style.visibility, x: m ? +m[1] + r.left : null, y: m ? +m[2] + r.top : null }; });
    R.ok('V4 マウスで回したあとも座標の印が点を追いかける', !pos.hidden && Math.abs(pos.x - sc.x) < 2 && Math.abs(pos.y - sc.y) < 2, { pos, sc: [sc.x, sc.y] });
  }
  await L.shot(p, 't05_V4_pick_after_orbit');
  // 窓の大きさを変えても追いかける
  await p.setViewportSize({ width: 1000, height: 700 }); await p.waitForTimeout(800);
  {
    const sc = await L.screenOf(p, pk);
    const pos = await p.evaluate(() => { const el = (() => { const q = window.__pcd.S.pins; return q.length ? q[q.length - 1].el : { hidden: true, style: {} }; })(); const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform); const r = document.getElementById('stage').getBoundingClientRect(); return { x: m ? +m[1] + r.left : null, y: m ? +m[2] + r.top : null }; });
    R.ok('V5 窓の大きさを変えたあとも座標の印が点の位置', Math.abs(pos.x - sc.x) < 2 && Math.abs(pos.y - sc.y) < 2, { pos, sc: [sc.x, sc.y] });
  }
  // 水平補正を元に戻しても印は同じ点に付いている
  const boxBefore = await p.evaluate(() => { const q = window.__pcd.S.pins; return q.length ? q[q.length - 1].el.querySelector('.pc-box').textContent : ''; });
  await p.click('[data-open="level"]'); await p.click('#btnLevelReset'); await p.waitForTimeout(900); await p.click('[data-open="level"]');
  {
    const r = await p.evaluate(() => { const S = window.__pcd.S, e = window.__pcd.world.matrixWorld.elements, v = S.pick, o = S.offset || [0, 0, 0]; return { now: [e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12] + o[0], e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13] + o[1], e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14] + o[2]].map(x => x.toFixed(3)), box: (() => { const q = window.__pcd.S.pins; return q.length ? q[q.length - 1].el.querySelector('.pc-box').textContent : ''; })(), hidden: (() => { const q = window.__pcd.S.pins; return q.length ? q[q.length - 1].el : { hidden: true, style: {} }; })().hidden }; });
    R.ok('V7 水平補正を元に戻したら、座標の吹き出しの数字も今の座標（元のファイルの座標）になる（または吹き出しを閉じる）', r.hidden || r.now.every(v => r.box.includes(v)), { before: boxBefore, after: r.box, now: r.now });
  }
  {
    const pk2 = await p.evaluate(() => { const S = window.__pcd.S, e = window.__pcd.world.matrixWorld.elements, v = S.pick; return [e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]]; });
    const sc = await L.screenOf(p, pk2);
    const pos = await p.evaluate(() => { const el = (() => { const q = window.__pcd.S.pins; return q.length ? q[q.length - 1].el : { hidden: true, style: {} }; })(); const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform); const r = document.getElementById('stage').getBoundingClientRect(); return { x: m ? +m[1] + r.left : null, y: m ? +m[2] + r.top : null, box: (() => { const q = window.__pcd.S.pins; return q.length ? q[q.length - 1].el.querySelector('.pc-box').textContent : ''; })() }; });
    R.ok('V6 水平補正を元に戻しても印は同じ点に付いている（吹き出しの数字は選んだときのまま）', Math.abs(pos.x - sc.x) < 2 && Math.abs(pos.y - sc.y) < 2, { pos, sc: [sc.x, sc.y] });
  }
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
