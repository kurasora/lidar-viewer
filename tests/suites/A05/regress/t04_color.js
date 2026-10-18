// t04 色の付け方（デシジョンテーブル）: 色の付け方 × ファイルの欄、パレット・塗り方・間隔、点の大きさ、分類の凡例と描いた色
//   heavy node t04_color.js
const L = require('./lib.js');
const D = L.DATA;

async function setMode(p, mode) {
  await L.card(p, 'color');
  await p.click(`#colorBasic [data-val="${mode}"]`).catch(async () => { await p.evaluate(m => { const s = document.getElementById('colorMode'); s.value = m; s.dispatchEvent(new Event('change')); }, mode); });
  await p.waitForTimeout(600);
}
async function ui(p) {
  return p.evaluate(() => {
    const $ = id => document.getElementById(id), S = window.__pcd.S;
    return {
      mode: $('colorMode').value, S: S.colorMode, field: S.field,
      rowField: !$('rowField').hidden, rowCmap: !$('rowCmap').hidden, rangeBox: !$('rangeBox').hidden, rowMap: !$('rowMap').hidden, rowBand: !$('rowBand').hidden,
      legendBar: !!document.querySelector('#legend .bar'), legendCats: [...document.querySelectorAll('#legend .cats span')].map(s => s.textContent),
      tiles: [...document.querySelectorAll('#colorBasic [data-val]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.val),
      files: S.files.map(f => ({ name: f.name, mode: f.mat.uniforms.uMode.value, rgb: f.hasRgb, fields: Object.keys(f.stats) })),
      msg: $('statMsg').textContent, opts: [...$('fieldSel').options].map(o => o.value),
    };
  });
}
function expectFor(mode, files, field, categorical) {
  // 仕様（デシジョンテーブル）
  const anyField = files.some(f => f.fields.length), anyRgb = files.some(f => f.rgb);
  if (mode === 'field' && !anyField) return { mode: 'height', per: files.map(() => 0), msg: 'この点群には色分けできる項目がありません' };
  if (mode === 'height') return { mode, per: files.map(() => 0) };
  if (mode === 'single') return { mode, per: files.map(() => 3) };
  if (mode === 'rgb') return { mode, per: files.map(f => f.rgb ? 4 : 3), msg: anyRgb ? undefined : 'RGB の色を持つファイルがないので、単色で表示しています' };
  return { mode, per: files.map(f => f.fields.includes(field) ? (categorical ? 2 : 1) : 3) };
}

(async () => {
  const R = L.recorder('t04_color');
  const { p, errors, close } = await L.page();
  const sets = [
    ['S1 RGB+強度', ['c_rgbi.pcd']], ['S2 RGB のみ', ['c_rgb.pcd']], ['S3 強度のみ', ['c_xyzi.pcd']], ['S4 xyz のみ', ['c_xyz.pcd']],
    ['S5 強度＋xyz のみ', ['c_xyzi.pcd', 'c_xyz.pcd']], ['S6 RGB あり＋なし', ['c_rgb.pcd', 'c_xyz.pcd']], ['S7 分類（label）', ['c_label.pcd']],
    ['S8 強度＋分類（別々のファイル）', ['c_xyzi.pcd', 'c_label.pcd']], ['S9 LAS（RGB・分類・強度）', ['run_a.las']],
  ];
  for (const [name, files] of sets) {
    await L.closeAll(p);
    await L.open(p, files.map(f => `${D}/${f}`));
    let u = await ui(p);
    const firstRgb = u.files[0].rgb;
    R.ok(`${name}: 開いた直後の色の付け方（1 つ目が RGB を持てば RGB、なければ前のまま）`, firstRgb ? u.mode === 'rgb' : true, u.mode);
    for (const mode of ['height', 'field', 'single', 'rgb']) {
      await p.evaluate(() => { document.getElementById('statMsg').textContent = ''; });
      await setMode(p, mode);
      u = await ui(p);
      const sumCat = await p.evaluate(() => { const S = window.__pcd.S; if (!S.field) return false; const vals = S.files.map(f => f.stats[S.field]).filter(Boolean); return vals.length > 0 && vals.every(s => s.categorical); });
      const e = expectFor(mode, u.files, u.field, sumCat);
      const errs = [];
      if (u.mode !== e.mode) errs.push(`色の付け方 ${u.mode}（期待 ${e.mode}）`);
      if (u.S !== u.mode) errs.push(`S.colorMode ${u.S}`);
      if (JSON.stringify(u.files.map(f => f.mode)) !== JSON.stringify(e.per)) errs.push(`描き方 ${JSON.stringify(u.files.map(f => f.mode))}（期待 ${JSON.stringify(e.per)}）`);
      if (e.msg !== undefined && u.msg !== e.msg) errs.push(`知らせ「${u.msg}」（期待「${e.msg}」）`);
      if (e.msg === undefined && u.msg) errs.push(`余計な知らせ「${u.msg}」`);
      const m = u.mode, cat = m === 'field' && sumCat;
      if (u.rowField !== (m === 'field')) errs.push('項目の行');
      if (u.rowCmap !== (m === 'height' || m === 'field')) errs.push('配色の行');
      if (u.rangeBox !== (m === 'height' || (m === 'field' && !cat))) errs.push('範囲の行');
      if (u.rowMap !== (m === 'height' || (m === 'field' && !cat))) errs.push('塗り方の行');
      if (u.rowBand) errs.push('間隔の行（しまでないのに出ている）');
      const wantCats = m === 'single' || m === 'rgb' || cat;
      if (wantCats ? (!u.legendCats.length || u.legendBar) : (!u.legendBar)) errs.push(`凡例 bar=${u.legendBar} cats=${u.legendCats.length}`);
      if (u.tiles.join() !== m) errs.push(`ボタンの選択 ${u.tiles}`);
      R.ok(`${name} × ${mode}`, !errs.length, errs.join(' / ') || `描き方 ${JSON.stringify(u.files.map(f => f.mode))}${u.msg ? ' 知らせ「' + u.msg + '」' : ''}`);
    }
    if (name.startsWith('S8') || name.startsWith('S9')) {
      // 項目を切り替える
      await setMode(p, 'field');
      await L.card(p, 'color');
      await p.click('#tabColorDetail');
      for (const fld of (await ui(p)).opts) {
        await p.selectOption('#fieldSel', fld); await p.waitForTimeout(500);
        const u2 = await ui(p);
        const sumCat = await p.evaluate(() => { const S = window.__pcd.S; const vals = S.files.map(f => f.stats[S.field]).filter(Boolean); return vals.length > 0 && vals.every(s => s.categorical); });
        const e = expectFor('field', u2.files, fld, sumCat);
        R.ok(`${name} 項目 ${fld}`, u2.field === fld && JSON.stringify(u2.files.map(f => f.mode)) === JSON.stringify(e.per) && u2.rangeBox === !sumCat, `描き方 ${JSON.stringify(u2.files.map(f => f.mode))} 範囲の行 ${u2.rangeBox} 凡例 ${u2.legendCats.slice(0, 4)}`);
      }
      await p.click('#tabColorBasic');
    }
  }
  // ---- パレット・塗り方・間隔・自動調整 ----
  await L.closeAll(p);
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  await setMode(p, 'height');
  await p.click('#tabColorDetail');
  for (const cm of ['rainbow', 'viridis', 'gray', 'turbo']) {
    const before = await p.evaluate(() => document.querySelector('#legend .bar').style.background);
    await p.click(`.cmaps [data-val="${cm}"]`); await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({ cmap: window.__pcd.S.cmap, sel: [...document.querySelectorAll('.cmaps [data-val]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.val), bar: document.querySelector('#legend .bar').style.background }));
    R.ok(`P1 配色 ${cm}`, r.cmap === cm && r.sel.join() === cm && r.bar !== before, r.sel);
  }
  for (const [val, name] of [['0', 'なめらか'], ['2', 'しま'], ['1', 'くっきり']]) {
    await p.click(`.segc [data-for="mapMode"][data-val="${val}"]`); await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({ band: !document.getElementById('rowBand').hidden, ticks: [...document.querySelectorAll('#legend .ticks span')].map(s => s.textContent) }));
    R.ok(`P2 塗り方 ${name}: 間隔の行は「しま」のときだけ`, r.band === (val === '2'), r);
  }
  await p.click(`.segc [data-for="mapMode"][data-val="2"]`);
  await p.evaluate(() => { const b = document.getElementById('bandSel'); b.value = '1.25'; b.dispatchEvent(new Event('input', { bubbles: true })); });
  const band = await p.evaluate(() => ({ t: document.getElementById('bandVal').textContent, ticks: [...document.querySelectorAll('#legend .ticks span')].map(s => s.textContent) }));
  R.ok('P3 間隔 1.25 m → 表示と凡例', band.t === '1.25 m' && band.ticks.join('|').includes('1.25 m ごと'), band);
  // 範囲を動かしてから自動調整で戻る
  const r0 = await p.evaluate(() => document.querySelector('#colorRange .dval').textContent);
  await p.evaluate(() => { const i = document.querySelectorAll('#colorRange input'); i[0].value = 300; i[0].dispatchEvent(new Event('input')); });
  const r1 = await p.evaluate(() => document.querySelector('#colorRange .dval').textContent);
  await p.click('#btnAutoRange'); await p.waitForTimeout(300);
  const r2 = await p.evaluate(() => document.querySelector('#colorRange .dval').textContent);
  R.ok('P4 範囲を動かす → 自動調整で元に戻る', r1 !== r0 && r2 === r0, [r0, r1, r2]);
  await p.click(`.segc [data-for="mapMode"][data-val="1"]`);
  await p.click('#tabColorBasic');
  // ---- 点の大きさ ----
  await L.card(p, 'display');
  const size = async () => p.evaluate(() => { const e = document.getElementById('pointSize'); return { min: e.min, max: e.max, step: e.step, v: e.value, t: document.getElementById('pointSizeVal').textContent }; });
  await p.evaluate(() => { const e = document.getElementById('pointSize'); e.value = '5'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  let s1 = await size();
  await p.selectOption('#sizeMode', 'm'); let s2 = await size();
  await p.evaluate(() => { const e = document.getElementById('pointSize'); e.value = '10'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  let s3 = await size();
  await p.selectOption('#sizeMode', 'px'); let s4 = await size();
  await p.selectOption('#sizeMode', 'm'); let s5 = await size();
  R.ok('Z1 点の大きさ: px と m を行き来しても、それぞれの値が残る', s1.t === '5 px' && s2.t === '4 cm' && s2.max === '30' && s3.t === '10 cm' && s4.t === '5 px' && s4.max === '12' && s5.t === '10 cm', [s1, s2, s3, s4, s5].map(x => x.t + ' ' + x.min + '-' + x.max));
  await p.selectOption('#sizeMode', 'px');
  await p.evaluate(() => { const e = document.getElementById('pointSize'); e.value = '2'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  // ---- 分類の凡例と描いた色（値が飛んでいるとき） ----
  for (const f of ['cat_dense.pcd', 'cat_sparse.pcd']) {
    await L.closeAll(p);
    await L.open(p, [`${D}/${f}`]);
    await setMode(p, 'field');
    await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(700);
    const leg = await p.evaluate(() => [...document.querySelectorAll('#legend .cats span')].map(s => ({ t: s.textContent, c: s.querySelector('i').style.background })));
    const res = [];
    for (const [cx, lab] of [[0, 0], [6, 1], [12, 100], [18, 150]]) {
      const lv = { cat_dense: [0, 1, 2, 3], cat_sparse: [0, 1, 100, 150] }[f.replace('.pcd', '')][[0, 6, 12, 18].indexOf(cx)];
      const sc = await L.screenOf(p, [cx + 2, 2, 0]);
      const px = await L.pixelAt(p, sc.x, sc.y);
      const l = leg.find(x => x.t === `label = ${lv}`);
      const lc = l ? l.c.match(/\d+/g).map(Number) : null;
      res.push({ label: lv, pixel: px, legend: lc, same: !!lc && px.every((v, k) => Math.abs(v - lc[k]) <= 3) });
    }
    await L.shot(p, `t04_${f.replace('.pcd', '')}`);
    R.ok(`C1 ${f}: 分類の凡例の色と、画面に描かれた色が一致する`, res.every(r => r.same), res);
    const distinct = new Set(res.map(r => r.pixel.join(','))).size;
    R.ok(`C2 ${f}: 4 つの分類が 4 つの別の色で描かれる`, distinct === 4, res.map(r => r.pixel.join(',')));
  }
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
