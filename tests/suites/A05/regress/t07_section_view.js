// t07 断面・切り出し（状態遷移）と視点（上・正面・横・全体・透視/平行、キー t f s a p）
//   heavy node t07_section_view.js
const L = require('./lib.js');
const D = L.DATA;

async function sec(p) {
  return p.evaluate(() => {
    const $ = id => document.getElementById(id), u = window.__pcd;
    const cm = window.__pcd.world.parent; // scene
    return {
      on: $('secOn').checked, axis: $('secAxis').value, thick: $('secThick').value, pos: $('secPos').value, posVal: $('secPosVal').textContent,
      checked: [...document.querySelectorAll('.axes3 [data-axis]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.axis),
      chips: [...document.querySelectorAll('.chips [data-thick]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.thick),
    };
  });
}
async function clip(p) {
  // シェーダーに渡している切り抜きの範囲（points の material の uniforms は共有）
  return p.evaluate(() => { const f = window.__pcd.S.files[0]; const u = f.mat.uniforms; return { min: u.uClipMin.value.toArray().map(v => +v.toFixed(3)), max: u.uClipMax.value.toArray().map(v => +v.toFixed(3)) }; });
}
async function camDir(p) {
  return p.evaluate(() => { const c = window.__pcd.cam, t = window.__pcd.controlsTarget(); const d = [c.position.x - t[0], c.position.y - t[1], c.position.z - t[2]]; const l = Math.hypot(...d); return { d: d.map(v => +(v / l).toFixed(3)), type: c.type, btn: document.getElementById('btnProj').textContent, mode: document.getElementById('statMode').textContent }; });
}
const dirOk = (a, b) => { const l = Math.hypot(...b); return a.every((v, k) => Math.abs(v - b[k] / l) < 0.02); };

(async () => {
  const R = L.recorder('t07_section_view');
  const { p, errors, close } = await L.page();
  // ---- 点群がないときの視点（何も起きず、エラーもない） ----
  for (const k of ['t', 'f', 's', 'a', 'p', 'p']) await p.keyboard.press(k);
  await L.card(p, 'view'); for (const v of ['top', 'front', 'side', 'fit']) await p.click(`[data-view="${v}"]`);
  R.ok('V0 点群がないときに視点のボタン・キーを押してもエラーにならない', !errors.length, errors);
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  // ---- 断面 ----
  await L.card(p, 'section');
  await p.click('.axes3 [data-axis="2"]'); await p.waitForTimeout(300);
  let s = await sec(p), c = await clip(p);
  R.ok('S1 「水平」を押すと断面が入り（選択表示）、z の範囲が厚さ 10 cm に絞られる', s.on && s.checked.join() === '2' && Math.abs((c.max[2] - c.min[2]) - 0.1) < 1e-3 && c.min[0] < -1e8, { s, c });
  await p.click('.axes3 [data-axis="2"]'); await p.waitForTimeout(300);
  s = await sec(p); c = await clip(p);
  R.ok('S2 もう一度押すと断面をやめる（範囲が元に戻る）', !s.on && !s.checked.length && c.min.every(v => v <= -1e8) && c.max.every(v => v >= 1e8), { s, c });
  await p.click('.axes3 [data-axis="0"]'); await p.waitForTimeout(300);
  s = await sec(p); c = await clip(p);
  R.ok('S3 「横断（x）」→ x の範囲が絞られる', s.on && s.checked.join() === '0' && Math.abs((c.max[0] - c.min[0]) - 0.1) < 1e-3 && c.min[2] < -1e8, c);
  await p.click('.axes3 [data-axis="1"]'); await p.waitForTimeout(300);
  s = await sec(p); c = await clip(p);
  R.ok('S4 続けて「縦断（y）」を押すと y に切り替わる（やめずに）', s.on && s.checked.join() === '1' && Math.abs((c.max[1] - c.min[1]) - 0.1) < 1e-3, c);
  await p.click('.chips [data-thick="0.50"]'); await p.waitForTimeout(300);
  s = await sec(p); c = await clip(p);
  R.ok('S5 厚さ 50 cm', s.thick === '0.50' && s.chips.join() === '0.50' && Math.abs((c.max[1] - c.min[1]) - 0.5) < 1e-3, s.chips);
  await p.click('.axes3 [data-axis="1"]'); // やめる
  await p.evaluate(() => { const e = document.getElementById('secPos'); e.value = '0.25'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(300);
  s = await sec(p); c = await clip(p);
  R.ok('S6 断面をやめた状態で位置のつまみを動かすと、断面が自動で入る', s.on && s.checked.join() === '1' && /^y = [-\d.]+ m$/.test(s.posVal), s);
  // 断面の外は選べない
  await p.evaluate(() => window.__pcd.setView('top', false)); await p.waitForTimeout(600);
  const out = await p.evaluate(async () => { const S = window.__pcd.S; const c = document.getElementById('stage').getBoundingClientRect(); return null; });
  // 断面（y の 1/4 あたり・厚さ 50 cm）の外にある点（y = +0.8）を狙う
  const sc = await L.screenOf(p, [15, 0.8, 0]);
  const hit = await p.evaluate(([x, y]) => window.__pcd.pickAt(x, y).then(h => h && h.world.toArray()), [sc.x, sc.y]);
  R.ok('S7 断面の外の点は選ばれない（断面の中の点か、なし）', !hit || (hit[1] >= c.min[1] - 0.05 && hit[1] <= c.max[1] + 0.05), { hit, range: [c.min[1], c.max[1]], msg: (await L.msg(p)).text });
  // 全体表示は断面の中に合わせる
  await p.keyboard.press('a'); await p.waitForTimeout(800);
  const t = await p.evaluate(() => window.__pcd.controlsTarget());
  R.ok('S8 断面を入れて「全体」→ 回転の中心が断面の中', t[1] >= c.min[1] - 0.3 && t[1] <= c.max[1] + 0.3, { t, range: [c.min[1], c.max[1]] });
  await L.card(p, 'section'); await p.click('.axes3 [data-axis="1"]');
  // ---- 切り出し ----
  await p.click('#tabClip');
  await p.evaluate(() => { const i = document.querySelectorAll('#clipZ input'); i[1].value = 500; i[1].dispatchEvent(new Event('input')); i[0].value = 100; i[0].dispatchEvent(new Event('input')); });
  c = await clip(p);
  R.ok('K1 切り出し（高さ z の上限と下限）がシェーダーの範囲に入る', c.min[2] > -1e8 && c.max[2] < 1e8 && c.min[0] < -1e8, c);
  const hist = await p.evaluate(() => { const cv = document.getElementById('hist'); return cv.width; });
  await p.click('#btnClipReset'); await p.waitForTimeout(200);
  c = await clip(p);
  R.ok('K2 「切り出しをやめる」で元に戻る', c.min.every(v => v <= -1e8) && c.max.every(v => v >= 1e8), c);
  // 下限を上限より上へ動かせない
  await p.evaluate(() => { const i = document.querySelectorAll('#clipX input'); i[1].value = 200; i[1].dispatchEvent(new Event('input')); i[0].value = 600; i[0].dispatchEvent(new Event('input')); });
  const xr = await p.evaluate(() => [...document.querySelectorAll('#clipX input')].map(i => +i.value));
  R.ok('K3 下限のつまみは上限を越えない', xr[0] <= xr[1], xr);
  await p.click('#btnClipReset');
  await p.click('#tabSec');
  // ---- 視点 ----
  const DIRS = { top: [0, -1e-4, 1], front: [-1, 0, 0], side: [0, -1, 0] };
  for (const [key, v] of [['t', 'top'], ['f', 'front'], ['s', 'side']]) {
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.keyboard.press(key); await p.waitForTimeout(900);
    const d = await camDir(p);
    R.ok(`V1 キー ${key} → ${v} の向き`, dirOk(d.d, DIRS[v]), d.d);
    await L.card(p, 'view'); await p.click(`[data-view="${v}"]`); await p.waitForTimeout(900);
    const d2 = await camDir(p);
    R.ok(`V2 ボタン ${v} → 同じ向き`, dirOk(d2.d, DIRS[v]), d2.d);
  }
  await p.click('[data-view="fit"]'); await p.waitForTimeout(900);
  const fit = await camDir(p);
  R.ok('V3 「全体」は向きを変えない（横のまま）', dirOk(fit.d, DIRS.side), fit.d);
  await p.click('#btnProj'); await p.waitForTimeout(300);
  let d = await camDir(p);
  R.ok('V4 透視 → 平行（ボタンの文字・右上の表示）', d.type === 'OrthographicCamera' && d.btn === '平行' && d.mode.startsWith('平行投影'), d);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('p'); await p.waitForTimeout(300);
  d = await camDir(p);
  R.ok('V5 p キーで透視に戻る', d.type === 'PerspectiveCamera' && d.btn === '透視' && d.mode.startsWith('透視投影'), d);
  // 平行投影で上から → 選んだ点が合っているか（平行でもクリックで選べる）
  await p.keyboard.press('p'); await p.keyboard.press('t'); await p.waitForTimeout(900);
  await p.click('[data-tool="info"]');
  const sc2 = await L.screenOf(p, [10, 0.5, 2.6]);
  await p.click('[data-open="view"]'); await p.click('#btnCeil'); await p.click('[data-open="view"]'); // 天井を表示
  await p.mouse.click(sc2.x, sc2.y); await p.waitForTimeout(900);
  const pk = await p.evaluate(() => { const S = window.__pcd.S, e = window.__pcd.world.matrixWorld.elements, v = S.pick; return v && [e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]].map(x => +x.toFixed(2)); });
  R.ok('V6 平行投影の上から天井の点 (10, 0.5) を選べる', pk && Math.abs(pk[0] - 10) < 0.3 && Math.abs(pk[1] - 0.5) < 0.3, pk);
  await p.click('[data-tool="info"]');
  // 動きの途中でマウスで回す → 動きが止まる
  await p.keyboard.press('p');
  await p.keyboard.press('f');
  await p.waitForTimeout(80);
  await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(700, 330, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(900);
  d = await camDir(p);
  R.ok('V7 視点が動いている途中にマウスで回すと、その場で止まる（正面に戻されない）', !dirOk(d.d, DIRS.front), d.d);
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
