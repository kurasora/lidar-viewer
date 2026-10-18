// t02 「座標」と「距離」（状態遷移）: すべての道筋で同時に入らないか／表示がそろうか／キー操作（修飾キー・入力欄）
//   heavy node t02_tools.js
const L = require('./lib.js');

async function tools(p) {
  return p.evaluate(() => {
    const S = window.__pcd.S, $ = id => document.getElementById(id);
    const bi = document.querySelector('[data-tool=info]'), bm = document.querySelector('[data-tool=measure]');
    return {
      info: S.tools.info, measure: S.tools.measure, pending: !!S.mPending,
      bInfo: bi.getAttribute('aria-pressed') === 'true' && bi.classList.contains('on'), bMeasure: bm.getAttribute('aria-pressed') === 'true' && bm.classList.contains('on'),
      guide: $('mGuide').hidden ? '' : $('mGuide').textContent, statMode: $('statMode').textContent,
      cursor: window.__pcd.renderer.domElement.style.cursor, picking: $('stage').classList.contains('picking'),
      pickInfo: !$('pickInfo').hidden, measureCard: [...document.querySelectorAll('.ptab')].some(t => t.dataset.name === 'measure') || $('pop').dataset.name === 'measure',
      mLive: !$('mLive').hidden, measures: S.measures.length, visibleLines: S.measures.filter(m => m.line.visible).length,
      hideCeil: S.hideCeil, view: window.__pcd.cam.type,
    };
  });
}
function consistent(t) {
  const e = [];
  if (t.info && t.measure) e.push('同時に入っている');
  if (t.bInfo !== t.info) e.push('座標ボタンの表示が違う');
  if (t.bMeasure !== t.measure) e.push('距離ボタンの表示が違う');
  if (t.measureCard !== t.measure) e.push('距離のカードが道具と食い違う');
  const g = [t.measure ? (t.pending ? 'もう 1 点をクリック' : '2 点をクリックして距離を測る') : null, t.info ? '点をクリックして座標を見る' : null].filter(Boolean).join(' ・ ');
  if (t.guide !== g) e.push(`上の案内「${t.guide}」≠「${g}」`);
  const sm = [t.info ? '座標' : null, t.measure ? '距離' : null].filter(Boolean);
  if (sm.length ? !t.statMode.endsWith('クリックで' + sm.join('・')) : /クリックで/.test(t.statMode)) e.push(`右上の表示「${t.statMode}」`);
  if ((t.info || t.measure) !== (t.cursor === 'crosshair')) e.push('カーソル');
  if ((t.info || t.measure) !== t.picking) e.push('picking クラス');
  if (!t.info && t.pickInfo) e.push('座標を切ったのに吹き出しが残る');
  if (!t.measure && t.visibleLines) e.push('距離を切ったのに線が見える');
  return e;
}

