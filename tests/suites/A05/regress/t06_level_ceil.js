// t06 水平補正（自動・手動・元に戻す・選択肢・失敗の知らせ）と天井を隠す（ボタン・c キー・天井がないとき・補正を戻したあと）
//   heavy node t06_level_ceil.js
const L = require('./lib.js');
const D = L.DATA;
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

async function lv(p) {
  return p.evaluate(() => {
    const S = window.__pcd.S, M = Array.from(window.__pcd.world.matrix.elements);
    return { leveled: !!S.levelInfo, ident: M.every((v, i) => Math.abs(v - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]) < 1e-9), M: M.map(v => +v.toFixed(4)),
      result: document.getElementById('levelResult').textContent, msg: document.getElementById('statMsg').textContent, err: !!document.getElementById('statMsg').style.color,
      hideCeil: S.hideCeil, ceil: !!S.ceil, ceilZ: S.ceilZ, ceilOn: document.getElementById('btnCeil').classList.contains('on'), uCeilD: null,
      range: document.querySelector('#colorRange .dval') && document.querySelector('#colorRange .dval').textContent, bmaxZ: S.bounds.max[2] };
  });
}
async function check(p, id) { await p.evaluate(i => document.getElementById(i).click(), id); await p.waitForTimeout(1200); }

(async () => {
  const R = L.recorder('t06_level_ceil');
  const { p, errors, close } = await L.page();
  // ---- 自動の水平補正 ----
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  let s = await lv(p);
  // 0.4.1 から: 原点は補正の前後で変えない（床を z = 0 にしない。結果に「→ 0 m」は出ない）。作った傾きは 3.0°
  const tiltOf = r => +((/傾き ([\d.]+)° を補正/.exec(r) || [])[1]);
  R.ok('L1 開くと自動で水平補正される（結果の 3 行・知らせ）', s.leveled && !s.ident && Math.abs(tiltOf(s.result) - 3.0) < 0.2 && /廊下の向きに合わせて/.test(s.result) && /床の高さ [-\d.]+ m$/m.test(s.result) && !/→ 0 m/.test(s.result) && s.msg === '水平補正しました', s.result);
  await L.card(p, 'level');
  await p.click('#btnLevelReset'); await p.waitForTimeout(900);
  s = await lv(p);
  R.ok('L2 元に戻す → 行列が元・結果の欄が空・知らせ', !s.leveled && s.ident && s.result === '' && s.msg === '水平補正を元に戻しました', s);
  // 「廊下の向きを x 軸に」「床を z = 0」の選択肢は 0.4.1 で画面から外した（向きは常にそろえ、原点は変えない）。L3・L5・L6 は対象外
  await p.click('#btnLevel'); await p.waitForTimeout(1500);
  s = await lv(p);
  R.ok('L4 「自動で水平にする」でもう一度補正される', s.leveled && !s.ident, s.result);
  // ---- 天井 ----
  s = await lv(p);
  R.ok('C1 天井が見つかり、既定で隠れている（ボタン on）', s.ceil && s.hideCeil && s.ceilOn, { ceilZ: s.ceilZ });
  const range1 = s.range;
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('c'); await p.waitForTimeout(600);
  s = await lv(p);
  R.ok('C2 c キーで天井を表示（ボタン off・知らせ・色の範囲が天井まで広がる）', !s.hideCeil && !s.ceilOn && s.msg === '天井を表示しています' && s.range !== range1, { range1, range2: s.range });
  await L.card(p, 'view'); await p.click('#btnCeil'); await p.waitForTimeout(600);
  s = await lv(p);
  R.ok('C3 ボタンで天井をまた隠す（知らせに高さ）', s.hideCeil && s.ceilOn && /^天井（(水平補正後の)?高さ [\d.]+ m より上）を隠しました$/.test(s.msg), s.msg);
  await L.card(p, 'level'); await p.click('#btnLevelReset'); await p.waitForTimeout(900);
  s = await lv(p);
  R.ok('C4 水平補正を元に戻しても、傾いた天井に沿って隠したまま', s.ceil && s.hideCeil, s);
  await L.shot(p, 't06_C4_ceil_after_reset');
  // ---- 失敗するもの（平面が少ない） ----
  await L.closeAll(p);
  await L.open(p, [`${D}/small_blob.pcd`]);
  s = await lv(p);
  R.ok('F1 自動補正が失敗するファイルを開いたとき、開いた結果が分かり、失敗の知らせが分かりやすい', !s.leveled, { msg: s.msg, err: s.err });
  R.ok('F1b 自動で行った補正の失敗が赤い「エラー」になって、開けたかどうかの知らせを上書きしない', !(s.err && /水平補正できませんでした/.test(s.msg)), s.msg);
  await L.card(p, 'level'); await p.click('#btnLevel'); await p.waitForTimeout(1200);
  s = await lv(p);
  R.ok('F2 手動の補正の失敗は赤い知らせ', s.err && /^水平補正できませんでした: /.test(s.msg), s.msg);
  // 天井がない点群でのボタンとキー
  s = await lv(p);
  const c0 = { ceil: s.ceil, hide: s.hideCeil, on: s.ceilOn };
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('c'); await p.waitForTimeout(300); const m1 = (await lv(p)).msg;
  await p.keyboard.press('c'); await p.waitForTimeout(300); const m2 = (await lv(p)).msg;
  R.ok('C5 天井がない点群では「天井を隠す」が入って見えず、押すと「天井が見つかりません」になる', !(c0.on && !c0.ceil) && /天井が見つかりません/.test(m1), { before: c0, press1: m1, press2: m2 });
  // ---- 平らなもの（画像）は自動補正しない ----
  await L.closeAll(p);
  await L.open(p, [`${L.SF}/pillow_topview.png`]);
  s = await lv(p);
  R.ok('F3 画像（平ら）は自動補正しない・エラーなし', !s.leveled && !s.err, s.msg);
  // ---- 自動補正を切って開く ----
  await L.closeAll(p);
  await L.card(p, 'settings'); await p.click('#setTabCtrl');
  await p.click('label:has(#autoLevel)'); // 切る（2026-10-20〜 設定の「操作」）
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  s = await lv(p);
  R.ok('F4 「開いたときに傾きを自動で補正する」を切ると補正しない', !s.leveled && s.ident && s.result === '', s.msg);
  await L.card(p, 'settings'); await p.click('#setTabCtrl'); await p.click('label:has(#autoLevel)');
  // ---- ファイルが 2 つのとき、選んでいるファイルで補正する ----
  await L.closeAll(p);
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  await L.open(p, [`${D}/c_level.pcd`]);
  s = await lv(p);
  const t1 = s.result;
  await L.card(p, 'open'); await p.click('#fileList li:nth-child(2) .name'); await L.card(p, 'level');
  await p.click('#btnLevel'); await p.waitForTimeout(1500);
  s = await lv(p);
  R.ok('F5 2 つ目（水平な地図）を選んで補正すると、その地図で補正し直す（傾きほぼ 0）', /傾き 0\.\d+° を補正/.test(s.result), { before: t1, after: s.result });
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
