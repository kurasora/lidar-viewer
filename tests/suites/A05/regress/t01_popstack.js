// t01 左上のカードの重なり（状態遷移）: モデルと突き合わせる無作為歩行 + 狙った手順 + 最小の窓
//   heavy node t01_popstack.js [歩数=220] [種=1]
const L = require('./lib.js');
const STEPS = +(process.argv[2] || 220), SEED = +(process.argv[3] || 1);
const DOCK = ['open', 'view', 'color', 'display', 'section', 'level'];
const TITLES = { open: 'ファイル', view: '視点', color: '色', display: '表示', section: '断面・切り出し', level: '水平補正', measure: '距離' };
let s = SEED >>> 0 || 1; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];

// 仕様のモデル（ソースのコメントとユーザーの要望から）
class Model {
  constructor() { this.st = []; this.info = false; this.measure = false; }
  bring(n) { this.st = this.st.filter(x => x !== n); this.st.push(n); }
  remove(n) { this.st = this.st.filter(x => x !== n); }
  dock(n) { if (this.st.includes(n)) this.remove(n); else this.bring(n); }
  close() { const t = this.st[this.st.length - 1]; if (t === 'measure') this.setMeasure(false); else if (t) this.remove(t); }
  setMeasure(on) { if (on && this.info) this.info = false; this.measure = on; if (on) this.bring('measure'); else this.remove('measure'); }
  setInfo(on) { if (on && this.measure) this.setMeasure(false); this.info = on; }
  esc() { if (this.st.length) this.close(); else { this.info = false; this.setMeasure(false); } }
}

async function check(p, m, R, label, waitAnim = true) {
  if (waitAnim) await p.waitForTimeout(+(process.env.ANIM_WAIT || 900));
  const g = await L.state(p);
  const below = m.st.slice(0, -1), top = m.st[m.st.length - 1] || null;
  const errs = [];
  if (g.top !== top) errs.push(`上のカード ${g.top} ≠ ${top}`);
  if (top && g.title !== TITLES[top]) errs.push(`見出し ${g.title}`);
  const tabNames = g.tabs.map(t => t.name).sort().join(',');
  if (tabNames !== below.slice().sort().join(',')) errs.push(`下の見出し ${tabNames} ≠ ${below.join(',')}`);
  for (const t of g.tabs) {
    const i = below.indexOf(t.name);
    if (t.top !== 14 + 30 * i) errs.push(`${t.name} の top ${t.top} ≠ ${14 + 30 * i}`);
    if (waitAnim && Math.abs(t.rect - (14 + 30 * i)) > 1) errs.push(`${t.name} の位置（動き終わり）${t.rect} ≠ ${14 + 30 * i}`);
    if (waitAnim && t.enter) errs.push(`${t.name} が透明のまま（enter）`);
    if (String(t.z) !== String(i)) errs.push(`${t.name} の重なり順 ${t.z} ≠ ${i}`);
  }
  if (top) {
    if (g.popTop !== 14 + 30 * below.length) errs.push(`カードの top ${g.popTop}`);
    if (waitAnim && Math.abs(g.popRect - (14 + 30 * below.length)) > 1) errs.push(`カードの位置（動き終わり）${g.popRect}`);
    if (!g.shown.some(x => x.split(' ').includes(top))) errs.push(`中身 ${g.shown}`);
  }
  const dockExp = DOCK.filter(n => m.st.includes(n)).sort().join(',');
  if (g.dockOpen.slice().sort().join(',') !== dockExp) errs.push(`ドックの open ${g.dockOpen} ≠ ${dockExp}`);
  if (g.dockExpanded.join(',') !== (DOCK.includes(top) ? top : '')) errs.push(`aria-expanded ${g.dockExpanded}`);
  if (g.tools.info !== m.info || g.tools.measure !== m.measure) errs.push(`道具 ${JSON.stringify(g.tools)} ≠ info:${m.info} measure:${m.measure}`);
  if (g.tools.info && g.tools.measure) errs.push('座標と距離が同時に入っている');
  if (g.btnInfo !== String(g.tools.info) || g.btnMeasure !== String(g.tools.measure) || g.btnInfoOn !== g.tools.info || g.btnMeasureOn !== g.tools.measure) errs.push(`ボタンの表示 ${g.btnInfo}/${g.btnMeasure}`);
  if (g.tools.measure !== m.st.includes('measure')) errs.push('距離のカードと距離の道具が食い違う');
  R.ok(label, !errs.length, errs.length ? errs.join(' / ') + ` 期待=[${m.st}]` : `[${m.st}]`);
  return !errs.length;
}

