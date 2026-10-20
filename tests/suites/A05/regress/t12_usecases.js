// t12 ユースケース（通し）
//   UC1 FAST-LIO の地図（PCD）と軌跡を開いて、天井を隠し、上から見て、廊下の幅を測る（合成の廊下: 幅 2.0 m）
//   UC2 断面（水平）で廊下の幅を測る（CloudCompare と同じやり方）
//   UC3 前回の廊下の地図（scans.pcd、36 万点）と軌跡（trajectory.txt）を開いて、軌跡に沿って見る
//   UC4 LAS を 3 つ開いて色を変えて比べる（RGB・1 色・反射・分類・表示の切り替え・選択・閉じる）
//   heavy node t12_usecases.js
const L = require('./lib.js');
const D = L.DATA;

async function table(p) { return p.evaluate(() => [...document.querySelectorAll('#measureTable tbody tr')].map(tr => [...tr.querySelectorAll('td')].slice(1, 4).map(td => td.textContent.trim()))); }
async function pickedZ(p) { return p.evaluate(() => window.__pcd.S.measures.map(m => { const e = window.__pcd.world.matrixWorld.elements; const z = v => e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]; return [+z(m.a).toFixed(2), +z(m.b).toFixed(2)]; })); }

(async () => {
  const R = L.recorder('t12_usecases');
  const { p, errors, close } = await L.page();
  // ---- UC1 ----
  await L.card(p, 'open');
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  await L.openTraj(p, [`${D}/c_trajectory.txt`]);
  let st = await L.state(p);
  const s1 = await p.evaluate(() => ({ lvl: document.getElementById('levelResult').textContent, hide: window.__pcd.S.hideCeil, ceil: !!window.__pcd.S.ceil, ceilZ: window.__pcd.S.ceilZ }));
  R.ok('UC1-1 地図は自動で水平になり、天井は隠れている。軌跡も開いた', st.files.length === 1 && st.trajs.length === 1 && /傾き/.test(s1.lvl) && s1.hide && s1.ceil, s1);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('t'); await p.waitForTimeout(900);
  await p.keyboard.press('m');
  // 左右の壁（上から見ると線）を、x = 10 m の位置でクリック（Shift で水平）
  const wl = await L.screenOf(p, [10, 0.99, 1.3]), wr = await L.screenOf(p, [10, -0.99, 1.3]);
  await p.mouse.click(wl.x, wl.y); await p.waitForTimeout(900);
  await p.keyboard.down('Shift'); await p.mouse.click(wr.x, wr.y); await p.keyboard.up('Shift'); await p.waitForTimeout(900);
  let t = await table(p);
  R.ok('UC1-2 上から壁と壁をクリック（Shift）→ 廊下の幅 ≈ 2.0 m', t.length === 1 && Math.abs(+t[0][0] - 2.0) < 0.1 && t[0][0] === t[0][1] && /^\+?0\.000$/.test(t[0][2]), t); // 0.4.2: 桁数は設定（既定 3 桁）
  const z1 = await pickedZ(p);
  R.ok('UC1-3 選ばれた点は見えている点（隠した天井の点ではない）', z1.length && z1[0].every(z => z <= (s1.ceil ? s1.ceilZ + 0.01 : 9)), { 選ばれた点の高さ: z1 });
  await L.shot(p, 't12_UC1_corridor_width');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  // ---- UC2 断面で ----
  await L.card(p, 'section');
  await p.click('.axes3 [data-axis="2"]');
  await p.evaluate(() => { const e = document.getElementById('secPos'); e.value = '0.5'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.click('.chips [data-thick="0.20"]');
  await p.keyboard.press('t'); await p.waitForTimeout(900);
  await p.click('[data-tool="measure"]');
  await L.card(p, 'measure'); await p.click('#btnMeasureClear');
  const zc = await p.evaluate(() => { const v = document.getElementById('secPosVal').textContent; return +v.replace(/[^\d.-]/g, ''); });
  const a2 = await L.screenOf(p, [12, 0.99, zc]), b2 = await L.screenOf(p, [12, -0.99, zc]);
  await p.mouse.click(a2.x, a2.y); await p.waitForTimeout(900); await p.mouse.click(b2.x, b2.y); await p.waitForTimeout(900);
  t = await table(p);
  R.ok('UC2 水平の断面（20 cm）で壁と壁 → 幅 ≈ 2.0 m・高さの差 ≈ 0', t.length === 1 && Math.abs(+t[0][0] - 2.0) < 0.1 && Math.abs(+t[0][2]) < 0.2, { 断面の高さ: zc, 表: t });
  await L.shot(p, 't12_UC2_section_width');
  await p.click('[data-tool="measure"]');
  await L.card(p, 'section'); await p.click('.axes3 [data-axis="2"]');
  await L.closeAll(p);
  // ---- UC3 前回の地図＋軌跡 ----
  await L.open(p, [`${D}/scans.pcd`]);
  await L.openTraj(p, [`${D}/trajectory.txt`]);
  st = await L.state(p);
  const g = await p.evaluate(() => {
    // 軌跡は自分の入れ物（group）の行列で世界に置かれる（地図のシフトと別）。group.matrixWorld で世界の位置にする
    const S = window.__pcd.S, t = S.trajs[0], e = t.group.matrixWorld.elements;
    const W = i => [e[0] * t.P[3 * i] + e[4] * t.P[3 * i + 1] + e[8] * t.P[3 * i + 2] + e[12], e[1] * t.P[3 * i] + e[5] * t.P[3 * i + 1] + e[9] * t.P[3 * i + 2] + e[13], e[2] * t.P[3 * i] + e[6] * t.P[3 * i + 1] + e[10] * t.P[3 * i + 2] + e[14]];
    let inside = 0; for (let i = 0; i < t.count; i++) { const q = W(i); if (q.every((v, k) => v >= S.bounds.min[k] && v <= S.bounds.max[k])) inside++; }
    return { inside, count: t.count, len: t.length, lvl: document.getElementById('levelResult').textContent };
  });
  R.ok('UC3-1 前回の地図と軌跡: 軌跡は水平補正後の地図の中を通る', g.inside === g.count && /傾き/.test(g.lvl), g);
  await L.card(p, 'view');
  const tg = [];
  for (const v of ['0', '250', '500', '750', '1000']) {
    await p.evaluate(x => { const e = document.getElementById('trajPos'); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await p.waitForTimeout(150);
    tg.push(await p.evaluate(() => [window.__pcd.controlsTarget().map(v => +v.toFixed(1)), document.getElementById('trajPosVal').textContent]));
  }
  R.ok('UC3-2 軌跡に沿ってつまみを動かすと、中心が経路を進み、距離の表示が増える', new Set(tg.map(x => x[0].join())).size === 5 && tg[4][1] !== tg[0][1], tg);
  await p.keyboard.press('t'); await p.waitForTimeout(900);
  await L.shot(p, 't12_UC3_map_traj_top');
  await L.closeAll(p);
  // ---- UC4 LAS 3 つ ----
  await L.open(p, [`${D}/run_a.las`, `${D}/run_b.las`, `${D}/run_c.las`]);
  st = await L.state(p);
  R.ok('UC4-1 1 つ目が RGB を持つので RGB で表示、RGB のない 2 つは 1 色（知らせは出ない）', st.colorMode === 'rgb' && st.files.map(f => f.mode).join() === '4,3,3' && !/RGB の色を持つファイルがない/.test(st.msg), { modes: st.files.map(f => f.mode), msg: st.msg });
  await L.card(p, 'color');
  await p.click('#colorBasic [data-val="single"]'); await p.waitForTimeout(400);
  const leg = await p.evaluate(() => [...document.querySelectorAll('#legend .cats span')].map(s => [s.textContent, s.querySelector('i').style.background]));
  R.ok('UC4-2 1 色: 凡例に 3 つのファイル名と別々の色', leg.length === 3 && new Set(leg.map(x => x[1])).size === 3, leg);
  await p.click('#colorBasic [data-val="field"]'); await p.waitForTimeout(800);
  st = await L.state(p);
  R.ok('UC4-3 反射: 3 つとも強度で色分け', st.field === 'intensity' && st.files.every(f => f.mode === 1), { field: st.field, modes: st.files.map(f => f.mode) });
  await p.click('#tabColorDetail'); await p.selectOption('#fieldSel', 'classification'); await p.waitForTimeout(800);
  const cl = await p.evaluate(() => [...document.querySelectorAll('#legend .cats span')].map(s => s.textContent));
  R.ok('UC4-4 項目を classification に → 3 ファイルの分類の値（0・1・2・6）が凡例に出る', cl.join() === 'classification = 0,classification = 1,classification = 2,classification = 6', cl);
  await p.click('#tabColorBasic');
  await L.card(p, 'open');
  await p.click('#fileList li:nth-child(1) [data-act=vis]'); await p.click('#fileList li:nth-child(2) [data-act=vis]'); await p.waitForTimeout(300);
  const pts = await p.textContent('#statPoints');
  R.ok('UC4-5 2 つを隠すと 1 つだけ表示（表示 60,000 点 ／ 全 180,000 点）', /^表示\s60,000\s点(（[^）]*）)?\s／\s全\s180,000\s点$/.test(pts)  /* 数と「点」の間は改行しない空白（U+00A0）のことがある */, pts);
  await p.click('#fileList li:nth-child(1) [data-act=vis]'); await p.click('#fileList li:nth-child(2) [data-act=vis]');
  await p.click('#fileList li:nth-child(2) .name'); await p.waitForTimeout(300);
  const inf = await p.evaluate(() => document.getElementById('info').textContent);
  R.ok('UC4-6 2 つ目を選ぶと情報の欄が run_b.las になる', /run_b\.las/.test(inf) && /LAS/.test(inf), inf.slice(0, 120));
  await L.card(p, 'color'); await p.click('#colorBasic [data-val="rgb"]'); await p.waitForTimeout(400);
  await L.card(p, 'open');
  await p.evaluate(() => { document.getElementById('statMsg').textContent = ''; });
  await p.click('#fileList li:nth-child(1) [data-act=remove]'); await p.waitForTimeout(600);
  st = await L.state(p);
  R.ok('UC4-7 RGB 表示で RGB を持つ run_a を閉じる → 高さに戻り、的外れな知らせは出ない', st.colorMode === 'height' && st.msg === '' && st.files.length === 2, { mode: st.colorMode, msg: st.msg });
  await L.shot(p, 't12_UC4_las3');
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