(async () => {
  const R = L.recorder('t02_tools');
  const { p, errors, close } = await L.page();
  await L.open(p, [L.DATA + '/c_xyzi.pcd']);
  await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(600);
  const floorA = await L.screenOf(p, [8, 0, 0]), floorB = await L.screenOf(p, [12, 0.5, 0]);
  const chk = async (name, expect) => {
    await p.waitForTimeout(250);
    const t = await tools(p); const e = consistent(t);
    for (const [k, v] of Object.entries(expect || {})) if (t[k] !== v) e.push(`${k}=${t[k]}（期待 ${v}）`);
    R.ok(name, !e.length, e.length ? e.join(' / ') : `info=${t.info} measure=${t.measure} pending=${t.pending}`);
    return t;
  };
  const click = async (sel) => { await p.click(sel); };
  // --- 全組み合わせ（出来事 × 状態） ---
  const EV = {
    btnInfo: () => click('[data-tool="info"]'), btnMeasure: () => click('[data-tool="measure"]'),
    keyI: () => p.keyboard.press('i'), keyM: () => p.keyboard.press('m'), esc: () => p.keyboard.press('Escape'),
    cardX: async () => { if (!(await p.isHidden('#pop'))) await click('#popClose'); },
  };
  const setState = async (s) => {
    // s: none | info | measure | measurePending
    await p.evaluate(() => { const S = window.__pcd.S; });
    for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape'); }
    await p.evaluate(() => { document.querySelectorAll('#popClose').forEach(() => {}); });
    let t = await tools(p);
    if (t.info) await EV.btnInfo(); t = await tools(p); if (t.measure) await EV.btnMeasure();
    if (s === 'info') await EV.btnInfo();
    if (s === 'measure' || s === 'measurePending') await EV.btnMeasure();
    if (s === 'measurePending') { await p.mouse.click(floorA.x, floorA.y); await p.waitForTimeout(900); }
  };
  const expectAfter = {
    none: { btnInfo: { info: true }, btnMeasure: { measure: true }, keyI: { info: true }, keyM: { measure: true }, esc: { info: false, measure: false }, cardX: { info: false, measure: false } },
    info: { btnInfo: { info: false }, btnMeasure: { info: false, measure: true }, keyI: { info: false }, keyM: { info: false, measure: true }, esc: { info: false }, cardX: { info: true } },
    measure: { btnInfo: { info: true, measure: false }, btnMeasure: { measure: false }, keyI: { info: true, measure: false }, keyM: { measure: false }, esc: { measure: false }, cardX: { measure: false } },
    measurePending: { btnInfo: { info: true, measure: false, pending: false }, btnMeasure: { measure: false, pending: false }, keyI: { info: true, measure: false, pending: false }, keyM: { measure: false, pending: false }, esc: { measure: true, pending: false }, cardX: { measure: false, pending: false } },
  };
  for (const st of Object.keys(expectAfter)) {
    for (const ev of Object.keys(EV)) {
      await setState(st);
      const t0 = await tools(p);
      if (st === 'measurePending' && !t0.pending) { R.ok(`前提 ${st}`, false, '1 点目が選べなかった'); continue; }
      await EV[ev]();
      await chk(`T ${st} --${ev}--> `, expectAfter[st][ev]);
    }
  }
  // 座標で点を出してから距離へ → 吹き出しが消える
  await setState('info');
  await p.mouse.click(floorA.x, floorA.y); await p.waitForTimeout(900);
  const a = await tools(p);
  await EV.btnMeasure();
  const b = await chk('U1 座標の吹き出しを出したあと距離を入れる → 吹き出しが消える', { pickInfo: false });
  R.ok('U1 前提: 座標の吹き出しが出ていた', a.pickInfo);
  // 計測 1 本作って距離を切る → 線は見えないが残る、Delete で消えてしまうか
  await setState('measure');
  await p.mouse.click(floorA.x, floorA.y); await p.waitForTimeout(900);
  await p.mouse.click(floorB.x, floorB.y); await p.waitForTimeout(900);
  let t = await tools(p);
  R.ok('U2 前提: 計測が 1 本できた', t.measures === 1, t.measures);
  await EV.btnMeasure();
  t = await tools(p);
  R.ok('U2 距離を切ると線は隠れる（消えない）', t.measures === 1 && t.visibleLines === 0, t);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Delete'); await p.waitForTimeout(200);
  t = await tools(p);
  R.ok('U3 距離を切っている（線が見えない）ときに Delete を押しても、見えない計測が黙って消えない', t.measures === 1, `計測の本数 ${t.measures}`);
  await EV.btnMeasure(); t = await tools(p);
  R.ok('U3b もう一度距離を入れると残っていた線が見える', t.visibleLines === t.measures, t);
  // --- 入力欄にフォーカスがあるときはショートカットが効かない ---
  await setState('none');
  await p.click('[data-open="display"]');
  await p.focus('#pointSize');
  await p.keyboard.press('i'); await p.keyboard.press('m'); await p.keyboard.press('c');
  t = await tools(p);
  R.ok('K1 つまみにフォーカスがあるとき i/m/c は効かない', !t.info && !t.measure && t.hideCeil === true, t);
  await p.click('[data-open="display"]');
  // --- 修飾キー付き ---
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const combos = [['Control+c', 'hideCeil'], ['Control+i', 'info'], ['Control+m', 'measure'], ['Control+p', 'view'], ['Alt+c', 'hideCeil'], ['Meta+c', 'hideCeil']];
  for (const [k, what] of combos) {
    await setState('none');
    const before = await tools(p);
    await p.keyboard.press(k); await p.waitForTimeout(300);
    const after = await tools(p);
    R.ok(`K2 ${k} では画面の状態（${what}）が変わらない`, before[what] === after[what], `${before[what]} → ${after[what]}`);
    if (before[what] !== after[what]) { await p.keyboard.press(k); await p.waitForTimeout(200); }
  }
  // 計測の表の数字を選んで Ctrl+C（コピーのつもり）
  await setState('measure');
  await p.mouse.click(floorA.x, floorA.y); await p.waitForTimeout(900);
  await p.mouse.click(floorB.x, floorB.y); await p.waitForTimeout(900);
  await p.evaluate(() => { const td = document.querySelector('#measureTable td.b'); const r = document.createRange(); r.selectNodeContents(td); getSelection().removeAllRanges(); getSelection().addRange(r); document.activeElement && document.activeElement.blur(); });
  const hc0 = (await tools(p)).hideCeil;
  await p.keyboard.press('Control+c'); await p.waitForTimeout(300);
  const hc1 = (await tools(p)).hideCeil;
  R.ok('K3 計測の表の数字を選んで Ctrl+C → 天井の表示が変わらない', hc0 === hc1, `${hc0} → ${hc1}、知らせ「${(await L.msg(p)).text}」`);
  await L.shot(p, 't02_K3_ctrl_c');
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
