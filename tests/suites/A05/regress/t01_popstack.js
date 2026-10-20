// t01 左上のカードの重なり（状態遷移）: モデルと突き合わせる無作為歩行 + 狙った手順 + 最小の窓
//   heavy node t01_popstack.js [歩数=220] [種=1]
const L = require('./lib.js');
const STEPS = +(process.argv[2] || 220), SEED = +(process.argv[3] || 1);
const DOCK = ['open', 'view', 'color', 'section', 'level', 'settings'];
const TITLES = { open: 'ファイル', view: '表示', color: '色', section: '断面・切り出し', level: '水平補正', settings: '設定', measure: '距離', info: '座標' };
let s = SEED >>> 0 || 1; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];

// 仕様のモデル（2026-10-20〜: 開けるカードは常に 1 枚。座標・距離もカード。別のカードを開くと前のカード・道具は閉じる）
class Model {
  constructor() { this.top = null; }
  get st() { return this.top ? [this.top] : []; }
  get info() { return this.top === 'info'; }
  get measure() { return this.top === 'measure'; }
  dock(n) { this.top = this.top === n ? null : n; }
  close() { this.top = null; }
  setMeasure(on) { if (on) this.top = 'measure'; else if (this.top === 'measure') this.top = null; }
  setInfo(on) { if (on) this.top = 'info'; else if (this.top === 'info') this.top = null; }
  esc() { this.top = null; }
}

async function check(p, m, R, label, waitAnim = true) {
  if (waitAnim) await p.waitForTimeout(+(process.env.ANIM_WAIT || 400));
  const g = await L.state(p);
  const top = m.top;
  const errs = [];
  if (g.top !== top) errs.push(`上のカード ${g.top} ≠ ${top}`);
  if (top && g.title !== TITLES[top]) errs.push(`見出し ${g.title}`);
  if (g.tabs.length) errs.push(`下に見出しが残る ${g.tabs.map(t => t.name)}`);
  if (top && !g.shown.some(x => x.split(' ').includes(top))) errs.push(`中身 ${g.shown}`);
  const dockExp = DOCK.includes(top) ? top : '';
  if (g.dockOpen.slice().sort().join(',') !== dockExp) errs.push(`ドックの open ${g.dockOpen} ≠ ${dockExp}`);
  if (g.dockExpanded.join(',') !== dockExp) errs.push(`aria-expanded ${g.dockExpanded}`);
  if (g.tools.info !== m.info || g.tools.measure !== m.measure) errs.push(`道具 ${JSON.stringify(g.tools)} ≠ info:${m.info} measure:${m.measure}`);
  if (g.tools.info && g.tools.measure) errs.push('座標と距離が同時に入っている');
  if (g.btnInfo !== String(g.tools.info) || g.btnMeasure !== String(g.tools.measure) || g.btnInfoOn !== g.tools.info || g.btnMeasureOn !== g.tools.measure) errs.push(`ボタンの表示 ${g.btnInfo}/${g.btnMeasure}`);
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
  await act.dock('open'); await check(p, m, R, 'A1 ファイルのカードを開く');
  await act.dock('color'); await check(p, m, R, 'A2 別のカード（色）を開くと、ファイルのカードは閉じる（1 枚だけ）');
  await L.shot(p, 't01_A2_one_card');
  await act.bMeasure(); await check(p, m, R, 'A3 距離を入れると色のカードは閉じ、距離のカードだけ');
  await act.bInfo(); await check(p, m, R, 'A4 座標を入れると距離は切れて座標のカードだけ');
  await act.kM(); await check(p, m, R, 'A5 キー m で距離 → 座標が切れる');
  await act.dock('settings'); await check(p, m, R, 'A6 設定を開くと距離は切れる');
  await act.dock('settings'); await check(p, m, R, 'A7 同じボタンをもう一度押すと閉じる');
  await act.kI(); await act.x(); await check(p, m, R, 'A8 座標のカードの × → 座標も切れる');
  await act.esc(); await check(p, m, R, 'A9 カードがないときの Esc');
  // 速い連打（動きの途中）
  for (let i = 0; i < 5; i++) { await p.click('[data-open="color"]'); await p.click('[data-open="view"]'); }
  for (let i = 0; i < 5; i++) { m.dock('color'); m.dock('view'); }
  await check(p, m, R, 'A10 2 枚を 5 回ずつ速く開閉（最後の状態）');
  if (m.top) await act.x();
  // --- 無作為歩行 ---
  let ng = 0;
  for (let i = 0; i < STEPS; i++) {
    const below = m.st.slice(0, -1);
    const kinds = ['dock', 'dock', 'dock', 'bMeasure', 'bInfo', 'kM', 'kI', 'esc'];
    if (m.st.length) kinds.push('x', 'x');
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
  // --- 最小の窓（アプリ version の最小 900×600）と低い窓: どのカードでも見出しと × が窓の中・ドックより上
  if (m.top) await act.x();
  for (const [w, h] of [[900, 600], [900, 500], [900, 420], [900, 360]]) {
    await p.setViewportSize({ width: w, height: h });
    for (const n of DOCK) {
      await act.dock(n); await p.waitForTimeout(300);
      const g = await p.evaluate(() => { const b = document.getElementById('popClose').getBoundingClientRect(); const pr = document.getElementById('pop').getBoundingClientRect(); const d = document.getElementById('dock').getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { top: Math.round(pr.top), bottom: Math.round(pr.bottom), dockTop: Math.round(d.top), hitIsClose: !!hit && hit.id === 'popClose' }; });
      R.ok(`C ${w}×${h} の「${TITLES[n]}」: × が見えて押せる・ドックに重ならない`, g.hitIsClose && g.top >= 0 && g.bottom <= g.dockTop, g);
      await act.x();
    }
    await L.shot(p, `t01_C_${w}x${h}`);
  }
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
