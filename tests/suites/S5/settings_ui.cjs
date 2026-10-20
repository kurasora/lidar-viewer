// S5: 設定のカード・アプリらしい見た目（案 1）・タブの下線・歯車・ファイルを選ぶ画面の修正 の影響範囲の試験
// 使い方（Linux・Xvfb の :99 を使う）:
//   node build.mjs && DISPLAY=:99 node tests/suites/S5/settings_ui.cjs <作業フォルダ>
// 結果は 1 行ずつ OK / NG と、最後に数を出す。写真は <作業フォルダ>/shots/
const { _electron } = require(process.env.PW || '/opt/npm-tools/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '../../..');
const W = path.resolve(process.argv[2] || '/tmp/s5'); fs.mkdirSync(path.join(W, 'shots'), { recursive: true });
const UD = path.join(W, 'ud'); fs.rmSync(UD, { recursive: true, force: true });
const res = []; const ok = (name, cond, info = '') => { res.push([!!cond, name]); console.log(`${cond ? 'OK' : 'NG'}  ${name}${info ? '  … ' + info : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function launch(extra = {}) {
  const app = await _electron.launch({ executablePath: require(path.join(ROOT, 'node_modules/electron')), args: [ROOT, '--no-sandbox', '--user-data-dir=' + UD],
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', ...extra } });
  const w = await app.firstWindow();
  const errs = []; w.on('pageerror', e => errs.push(e.message)); w.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await w.waitForFunction(() => window.__pcd, null, { timeout: 20000 }); await wait(800);
  return { app, w, errs };
}
const $v = (w, js, arg) => w.evaluate(js, arg);
const openFile = async (w, f) => { const n = await $v(w, () => window.__pcd.S.files.length); await w.setInputFiles('#fileInput', path.join(ROOT, f)); await w.waitForFunction(k => window.__pcd.S.files.length > k && !document.querySelector('#progress:not([hidden])'), n, { timeout: 60000 }); await wait(800); };
const openCard = async (w, name) => { if (await $v(w, n => document.querySelector('#pop').dataset.name !== n, name)) await w.click(`button[data-open=${name}]`); await wait(150); };
const tab = async (w, id) => { await openCard(w, 'settings'); await w.click('#' + id); await wait(100); };
// 画面の中で点群の点に当たる場所を探す（pickAt で確かめる）
async function findPoint(w, skip = []) {
  const box = await w.evaluate(() => { const r = window.__pcd.renderer.domElement.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  for (let gy = 0.35; gy <= 0.75; gy += 0.05) for (let gx = 0.35; gx <= 0.8; gx += 0.03) {
    const x = Math.round(box.x + box.w * gx), y = Math.round(box.y + box.h * gy);
    if (skip.some(p => Math.hypot(p.x - x, p.y - y) < 60)) continue;
    if (await w.evaluate(([x, y]) => window.__pcd.pickAt(x, y, true).then(h => !!h), [x, y])) return { x, y };
  }
  return null;
}
const camDir = w => w.evaluate(() => { const c = window.__pcd.cam.position.toArray(), t = window.__pcd.controlsTarget(); const d = c.map((v, i) => v - t[i]); const n = Math.hypot(...d); return d.map(v => v / n); });
const camDist = w => w.evaluate(() => { const c = window.__pcd.cam.position.toArray(), t = window.__pcd.controlsTarget(); return Math.hypot(...c.map((v, i) => v - t[i])); });

(async () => {
  // ================= 1 回目の起動: 既定の値・カードの形
  let { app, w, errs } = await launch();
  await w.setViewportSize({ width: 1280, height: 820 }).catch(() => {});
  const dock = await $v(w, () => [...document.querySelectorAll('#dock > *')].map(e => e.tagName === 'SPAN' ? '|' : (e.dataset.open || e.dataset.tool)));
  ok('ドックの一番右が設定で、前に区切りがある', dock[dock.length - 1] === 'settings' && dock[dock.length - 2] === '|', dock.join(' '));
  ok('設定のボタンの絵は歯車（歯の形の線と丸）', await $v(w, () => { const s = document.querySelector('[data-open=settings] svg'); return !!s && s.querySelectorAll('path').length === 1 && s.querySelectorAll('circle').length === 1 && s.querySelector('path').getAttribute('d').split('L').length >= 32; }));
  await openCard(w, 'settings');
  ok('設定のカードの見出しは「設定」', (await $v(w, () => document.getElementById('popTitle').textContent)) === '設定');
  for (const [t, p] of [['setTabLook', 'setLook'], ['setTabPerf', 'setPerf'], ['setTabCtrl', 'setCtrl'], ['setTabEtc', 'setEtc']]) {
    await w.click('#' + t); await wait(80);
    const st = await $v(w, ([t, p]) => ({ sel: document.getElementById(t).getAttribute('aria-selected'), vis: ['setLook', 'setPerf', 'setCtrl', 'setEtc'].filter(x => !document.getElementById(x).hidden), shadow: getComputedStyle(document.getElementById(t)).boxShadow }), [t, p]);
    ok(`タブ ${t}: 選ばれ、その中身だけが出る`, st.sel === 'true' && st.vis.length === 1 && st.vis[0] === p, JSON.stringify(st.vis));
    ok(`タブ ${t}: 選ばれたタブの下に青い線がない`, st.shadow === 'none', st.shadow);
  }
  // 他のカードのタブも下線なし
  await openCard(w, 'section');
  ok('断面のタブにも下線がない', (await $v(w, () => getComputedStyle(document.querySelector('.secui .tabs [aria-selected=true]')).boxShadow)) === 'none');
  await openCard(w, 'color');
  ok('色のタブにも下線がない', (await $v(w, () => { const b = document.querySelector('[data-pop=color] .ctabs [aria-selected=true]'); return b ? getComputedStyle(b).boxShadow : 'none'; })) === 'none');
  // 1 枚だけ
  await openCard(w, 'settings');
  ok('設定を開くと前のカード（色）は閉じ、ボタンも解除', await $v(w, () => document.querySelector('#pop').dataset.name === 'settings' && !document.querySelector('[data-open=color]').classList.contains('open') && document.querySelector('[data-open=settings]').classList.contains('open')));
  await openCard(w, 'view');
  ok('表示を開くと設定は閉じる', await $v(w, () => document.querySelector('#pop').dataset.name === 'view' && !document.querySelector('[data-open=settings]').classList.contains('open')));
  // 移した項目
  const viewText = await $v(w, () => document.querySelector('[data-pop=view]').innerText);
  ok('表示のカードから点の大きさ・背景・最大点数などが消えた', !/点の大きさ|背景の明るさ|読み込む最大点数|操作中の点数|座標軸を表示|基本|詳細/.test(viewText), viewText.replace(/\s+/g, ' '));
  ok('表示のカードに「軌跡を表示」は残る', /軌跡を表示/.test(viewText));
  await openCard(w, 'level');
  ok('補正のカードから自動補正のチェックが消えた', !(await $v(w, () => document.querySelector('[data-pop=level]').contains(document.getElementById('autoLevel')))));
  ok('自動補正のチェックは設定の「操作」にある', await $v(w, () => document.getElementById('setCtrl').contains(document.getElementById('autoLevel'))));
  const ids = ['pointSize', 'sizeMode', 'bgLight', 'showAxes', 'showPivot', 'showArrows', 'capSel', 'lodSel', 'swapMouse', 'wheelRev', 'zoomSpeed', 'startView', 'autoLevel', 'unitSel', 'digitSel', 'langSel', 'btnResetSettings'];
  ok('設定の部品が全部、設定のカードの中にある（ID が 1 つずつ）', await $v(w, ids => ids.every(i => document.querySelectorAll('#' + i).length === 1 && document.querySelector('[data-pop=settings]').contains(document.getElementById(i))), ids));
  ok('既定値: m・3 桁・斜め・自動補正 入・入れ替えなし・暗い', await $v(w, () => [document.getElementById('unitSel').value, document.getElementById('digitSel').value, document.getElementById('startView').value, document.getElementById('autoLevel').checked, document.getElementById('swapMouse').checked, document.documentElement.dataset.ui].join() === 'm,3,iso,true,false,dark'));
  ok('言語の English は選べない（準備中）', await $v(w, () => document.querySelector('#langSel option[value=en]').disabled));
  ok('アプリの情報: version と部品の一覧', await $v(w, () => document.getElementById('appVersion').textContent === '0.4.2' && document.querySelectorAll('#licList li').length >= 8 && /three/.test(document.getElementById('licList').textContent)));
  // スイッチ
  await tab(w, 'setTabLook');
  const sw = await $v(w, () => { const c = document.getElementById('showAxes'), s = getComputedStyle(c), l = c.closest('label'); return { app: s.appearance, w: s.width, h: s.height, dir: getComputedStyle(l).flexDirection, right: c.getBoundingClientRect().right > l.getBoundingClientRect().right - 20 }; });
  ok('チェックはスイッチの形（38×22、右端）', sw.app === 'none' && sw.w === '38px' && sw.h === '22px' && sw.right, JSON.stringify(sw));
  await w.screenshot({ path: path.join(W, 'shots/01_settings_look.png') });
  // キーボード: Tab でスイッチまで行き、Space で切り替え、フォーカスの輪が見える
  await w.focus('#bgLight'); await w.keyboard.press('Tab');
  const foc = await $v(w, () => ({ id: document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineStyle }));
  ok('Tab で次のスイッチ（座標軸）へ進み、フォーカスの輪が出る', foc.id === 'showAxes' && foc.outline !== 'none', JSON.stringify(foc));
  await w.keyboard.press('Space');
  ok('Space でスイッチが切れる', !(await $v(w, () => document.getElementById('showAxes').checked)));
  await w.keyboard.press('Space');
  // ================= 点群を開いて、表示に効くか
  await openFile(w, 'sample/formats/cc_cloud.csv');
  ok('点群を開ける（ファイルの入力から）', (await $v(w, () => window.__pcd.S.files.length)) === 1);
  ok('開いたときの視点は斜め（既定）', (await camDir(w))[2] > 0.3 && (await camDir(w))[2] < 0.95, JSON.stringify(await camDir(w)));
  await tab(w, 'setTabLook');
  await w.$eval('#pointSize', e => { e.value = 5; e.dispatchEvent(new Event('input', { bubbles: true })); });
  ok('点の大きさを 5 にすると表示が 5 px', (await $v(w, () => document.getElementById('pointSizeVal').textContent)) === '5 px');
  const sc0 = await $v(w, () => getComputedStyle(document.documentElement).getPropertyValue('--scene'));
  await w.$eval('#bgLight', e => { e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); });
  ok('背景の明るさを変えると背景の色が変わる', sc0 !== await $v(w, () => getComputedStyle(document.documentElement).getPropertyValue('--scene')));
  await w.click('label:has(#showAxes)');
  ok('座標軸のスイッチで座標軸が消える', !(await $v(w, () => window.__pcd.world.parent.children.some(o => o.type === 'AxesHelper' && o.visible))));
  await w.click('label:has(#showAxes)');
  // ================= 単位・桁数（座標・距離）
  await w.click('button[data-tool=info]'); await wait(200);
  const p1 = await findPoint(w);
  ok('点群の上に押せる場所がある', !!p1);
  await w.mouse.click(p1.x, p1.y); await wait(600);
  const pinM = await $v(w, () => [...document.querySelectorAll('#pinTable tbody td')].slice(1, 4).map(t => t.textContent));
  ok('座標は m・3 桁', pinM.every(s => /^-?\d+\.\d{3}$/.test(s)) && /単位 m /.test(await $v(w, () => document.getElementById('pinUnit').textContent)), pinM.join(' '));
  await tab(w, 'setTabCtrl'); await w.selectOption('#unitSel', 'mm'); await w.selectOption('#digitSel', '1');
  const pinMM = await $v(w, () => [...document.querySelectorAll('#pinTable tbody td')].slice(1, 4).map(t => t.textContent));
  ok('mm・1 桁にすると座標の表が変わる（値は 1000 倍）', pinMM.every(s => /^-?\d+\.\d$/.test(s)) && Math.abs(+pinMM[0] - +pinM[0] * 1000) <= 0.6, pinMM.join(' '));
  ok('座標の吹き出しも mm', await $v(w, () => /mm/.test(document.querySelector('.pcall .pc-xyz').textContent)));
  ok('座標のカードの単位の表示も mm', /単位 mm/.test(await $v(w, () => document.getElementById('pinUnit').textContent)));
  // 距離
  await w.click('button[data-tool=measure]'); await wait(200);
  const q1 = await findPoint(w), q2 = await findPoint(w, [q1]);
  await w.mouse.click(q1.x, q1.y); await wait(300);
  // 測っている途中の数字（#mLive）は 0.4.1 から呼ばれていない（updateLive を呼ぶ所がない）ので試さない
  await w.mouse.click(q2.x, q2.y); await wait(500);
  const mrow = await $v(w, () => [...document.querySelectorAll('#measureTable tbody td')].slice(1, 4).map(t => t.textContent));
  ok('距離の表は mm・1 桁', mrow.every(s => /^[+-]?\d+\.\d$/.test(s)), mrow.join(' '));
  ok('距離の吹き出しも mm', await $v(w, () => /mm/.test(document.querySelector('.mc-len').textContent)));
  ok('距離のカードの単位の表示も mm', (await $v(w, () => document.getElementById('measUnit').textContent)) === '単位 mm');
  // 画像に描く文字
  const shotTexts = await $v(w, () => { const got = []; const f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { got.push(String(t)); return f.call(this, t, ...a); }; try { window.__pcd.shotCanvas(); } finally { CanvasRenderingContext2D.prototype.fillText = f; } return got; });
  ok('画像に描く距離の文字も mm', shotTexts.some(t => / mm  #1/.test(t)), shotTexts.filter(t => /#1|mm/.test(t)).join(' / '));
  await tab(w, 'setTabCtrl'); await w.selectOption('#unitSel', 'cm'); await w.selectOption('#digitSel', '2');
  ok('cm・2 桁に変えると距離の表もすぐ変わる', (await $v(w, () => [...document.querySelectorAll('#measureTable tbody td')].slice(1, 2).map(t => t.textContent)[0])).match(/^\d+\.\d{2}$/));
  await w.click('button[data-tool=measure]'); await w.click('button[data-tool=info]').catch(() => {}); await wait(100);
  if (await $v(w, () => window.__pcd.S.tools && window.__pcd.S.tools.info)) await w.click('button[data-tool=info]');
  await w.screenshot({ path: path.join(W, 'shots/02_units_mm_cm.png') });
  // ================= マウス
  const canvasC = await $v(w, () => { const r = window.__pcd.renderer.domElement.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const drag = async (button) => { const d0 = await camDir(w), t0 = await $v(w, () => window.__pcd.controlsTarget()); await w.mouse.move(canvasC.x + 150, canvasC.y - 150); await w.mouse.down({ button }); for (let i = 1; i <= 8; i++) await w.mouse.move(canvasC.x + 150 + i * 12, canvasC.y - 150 + i * 4); await w.mouse.up({ button }); await wait(300); const d1 = await camDir(w), t1 = await $v(w, () => window.__pcd.controlsTarget()); return { rot: Math.hypot(...d0.map((v, i) => v - d1[i])), pan: Math.hypot(...t0.map((v, i) => v - t1[i])) }; };
  let a = await drag('left'), b = await drag('right');
  ok('入れ替えなし: 左ドラッグで回り、右ドラッグで平行に動く', a.rot > 0.05 && a.pan < 1e-6 && b.pan > 1e-4 && b.rot < 1e-3, JSON.stringify({ a, b }));
  await tab(w, 'setTabCtrl'); await w.click('label:has(#swapMouse)');
  a = await drag('left'); b = await drag('right');
  ok('入れ替え: 左ドラッグで平行に動き、右ドラッグで回る', a.pan > 1e-4 && a.rot < 1e-3 && b.rot > 0.05, JSON.stringify({ a, b }));
  ok('案内の文も入れ替わる', /左ドラッグ: 平行に動かす/.test(await $v(w, () => document.getElementById('navHint').textContent)));
  await w.click('label:has(#swapMouse)');
  const wheel = async () => { const d0 = await camDist(w); await w.mouse.move(canvasC.x + 200, canvasC.y - 120); await w.mouse.wheel(0, -200); await wait(400); return (await camDist(w)) / d0; };
  const rNorm = await wheel();
  ok('ホイールを奥へ回すと近づく', rNorm < 0.99, rNorm.toFixed(3));
  await w.click('label:has(#wheelRev)');
  const rRev = await wheel();
  ok('「逆にする」で同じ回し方なら離れる', rRev > 1.01, rRev.toFixed(3));
  await w.click('label:has(#wheelRev)');
  await w.$eval('#zoomSpeed', e => { e.value = 5; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const rFast = await wheel();
  await w.$eval('#zoomSpeed', e => { e.value = 1; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const rSlow = await wheel();
  ok('近づく速さ 5 は 1 より大きく近づく', rFast < rSlow && rSlow < 1, `${rFast.toFixed(3)} < ${rSlow.toFixed(3)}`);
  ok('近づく速さの数字が出る', (await $v(w, () => document.getElementById('zoomSpeedVal').textContent)) === '1');
  // ================= 開いたときの視点・自動補正（傾いたサンプル）
  await w.selectOption('#startView', 'top');
  await w.click('label:has(#autoLevel)'); // 切る
  await $v(w, () => document.getElementById('btnCloseAll').click()); await wait(500);
  await openFile(w, 'sample/map.laz');
  await wait(1200);
  const dTop = await camDir(w);
  ok('「上」にすると、開いたとき真上から見る', dTop[2] > 0.99, JSON.stringify(dTop.map(v => +v.toFixed(3))));
  ok('自動補正を切ると、開いても補正しない', !(await $v(w, () => window.__pcd.S.levelInfo)));
  await $v(w, () => document.getElementById('btnCloseAll').click()); await wait(500);
  await tab(w, 'setTabCtrl'); await w.selectOption('#startView', 'front'); await w.click('label:has(#autoLevel)'); // 入れる
  await openFile(w, 'sample/map.laz'); await wait(2500);
  const dFr = await camDir(w);
  ok('自動補正 入: 開くと補正する', !!(await $v(w, () => window.__pcd.S.levelInfo)));
  ok('自動補正のあとも「正面」の視点', Math.abs(dFr[0]) > 0.99, JSON.stringify(dFr.map(v => +v.toFixed(3))));
  // ================= 画面の色（明るい）
  await tab(w, 'setTabLook'); await w.click('[data-uitheme=light]'); await wait(300);
  const lt = await $v(w, () => ({ ui: document.documentElement.dataset.ui, panel: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim(), fg: getComputedStyle(document.body).color, pressed: document.querySelector('[data-uitheme=light]').getAttribute('aria-checked'), scene: getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() }));
  ok('明るい: カードの色が明るくなり、ボタンも選ばれる', lt.ui === 'light' && lt.panel === '#f7f9fb' && lt.pressed === 'true', JSON.stringify(lt));
  ok('明るい: 点群の背景は変わらない', lt.scene === (await $v(w, () => getComputedStyle(document.documentElement).getPropertyValue('--scene').trim())));
  for (const c of ['view', 'color', 'section', 'level', 'open', 'settings']) { await openCard(w, c); await wait(120); await w.screenshot({ path: path.join(W, `shots/10_light_${c}.png`), clip: { x: 0, y: 0, width: 380, height: 700 } }); }
  // 文字の読みやすさ（カードの上の主な文字と背景の明るさの差）
  const contrast = await $v(w, () => {
    const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const bg = lum(getComputedStyle(document.documentElement).getPropertyValue('--panel').trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)})`));
    const out = {};
    for (const [k, sel] of [['見出し', '#popTitle'], ['薄い文字', '.pop .hint'], ['名前', '.pop .row label']]) { const e = document.querySelector(sel); if (!e) continue; const l = lum(getComputedStyle(e).color); out[k] = +(((Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05)).toFixed(2)); }
    return out;
  });
  ok('明るい: 文字の明暗の差が 4.5 以上', Object.values(contrast).every(v => v >= 4.5), JSON.stringify(contrast));
  // ================= 保存して、起動し直す
  await tab(w, 'setTabPerf'); await w.selectOption('#capSel', '100000000'); await w.selectOption('#lodSel', '4000000');
  const before = await $v(w, () => localStorage.getItem('pcdviewer.settings'));
  ok('アプリの中に設定を覚える', !!before && /"unit":"cm"/.test(before) && /"uiTheme":"light"/.test(before), before);
  ok('途中でエラーが出ない（1 回目）', errs.length === 0, errs.slice(0, 3).join(' | '));
  await app.close();

  ({ app, w, errs } = await launch());
  const after = await $v(w, () => ({ unit: document.getElementById('unitSel').value, dig: document.getElementById('digitSel').value, view: document.getElementById('startView').value, auto: document.getElementById('autoLevel').checked, ui: document.documentElement.dataset.ui, size: document.getElementById('pointSizeVal').textContent, bg: document.getElementById('bgLight').value, cap: document.getElementById('capSel').value, lod: document.getElementById('lodSel').value, zs: document.getElementById('zoomSpeed').value }));
  ok('起動し直しても設定が残る', after.unit === 'cm' && after.dig === '2' && after.view === 'front' && after.auto && after.ui === 'light' && after.size === '5 px' && after.bg === '40' && after.cap === '100000000' && after.lod === '4000000' && after.zs === '1', JSON.stringify(after));
  // 初めの状態に戻す
  await tab(w, 'setTabEtc'); await w.click('#btnResetSettings'); await wait(300);
  const rs = await $v(w, () => ({ unit: document.getElementById('unitSel').value, dig: document.getElementById('digitSel').value, view: document.getElementById('startView').value, ui: document.documentElement.dataset.ui, size: document.getElementById('pointSizeVal').textContent, bg: document.getElementById('bgLight').value, cap: document.getElementById('capSel').value, lod: document.getElementById('lodSel').value, zs: document.getElementById('zoomSpeed').value, sw: document.getElementById('swapMouse').checked, wr: document.getElementById('wheelRev').checked, st: document.getElementById('status') ? document.getElementById('status').textContent : '' }));
  ok('「初めの状態に戻す」で全部戻る', rs.unit === 'm' && rs.dig === '3' && rs.view === 'iso' && rs.ui === 'dark' && rs.size === '2 px' && rs.bg === '14' && rs.cap === '30000000' && rs.lod === '1500000' && rs.zs === '3' && !rs.sw && !rs.wr, JSON.stringify(rs));
  ok('途中でエラーが出ない（2 回目）', errs.length === 0, errs.slice(0, 3).join(' | '));
  // 壊れた設定・あり得ない値
  await $v(w, () => localStorage.setItem('pcdviewer.settings', '{"unit":"km","digits":"9","zoomSpeed":"fast","uiTheme":"neon","lang":"en","lod":"7",')); await app.close();
  ({ app, w, errs } = await launch());
  const bad = await $v(w, () => [document.getElementById('unitSel').value, document.getElementById('digitSel').value, document.getElementById('zoomSpeed').value, document.documentElement.dataset.ui, document.getElementById('langSel').value, document.getElementById('lodSel').value].join());
  ok('壊れた設定でも既定の値で起動する', bad === 'm,3,3,dark,ja,1500000' && errs.length === 0, bad + ' ' + errs.join('|'));
  await $v(w, () => localStorage.setItem('pcdviewer.settings', JSON.stringify({ unit: 'km', digits: '9', zoomSpeed: 99, sizePx: -3, uiTheme: 'neon', lang: 'en', lod: '7', startView: 'under' }))); await app.close();
  ({ app, w, errs } = await launch());
  const bad2 = await $v(w, () => [document.getElementById('unitSel').value, document.getElementById('digitSel').value, document.getElementById('zoomSpeed').value + '/' + document.getElementById('zoomSpeedVal').textContent, document.documentElement.dataset.ui, document.getElementById('langSel').value, document.getElementById('lodSel').value, document.getElementById('startView').value].join());
  ok('あり得ない値は既定の値にする（English・km・9 桁など）', bad2 === 'm,3,5/5,dark,ja,1500000,iso' && errs.length === 0, bad2 + ' ' + errs.join('|'));
  // 狭い窓
  await w.setViewportSize({ width: 640, height: 560 }).catch(() => {});
  await openCard(w, 'settings'); await tab(w, 'setTabCtrl'); await wait(200);
  const nar = await $v(w, () => { const p = document.getElementById('pop').getBoundingClientRect(); const pane = document.getElementById('setCtrl'); return { right: p.right, vw: innerWidth, sx: pane.scrollWidth <= pane.clientWidth + 1, bottom: p.bottom, vh: innerHeight, dock: document.getElementById('dock').getBoundingClientRect().right <= innerWidth }; });
  ok('狭い窓でもカードとドックが画面に収まり、横にはみ出さない', nar.right <= nar.vw && nar.sx && nar.bottom <= nar.vh && nar.dock, JSON.stringify(nar));
  await w.screenshot({ path: path.join(W, 'shots/20_narrow.png') });
  await app.close();
  const n = res.filter(r => r[0]).length;
  console.log(`\n${n} / ${res.length} OK`);
  fs.writeFileSync(path.join(W, 'result.json'), JSON.stringify(res, null, 1));
})().catch(e => { console.log('NG  試験が途中で止まりました: ' + e.message); process.exit(1); });
