// A05 の試験の共通部品（Chromium の dist/index.html と Electron のアプリ版）
//   const L = require('./lib.js'); const { p, close } = await L.page(); ...
const path = require('path');
const fs = require('fs');
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');

const T = '/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv';
const W = T + '/work/A05';
const DATA = W + '/data';
const SF = '/home/claude/pcd-viewer/sample/formats';
const SHOTS = process.env.SHOTS || (W + '/shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PAGE = process.env.PAGE || 'file:///home/claude/pcd-viewer/dist/index.html';
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'];

// 結果の記録: ok(名前, 条件, 詳細) を集めて最後に JSON で出す
function recorder(suite) {
  const res = [];
  const ok = (name, cond, detail) => { res.push({ name, ok: !!cond, detail }); console.log(`${cond ? 'OK  ' : 'NG  '} ${name}${detail !== undefined ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); return !!cond; };
  const done = () => {
    const ng = res.filter(r => !r.ok);
    console.log(`== ${suite}: ${res.length - ng.length}/${res.length} OK`);
    fs.mkdirSync(W + '/logs', { recursive: true });
    fs.writeFileSync(`${W}/logs/${suite}.json`, JSON.stringify(res, null, 1));
    return ng.length;
  };
  return { ok, done, res };
}

function attach(p, errors) {
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
}

async function page({ viewport = { width: 1280, height: 800 }, url = PAGE, init } = {}) {
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: GL });
  const ctx = await b.newContext({ viewport, acceptDownloads: true });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  const errors = [];
  attach(p, errors);
  await p.goto(url);
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.waitForTimeout(200);
  return { b, ctx, p, errors, close: () => b.close() };
}

async function electron({ userdata, files = [], env = {}, appdir = '/home/claude/pcd-viewer' } = {}) {
  const app = await pw._electron.launch({
    executablePath: '/home/claude/pcd-viewer/node_modules/electron/dist/electron',
    args: ['--no-sandbox', path.join(appdir, 'main.js')],
    env: { ...process.env, PCDV_USERDATA: userdata || (W + '/ud-default'), ...env },
  });
  const p = await app.firstWindow();
  const errors = [];
  attach(p, errors);
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.waitForTimeout(300);
  return { app, p, errors, close: () => app.close() };
}

// 読み込みが落ち着くまで待つ（進み具合の表示が消え、ファイル数・軌跡数・知らせが ms 変わらない）
async function idle(p, { stable = 900, limit = 120000 } = {}) {
  const t0 = Date.now(); let last = '', since = Date.now();
  await p.waitForTimeout(150);
  while (true) {
    const s = await p.evaluate(() => JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, window.__pcd.S.trajs.length, document.getElementById('statMsg').textContent, !!window.__pcd.S.levelInfo]));
    if (s !== last) { last = s; since = Date.now(); }
    if (JSON.parse(s)[0] && Date.now() - since > stable) return JSON.parse(s);
    if (Date.now() - t0 > limit) return { timedOut: true, s };
    await p.waitForTimeout(120);
  }
}

// 点群を開く（#fileInput、kind=cloud）
async function open(p, files, opt) { await p.setInputFiles('#fileInput', files.map(f => path.resolve(f))); return idle(p, opt); }
// 軌跡を開く（#trajInput、kind=traj）
async function openTraj(p, files, opt) { await p.setInputFiles('#trajInput', files.map(f => path.resolve(f))); return idle(p, opt); }
// ドラッグ＆ドロップ（DataTransfer に File を入れて window に落とす）
async function drop(p, files, opt) {
  const payload = files.map(f => ({ name: path.basename(f), b64: fs.readFileSync(f).toString('base64') }));
  await p.evaluate(list => {
    const dt = new DataTransfer();
    for (const { name, b64 } of list) { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); dt.items.add(new File([bin], name)); }
    const st = document.getElementById('stage');
    st.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    st.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    st.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
  return idle(p, opt);
}
async function closeAll(p) {
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); let y; while ((y = document.querySelector('#trajList [data-act=tremove]'))) y.click(); });
  await p.waitForTimeout(150);
}
async function msg(p) { return p.evaluate(() => { const el = document.getElementById('statMsg'); return { text: el.textContent, err: !!el.style.color }; }); }
async function shot(p, name, clip) { const f = path.join(SHOTS, name + '.png'); await p.screenshot({ path: f, ...(clip ? { clip } : {}) }); return f; }
// 画面の状態をまとめて取る
async function state(p) {
  return p.evaluate(() => {
    const S = window.__pcd.S, $ = id => document.getElementById(id);
    const pop = $('pop');
    return {
      top: pop.hidden ? null : pop.dataset.name, title: pop.hidden ? null : $('popTitle').textContent,
      tabs: [...document.querySelectorAll('.ptab')].map(t => ({ name: t.dataset.name, top: parseFloat(t.style.top), z: t.style.zIndex, rect: Math.round(t.getBoundingClientRect().top), enter: t.classList.contains('enter') })),
      popTop: parseFloat(pop.style.top), popRect: Math.round(pop.getBoundingClientRect().top),
      dockOpen: [...document.querySelectorAll('[data-open]')].filter(b => b.classList.contains('open')).map(b => b.dataset.open),
      dockExpanded: [...document.querySelectorAll('[data-open]')].filter(b => b.getAttribute('aria-expanded') === 'true').map(b => b.dataset.open),
      shown: [...pop.querySelectorAll('[data-pop].show')].map(e => e.dataset.pop),
      tools: { ...S.tools }, btnInfo: document.querySelector('[data-tool=info]').getAttribute('aria-pressed'), btnMeasure: document.querySelector('[data-tool=measure]').getAttribute('aria-pressed'),
      btnInfoOn: document.querySelector('[data-tool=info]').classList.contains('on'), btnMeasureOn: document.querySelector('[data-tool=measure]').classList.contains('on'),
      guide: $('mGuide').hidden ? '' : $('mGuide').textContent, statMode: $('statMode').textContent,
      files: S.files.map(f => ({ id: f.id, name: f.name, n: f.n, vis: f.visible, pvis: f.points.visible, mode: f.mat.uniforms.uMode.value, rgb: f.hasRgb, field: f.fieldName })),
      trajs: S.trajs.map(t => ({ name: t.name, count: t.count, vis: t.visible, gvis: t.group.visible })),
      colorMode: $('colorMode').value, SColorMode: S.colorMode, field: S.field, fieldSel: $('fieldSel').value,
      msg: $('statMsg').textContent, msgErr: !!$('statMsg').style.color,
      measures: S.measures.length, pending: !!S.mPending,
    };
  });
}


// 世界座標（水平補正後）→ 画面の座標（クリック用）
async function screenOf(p, xyz) {
  return p.evaluate(([x, y, z]) => {
    const c = window.__pcd.cam; c.updateMatrixWorld(); c.updateProjectionMatrix();
    const V = c.matrixWorldInverse.elements, P = c.projectionMatrix.elements;
    const mul = (M, v) => [0, 1, 2, 3].map(r => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r] * v[3]);
    const cl = mul(P, mul(V, [x, y, z, 1]));
    const r = window.__pcd.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (cl[0] / cl[3] + 1) / 2 * r.width, y: r.top + (1 - cl[1] / cl[3]) / 2 * r.height, z: cl[2] / cl[3] };
  }, xyz);
}
// ファイル f の i 番目の点の世界座標（水平補正後・シフトを引いた値）
async function worldOf(p, fi, i) {
  return p.evaluate(([fi, i]) => {
    const f = window.__pcd.S.files[fi], P = f.positions, e = window.__pcd.world.matrixWorld.elements;
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
  }, [fi, i]);
}


// カードを一番上に出す（開いていなければドックで開き、下にあれば見出しを押す）
async function card(p, name) {
  const st = await p.evaluate(n => ({ top: document.getElementById('pop').hidden ? null : document.getElementById('pop').dataset.name, tab: !!document.querySelector(`.ptab[data-name="${n}"]`) }), name);
  if (st.top === name) return;
  if (st.tab) await p.click(`.ptab[data-name="${name}"]`);
  else if (name === 'measure') await p.click('[data-tool="measure"]');
  else await p.click(`[data-open="${name}"]`);
  await p.waitForTimeout(150);
}


// 画面の点の色（クライアント座標 x,y の周り 5×5 の中で、背景でない画素の平均）。その場で描き直して readPixels で読む
async function pixelAt(p, x, y) {
  return p.evaluate(([x, y]) => {
    const r = window.__pcd.renderer, gl = r.getContext(), cv = r.domElement, rect = cv.getBoundingClientRect();
    r.render(window.__pcd.world.parent, window.__pcd.cam);
    const pr = cv.width / rect.width, px = Math.round((x - rect.left) * pr), py = Math.round(cv.height - (y - rect.top) * pr);
    const buf = new Uint8Array(5 * 5 * 4); gl.readPixels(px - 2, py - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const bg = buf.slice(0, 3); const acc = [0, 0, 0]; let n = 0; const all = [];
    for (let i = 0; i < 25; i++) { const c = [buf[4 * i], buf[4 * i + 1], buf[4 * i + 2]]; all.push(c); }
    // いちばん多い色を返す（点の色）
    const key = c => c.join(','); const cnt = new Map(); for (const c of all) cnt.set(key(c), (cnt.get(key(c)) || 0) + 1);
    const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    return best;
  }, [x, y]);
}

module.exports = { pixelAt, card, screenOf, worldOf, pw, T, W, DATA, SF, SHOTS, PAGE, GL, recorder, page, electron, idle, open, openTraj, drop, closeAll, msg, shot, state };