(async () => {
  const R = L.recorder('t01_popstack');
  const { p, errors, close } = await L.page({ viewport: { width: 1280, height: 800 } });
  await L.open(p, [L.DATA + '/c_xyzi.pcd']);
  const m = new Model();
  const act = {
    dock: async n => { await p.click(`[data-open="${n}"]`); m.dock(n); },
    x: async () => { await p.click('#popClose'); m.close(); },
    tab: async n => { await p.click(`.ptab[data-name="${n}"]`); m.bring(n); },
    bMeasure: async () => { await p.click('[data-tool="measure"]'); m.setMeasure(!m.measure); },
    bInfo: async () => { await p.click('[data-tool="info"]'); m.setInfo(!m.info); },
    kM: async () => { await p.keyboard.press('m'); m.setMeasure(!m.measure); },
    kI: async () => { await p.keyboard.press('i'); m.setInfo(!m.info); },
    esc: async () => { await p.keyboard.press('Escape'); m.esc(); },
  };
  // --- 狙った手順 ---
  for (const n of DOCK) await act.dock(n);
  await act.bMeasure();
  await check(p, m, R, 'A1 8 枚すべてを開く（ドック 7 枚＋距離）');
  await L.shot(p, 't01_A1_8cards');
  await act.dock('color'); await check(p, m, R, 'A2 途中（色）を閉じると残りが詰める');
  await L.shot(p, 't01_A2_close_middle');
  await act.dock('open'); await check(p, m, R, 'A3 いちばん下（ファイル）を閉じる');
  await act.tab('view'); await check(p, m, R, 'A4 下の見出し（視点）を押すと前に出る');
  await act.bInfo(); await check(p, m, R, 'A5 座標を入れると距離のカードだけ消える（ほかは残る）');
  await act.kM(); await check(p, m, R, 'A6 キー m で距離 → 座標が切れ、距離のカードが一番上に');
  await act.x(); await check(p, m, R, 'A7 距離のカードの × → 距離も切れる');
  while (m.st.length) { await act.x(); }
  await check(p, m, R, 'A8 × を繰り返して全部閉じる');
  await act.esc(); await check(p, m, R, 'A9 カードがないときの Esc（道具を切るだけ）');
  // 速い連打（動きの途中）
  for (let i = 0; i < 5; i++) { await p.click('[data-open="color"]'); await p.click('[data-open="display"]'); }
  m.dock('color'); m.dock('display'); for (let i = 0; i < 4; i++) { m.dock('color'); m.dock('display'); }
  await check(p, m, R, 'A10 2 枚を 5 回ずつ速く開閉（最後の状態）');
  while (m.st.length) { await act.x(); }
  // --- 無作為歩行 ---
  let ng = 0;
  for (let i = 0; i < STEPS; i++) {
    const below = m.st.slice(0, -1);
    const kinds = ['dock', 'dock', 'dock', 'bMeasure', 'bInfo', 'kM', 'kI', 'esc'];
    if (m.st.length) kinds.push('x', 'x');
    if (below.length) kinds.push('tab', 'tab');
    const k = pick(kinds);
    let desc = k;
    if (k === 'dock') { const n = pick(DOCK); desc += ':' + n; await act.dock(n); }
    else if (k === 'tab') { const n = pick(below); desc += ':' + n; await act.tab(n); }
    else await act[k]();
    const good = await check(p, m, { ok: (name, c, d) => { if (!c) R.ok(`B 歩行 ${i} ${desc}`, false, d); return c; } }, '', true);
    if (!good) { ng++; if (ng > 5) break; }
  }
  R.ok(`B 無作為歩行 ${STEPS} 手（種 ${SEED}）で不変条件が崩れない`, ng === 0, `崩れた手 ${ng}`);
  await L.shot(p, 't01_B_walk_end');
  // --- 最小の窓（アプリ version の最小 900×600）で 8 枚 ---
  while (m.st.length) await act.x();
  await p.setViewportSize({ width: 900, height: 600 });
  for (const n of DOCK) await act.dock(n);
  await act.bMeasure();
  await check(p, m, R, 'C1 900×600 で 8 枚');
  const geo = await p.evaluate(() => {
    const r = e => { const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) }; };
    return { pop: r(document.getElementById('pop')), dock: r(document.getElementById('dock')), head: r(document.querySelector('.pophead')), vh: innerHeight };
  });
  R.ok('C2 900×600・8 枚でも一番上のカードの見出しと中身が窓の中・ドックより上', geo.pop.t >= 0 && geo.pop.b <= geo.dock.t && geo.pop.h > 60, geo);
  await L.shot(p, 't01_C_900x600_8cards');
  for (const n of ['color', 'level']) { await act.tab(n); }
  await check(p, m, R, 'C3 900×600 で見出しを押して入れ替え');
  // 動きを減らす設定（prefers-reduced-motion）でも最後の位置は同じ
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await act.dock('view'); await check(p, m, R, 'C4 動きを減らす設定でも途中を閉じると詰める', false);
  // 低い窓（試作ページを小さな枠で開いたときなど）で 8 枚: 一番上のカードの × が見えて押せるか
  while (m.st.length) await act.x();
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  for (const h of [500, 420, 360]) {
    await p.setViewportSize({ width: 900, height: h });
    for (const n of DOCK) await act.dock(n);
    await act.bMeasure();
    await p.waitForTimeout(900);
    const g = await p.evaluate(() => { const b = document.getElementById('popClose').getBoundingClientRect(); const pr = document.getElementById('pop').getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { x: Math.round(b.top), popH: Math.round(pr.height), hitIsClose: hit && hit.id === 'popClose', vh: innerHeight }; });
    R.ok(`C5 高さ ${h} px の窓で 8 枚重ねても、一番上のカードの × が見えて押せる`, g.hitIsClose && g.popH > 40, g);
    await L.shot(p, `t01_C5_h${h}`);
    await p.evaluate(() => { for (let i = 0; i < 20 && !document.getElementById('pop').hidden; i++) document.getElementById('popClose').click(); });
    m.st = []; m.measure = false;
  }
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
