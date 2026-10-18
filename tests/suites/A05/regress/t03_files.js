// t03 ファイル一覧（追加・閉じる・表示/非表示・選択・色・同じファイル・読み込み中/補正中に閉じる）と、閉じたあとの知らせ（デシジョンテーブル）
//   heavy node t03_files.js
const L = require('./lib.js');
const D = L.DATA;

async function setMode(p, mode) {
  await p.evaluate(m => { const s = document.getElementById('colorMode'); s.value = m; s.dispatchEvent(new Event('change')); }, mode);
  await p.waitForTimeout(500);
}
async function clearMsg(p) { await p.evaluate(() => { document.getElementById('statMsg').textContent = ''; document.getElementById('statMsg').style.color = ''; }); }
async function removeByName(p, name) {
  await p.evaluate(n => { const li = [...document.querySelectorAll('#fileList li')].find(l => l.querySelector('.name').textContent === n); li.querySelector('[data-act=remove]').click(); }, name);
  await p.waitForTimeout(600);
}

(async () => {
  const R = L.recorder('t03_files');
  const { p, errors, close } = await L.page();
  // ---- デシジョンテーブル: 閉じたあとの知らせ ----
  const rows = [
    // [名前, 開くファイル, 色の付け方, 閉じるファイル（null=全部）, 期待する色の付け方, 期待する知らせ（'' = 何も出ない）]
    ['D1 高さ・全部閉じる', ['c_xyzi.pcd'], 'height', null, 'height', ''],
    ['D2 反射・全部閉じる', ['c_xyzi.pcd'], 'field', null, 'height', ''],
    ['D3 1 色・全部閉じる', ['c_xyzi.pcd'], 'single', null, 'single', ''],
    ['D4 RGB・全部閉じる', ['c_rgb.pcd'], 'rgb', null, 'height', ''],
    ['D5 RGB・RGB のファイルを閉じて RGB なしが残る', ['c_rgb.pcd', 'c_xyz.pcd'], 'rgb', 'c_rgb.pcd', 'height', ''],
    ['D6 RGB・RGB のファイルを閉じて RGB ありが残る', ['c_rgb.pcd', 'c_rgbi.pcd'], 'rgb', 'c_rgb.pcd', 'rgb', ''],
    ['D7 反射・欄のあるファイルを閉じて欄なしが残る', ['c_xyzi.pcd', 'c_xyz.pcd'], 'field', 'c_xyzi.pcd', 'height', ''],
    ['D8 反射・intensity を閉じて label が残る', ['c_xyzi.pcd', 'c_label.pcd'], 'field', 'c_xyzi.pcd', 'field', ''],
    ['D9 1 色・RGB を閉じる', ['c_rgb.pcd', 'c_xyz.pcd'], 'single', 'c_rgb.pcd', 'single', ''],
    ['D10 高さ・RGB を閉じる', ['c_rgb.pcd', 'c_xyz.pcd'], 'height', 'c_rgb.pcd', 'height', ''],
    ['D11 RGB（RGB なしだけ開いていて知らせが出ている）・全部閉じる', ['c_xyz.pcd'], 'rgb', null, 'height', ''],
  ];
  for (const [name, files, mode, closeName, expMode, expMsg] of rows) {
    await L.closeAll(p);
    await L.open(p, files.map(f => `${D}/${f}`));
    await setMode(p, mode);
    await clearMsg(p);
    if (closeName) await removeByName(p, closeName); else { await L.closeAll(p); await p.waitForTimeout(600); }
    const st = await L.state(p);
    const errs = [];
    if (st.colorMode !== expMode) errs.push(`色の付け方 ${st.colorMode}（期待 ${expMode}）`);
    if (st.msg !== expMsg) errs.push(`知らせ「${st.msg}」`);
    if (st.colorMode !== st.SColorMode) errs.push(`select と S.colorMode が食い違う ${st.SColorMode}`);
    // 残ったファイルの描き方が色の付け方と合っているか
    for (const f of st.files) {
      const want = st.colorMode === 'height' ? 0 : st.colorMode === 'single' ? 3 : st.colorMode === 'rgb' ? (f.rgb ? 4 : 3) : null;
      if (want !== null && f.mode !== want) errs.push(`${f.name} の描き方 ${f.mode}（期待 ${want}）`);
    }
    R.ok(name, !errs.length, errs.join(' / ') || `残り ${st.files.map(f => f.name)}`);
  }
  // ---- 表示/非表示・選択・色 ----
  await L.closeAll(p);
  await L.open(p, [`${D}/c_xyzi.pcd`, `${D}/run_a.las`, `${D}/c_rgb.pcd`]);
  let st = await L.state(p);
  R.ok('E1 3 つ開くと一覧に 3 行', st.files.length === 3 && (await p.$$eval('#fileList li', l => l.length)) === 3, st.files.map(f => f.name));
  await L.card(p, 'open');
  const pts0 = await p.textContent('#statPoints');
  await p.click('#fileList li:nth-child(2) [data-act=vis]');
  await p.waitForTimeout(400);
  st = await L.state(p);
  const pts1 = await p.textContent('#statPoints');
  R.ok('E2 2 つ目の表示を切ると点が隠れ、表示中の点数が減る', st.files[1].vis === false && st.files[1].pvis === false && pts0 !== pts1, `${pts0} → ${pts1}`);
  await p.click('#fileList li:nth-child(2) [data-act=vis]'); await p.waitForTimeout(300);
  st = await L.state(p);
  R.ok('E3 もう一度入れると戻る', st.files[1].vis && st.files[1].pvis);
  await p.click('#fileList li:nth-child(1) .name'); await p.waitForTimeout(300);
  const info = await p.evaluate(() => ({ active: window.__pcd.S.active, open: document.getElementById('infoBox').open, info: document.getElementById('info').textContent, cls: [...document.querySelectorAll('#fileList li')].map(l => l.className.trim()) }));
  R.ok('E4 名前を押すと選択され、情報の欄に出る', info.cls[0] === 'active' && info.info.includes('c_xyzi.pcd') && info.open, info.cls);
  // 単色の色を変える
  await setMode(p, 'single');
  await L.card(p, 'open');
  await p.evaluate(() => { const c = document.querySelector('#fileList li:nth-child(1) [data-act=color]'); c.value = '#ff0000'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(200);
  const col = await p.evaluate(() => { const f = window.__pcd.S.files[0]; const c = f.mat.uniforms.uColor.value; return [f.color, +c.r.toFixed(2), +c.g.toFixed(2), +c.b.toFixed(2), document.getElementById('legend').innerHTML.includes('#ff0000')]; });
  R.ok('E5 一覧の色を変えると 1 色の色と凡例が変わる', col[0] === '#ff0000' && col[1] === 1 && col[2] === 0 && col[4], col);
  // ---- 閉じたあとにファイルの色がほかと重ならないか ----
  await L.closeAll(p);
  await L.open(p, [`${D}/c_xyz.pcd`, `${D}/c_xyzi.pcd`, `${D}/c_rgb.pcd`]);
  await removeByName(p, 'c_xyz.pcd');
  await L.open(p, [`${D}/c_label.pcd`]);
  const colors = await p.evaluate(() => window.__pcd.S.files.map(f => [f.name, f.color]));
  R.ok('E6 1 つ閉じてから開いたファイルの色が、残っているファイルの色と重ならない', new Set(colors.map(c => c[1])).size === colors.length, colors);
  // ---- 同じファイルをもう一度 ----
  await L.closeAll(p);
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  st = await L.state(p);
  R.ok('E7 同じファイルをもう一度開くと 2 行になる（別物として扱う）', st.files.length === 2, st.files.map(f => f.id + ':' + f.name));
  await L.card(p, 'open');
  await p.click('#fileList li:nth-child(1) [data-act=remove]'); await p.waitForTimeout(400);
  st = await L.state(p);
  R.ok('E8 片方を閉じてももう片方は残り、表示される', st.files.length === 1 && st.files[0].pvis, st.files);
  // 残った方でクリック（別スレッドの点の索引が残っているか）
  await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(500);
  const sc = await L.screenOf(p, [15, 0, 1.0]);
  const hit = await p.evaluate(([x, y]) => window.__pcd.pickAt(x, y, true).then(h => h && { id: h.id, p: h.p }), [sc.x, sc.y]);
  R.ok('E9 残った方の点を選べる', hit && hit.id === st.files[0].id, hit);
  // ---- 全部閉じたあとの後片付け ----
  await p.click('[data-tool="measure"]');
  const a = await L.screenOf(p, [8, 0, 0]), b = await L.screenOf(p, [12, 0, 0]);
  await p.mouse.click(a.x, a.y); await p.waitForTimeout(800); await p.mouse.click(b.x, b.y); await p.waitForTimeout(800);
  await L.closeAll(p); await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ measures: window.__pcd.S.measures.length, tags: document.querySelectorAll('#labels .mnum').length, level: document.getElementById('levelResult').textContent, pts: document.getElementById('statPoints').textContent, empty: !document.getElementById('empty').hidden, files: !document.getElementById('filesBox').hidden, info: document.getElementById('infoBox').hidden, offset: window.__pcd.S.offset, li: window.__pcd.S.levelInfo, M: Array.from(window.__pcd.world.matrix.elements).every((v, i) => Math.abs(v - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]) < 1e-12) }));
  R.ok('E10 全部閉じると計測・水平補正・情報が片付き、初めの画面に戻る', after.measures === 0 && after.tags === 0 && after.level === '' && after.pts === '点群なし' && after.empty && !after.files && after.info && after.offset === null && after.li === null && after.M, after);
  await p.click('[data-tool="measure"]');
  // ---- 水平補正の途中で閉じる（一覧に出た瞬間に閉じる。別スレッドではまだ「調べている」） ----
  await L.closeAll(p);
  await p.evaluate(() => {
    const mo = new MutationObserver(() => {
      const x = document.querySelector('#fileList [data-act=remove]');
      if (x) { mo.disconnect(); window.__removedMsg = document.getElementById('statMsg').textContent; x.click(); }
    });
    mo.observe(document.getElementById('fileList'), { childList: true, subtree: true });
  });
  await p.setInputFiles('#fileInput', [`${D}/c_xyzi.pcd`]);
  await p.waitForFunction(() => window.__removedMsg !== undefined, null, { timeout: 120000 });
  await p.waitForTimeout(5000);
  const during = { text: await p.evaluate(() => window.__removedMsg) };
  const z = await p.evaluate(() => ({ files: window.__pcd.S.files.length, li: !!window.__pcd.S.levelInfo, last: !!window.__pcd.S.lastLevel, ident: Array.from(window.__pcd.world.matrix.elements).every((v, i) => Math.abs(v - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]) < 1e-12), msg: document.getElementById('statMsg').textContent, lr: document.getElementById('levelResult').textContent }));
  R.ok('E11 水平補正の途中で閉じたあと、補正の結果が残らない（世界の行列が元のまま）', !z.li && z.ident && z.lr === '', { during: during.text, ...z });
  // その状態で、自動の水平補正を切って水平な地図を開く → 傾いて表示されないか
  await p.evaluate(() => { const c = document.getElementById('autoLevel'); c.checked = false; });
  await L.open(p, [`${D}/c_level.pcd`]);
  const z2 = await p.evaluate(() => ({ ident: Array.from(window.__pcd.world.matrix.elements).every((v, i) => Math.abs(v - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]) < 1e-12), M: Array.from(window.__pcd.world.matrix.elements).map(v => +v.toFixed(3)), lr: document.getElementById('levelResult').textContent }));
  R.ok('E12 （E11 のあと）自動補正なしで開いた地図が、前の地図の補正で回されない', z2.ident, z2);
  await L.shot(p, 't03_E12_after_close_during_level');
  await p.evaluate(() => { const c = document.getElementById('autoLevel'); c.checked = true; });
  // ---- 読み込み中に、ほかのファイルを全部閉じる ----
  await L.closeAll(p);
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  await p.setInputFiles('#fileInput', [`${D}/scans.pcd`]);
  await p.waitForFunction(() => !document.getElementById('progress').hidden, null, { timeout: 5000 }).catch(() => {});
  await L.closeAll(p);
  await L.idle(p);
  st = await L.state(p);
  const v = await p.evaluate(() => ({ first: window.__pcd.S.files.length, level: document.getElementById('levelResult').textContent, empty: document.getElementById('empty').hidden }));
  R.ok('E13 読み込み中にほかを全部閉じても、読み終わったファイルが 1 つ目として表示され、自動補正される', st.files.length === 1 && st.files[0].name === 'scans.pcd' && v.level !== '' && v.empty, { ...v, msg: st.msg });
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
