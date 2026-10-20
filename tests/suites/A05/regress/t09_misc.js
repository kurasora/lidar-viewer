// t09 点数の上限（保存・読み込み済みへの影響・次の読み込みに渡る値）、ドラッグ＆ドロップ、窓の大きさ、背景の明るさ、
//     操作中の点数、回転の中心の印・矢印のドラッグ、表示の選択肢、画像の保存
//   heavy node t09_misc.js
const L = require('./lib.js');
const D = L.DATA;

(async () => {
  const R = L.recorder('t09_misc');
  // 別スレッドへの 'load' の cap を記録する
  const init = () => {
    window.__loads = [];
    const orig = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (m, t) { if (m && m.type === 'load') window.__loads.push({ name: m.name, cap: m.cap }); return orig.call(this, m, t); };
  };
  let { b, ctx, p, errors, close } = await L.page({ init });
  // ---- 点数の上限 ----
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  const n0 = await p.evaluate(() => window.__pcd.S.files[0].n);
  await L.card(p, 'display');
  const opts = await p.$$eval('#capSel option', os => os.map(o => [o.value, o.textContent]));
  R.ok('K0 上限の選択肢に 10 億点（1000000000）がある', opts.some(o => o[0] === '1000000000' && o[1] === '10 億点'), opts);
  await p.selectOption('#capSel', '100000000'); await p.waitForTimeout(200);
  let st = await p.evaluate(() => ({ msg: document.getElementById('statMsg').textContent, ls: localStorage.getItem('pcdviewer.cap'), n: window.__pcd.S.files[0].n }));
  R.ok('K1 上限を変えると「次に開くファイルから反映されます」、保存され、開いているファイルはそのまま', st.msg === '次に開くファイルから反映されます' && st.ls === '100000000' && st.n === n0, st);
  await L.open(p, [`${D}/c_xyz.pcd`]);
  let loads = await p.evaluate(() => window.__loads);
  R.ok('K2 次に開いたファイルは新しい上限で読む', loads[loads.length - 1].cap === 100000000, loads);
  await p.selectOption('#capSel', '1000000000');
  await L.open(p, [`${D}/c_rgb.pcd`]);
  loads = await p.evaluate(() => window.__loads);
  R.ok('K3 10 億点を選ぶとその値で読む', loads[loads.length - 1].cap === 1000000000, loads[loads.length - 1]);
  await p.reload(); await p.waitForFunction(() => window.__pcd);
  const cap2 = await p.$eval('#capSel', s => s.value);
  R.ok('K4 ページを開き直しても上限が残る', cap2 === '1000000000', cap2);
  // 保存されている値が選択肢にないとき
  await p.evaluate(() => localStorage.setItem('pcdviewer.cap', '12345')); await p.reload(); await p.waitForFunction(() => window.__pcd);
  const cap3 = await p.$eval('#capSel', s => s.value);
  R.ok('K5 保存された値が選択肢にないときは既定（3,000 万点）', cap3 === '30000000', cap3);
  await p.evaluate(() => localStorage.removeItem('pcdviewer.cap'));
  // ---- 背景の明るさ（保存） ----
  await L.card(p, 'display');
  await p.evaluate(() => { const e = document.getElementById('bgLight'); e.value = '40'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.reload(); await p.waitForFunction(() => window.__pcd);
  const bg = await p.evaluate(() => ({ v: document.getElementById('bgLight').value, t: document.getElementById('bgLightVal').textContent, scene: getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() }));
  R.ok('B1 背景の明るさは開き直しても残る（表示は % : 40 → 80%）', bg.v === '40' && bg.t === '80%', bg);
  await p.evaluate(() => { const e = document.getElementById('bgLight'); e.value = '14'; e.dispatchEvent(new Event('input', { bubbles: true })); localStorage.removeItem('pcdviewer.bg'); });
  // ---- ドラッグ＆ドロップ ----
  const dragCls = async () => p.evaluate(() => document.getElementById('stage').classList.contains('drag'));
  await p.evaluate(() => { const st = document.getElementById('stage'); const dt = new DataTransfer(); st.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); document.getElementById('dock').dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); st.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt })); });
  const c1 = await dragCls();
  await p.evaluate(() => { const st = document.getElementById('stage'); const dt = new DataTransfer(); st.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt })); });
  const c2 = await dragCls();
  R.ok('D1 ドラッグが画面に入ると「ここに落として開く」、中の要素を出入りしても消えず、外に出ると消える', c1 && !c2, { c1, c2 });
  // 文字だけのドロップ（ファイルなし）
  const nb = await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'hello'); const st = document.getElementById('stage'); st.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }); st.dispatchEvent(ev); return { prevented: ev.defaultPrevented, drag: st.classList.contains('drag'), files: window.__pcd.S.files.length }; });
  R.ok('D2 ファイルのない（文字だけの）ドロップでは何も起きず、表示も消える', nb.prevented && !nb.drag && nb.files === 0, nb);
  await L.drop(p, [`${L.SF}/cc_cloud.sbf`, `${L.SF}/cc_cloud.sbf.data`, `${L.SF}/pyshp_points.shp`, `${L.SF}/pyshp_points.shx`, `${L.SF}/pyshp_points.dbf`]);
  st = await L.state(p);
  R.ok('D3 付属ファイルと一緒に落とす（.sbf + .sbf.data、.shp + .shx + .dbf）→ 2 つの点群', st.files.length === 2 && st.files.map(f => f.name).join() === 'cc_cloud.sbf,pyshp_points.shp', st.files.map(f => f.name + ' ' + f.n));
  await L.closeAll(p);
  // ---- 窓の大きさ ----
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  for (const [w, h] of [[900, 600], [1600, 900], [700, 500]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500);
    const r = await p.evaluate(() => { const c = window.__pcd.renderer.domElement; const cam = window.__pcd.cam; return { cw: c.width, ch: c.height, css: [c.clientWidth, c.clientHeight], aspect: cam.aspect }; });
    R.ok(`W1 窓 ${w}×${h} に合わせて描く大きさが変わる`, r.cw === w && r.ch === h && Math.abs(r.aspect - w / h) < 1e-6, r);
  }
  await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(400);
  // ---- 操作中の点数 ----
  await L.open(p, [`${D}/c_xyzi.pcd`, `${D}/c_rgb.pcd`, `${D}/c_xyz.pcd`]);
  await L.card(p, 'display'); await p.selectOption('#lodSel', '500000');
  await p.mouse.move(700, 450); await p.mouse.down(); await p.mouse.move(760, 470, { steps: 5 });
  const during = await p.textContent('#statPoints');
  await p.mouse.up(); await p.waitForTimeout(300);
  const after = await p.textContent('#statPoints');
  R.ok('L1 操作中の点数 50 万: 回している間だけ間引き、離すと全部', /（操作中は間引き）/.test(during) && !/間引き/.test(after), { during, after });
  await p.selectOption('#lodSel', '1500000');
  await L.closeAll(p);
  // ---- 回転の中心の印と矢印 ----
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(600);
  await p.keyboard.press('c'); // 天井を表示（A05-001 を避ける）
  const pv = await p.evaluate(() => { const r = document.getElementById('pivot').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const target0 = await p.evaluate(() => window.__pcd.controlsTarget());
  const dest = await L.screenOf(p, [22, 0.5, 2.6]);
  await p.mouse.move(pv.x, pv.y); await p.mouse.down(); await p.mouse.move(dest.x, dest.y, { steps: 10 }); await p.waitForTimeout(600); await p.mouse.move(dest.x + 1, dest.y, { steps: 1 }); await p.waitForTimeout(600); await p.mouse.up(); await p.waitForTimeout(900);
  const target1 = await p.evaluate(() => window.__pcd.controlsTarget());
  const m1 = (await L.msg(p)).text;
  R.ok('P1 中心の丸をつかんで点の上へ動かすと、回転の中心がその点に動く', Math.abs(target1[0] - 22) < 1 && /回転の中心を/.test(m1), { target0, target1, m1 });
  // X の矢印
  await p.evaluate(() => window.__pcd.setView('iso', false)); await p.waitForTimeout(700);
  const ax = await p.evaluate(() => { const g = document.querySelector('.handles g[data-axis="0"] .head'); if (!g || getComputedStyle(g.parentNode).display === 'none') return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (ax) {
    const t0 = await p.evaluate(() => window.__pcd.controlsTarget());
    await p.mouse.move(ax.x, ax.y); await p.mouse.down(); await p.mouse.move(ax.x + 60, ax.y + 25, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(900);
    const t1 = await p.evaluate(() => window.__pcd.controlsTarget());
    R.ok('P2 X の矢印をつかんで動かすと、中心は x だけ動く', Math.abs(t1[0] - t0[0]) > 0.2 && Math.abs(t1[1] - t0[1]) < 1e-6 && Math.abs(t1[2] - t0[2]) < 1e-6, { t0, t1 });
  } else R.ok('P2 X の矢印が出ている', false, 'なし');
  // 表示の選択肢
  await L.card(p, 'display');
  await p.click('#showPivot');
  // 描き直しが遅い（ソフトウェア描画）ので、消えるまで少し待つ
  await p.waitForFunction(() => document.getElementById('pivot').hidden, null, { timeout: 3000 }).catch(() => {});
  let vis = await p.evaluate(() => ({ checked: document.getElementById('showPivot').checked, pivot: !document.getElementById('pivot').hidden, handles: document.getElementById('handles').style.display !== 'none' }));
  R.ok('O1 「回転の中心の印を表示」を切ると丸と矢印が消える', !vis.pivot && !vis.handles, vis);
  await p.click('#showPivot');
  await L.card(p, 'display'); await p.click('#showArrows');
  await p.waitForFunction(() => document.getElementById('handles').style.display === 'none', null, { timeout: 3000 }).catch(() => {});
  vis = await p.evaluate(() => ({ pivot: !document.getElementById('pivot').hidden, handles: document.getElementById('handles').style.display !== 'none' }));
  R.ok('O2 「中心の軸の矢印を表示」を切ると矢印だけ消える', vis.pivot && !vis.handles, vis);
  await p.click('#showArrows');
  await L.card(p, 'display'); await p.click('#showAxes'); await p.waitForTimeout(600);
  const axesVis = await p.evaluate(() => window.__pcd.world.parent.children.find(o => o.type === 'AxesHelper').visible);
  R.ok('O3 「座標軸を表示」を切ると座標軸が消える', axesVis === false, axesVis);
  await p.click('#showAxes');
  // ---- 画像の保存 ----
  // 0.4.1 から: 「画像を保存」はファイルのカード。名前は lidar_年月日_時分秒.png、知らせは「保存先を選んでください」（保存したかは画面から分からないため）
  await L.card(p, 'open');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }).catch(() => null), p.click('#btnShot')]);
  const fn = dl ? dl.suggestedFilename() : null;
  R.ok('S1 「画像を保存」で PNG がダウンロードされる（名前 lidar_年月日_時分秒.png）', fn && /^lidar_\d{8}_\d{6}\.png$/.test(fn) && /^画像（lidar_\d{8}_\d{6}\.png）の保存先を選んでください$/.test((await L.msg(p)).text), { fn, msg: (await L.msg(p)).text });
  if (dl) { const f = L.SHOTS + '/t09_S1_saved.png'; await dl.saveAs(f); const sz = require('fs').statSync(f).size; R.ok('S1b 保存した画像が空でない', sz > 10000, sz); }
  await L.closeAll(p);
  await L.card(p, 'open');
  await p.click('#btnShot'); await p.waitForTimeout(200);
  R.ok('S2 点群がないときの「画像を保存」は知らせだけ', (await L.msg(p)).text === '保存する点群がありません');
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
