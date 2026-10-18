// A14 の試験で共通に使う部品（Electron のアプリを Playwright で動かす）
//   const L = require('./lib.js'); const { app, p, errors } = await L.launch('c1');
'use strict';
const path = require('path');
const fs = require('fs');
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const T = '/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv';
const W = T + '/work/A14';
const F = W + '/files';
const OUT = process.env.OUT || W + '/out';
fs.mkdirSync(OUT, { recursive: true });

async function launch(name, { appdir = process.env.APPDIR || '/home/claude/pcd-viewer', env = {}, fresh = true, args = [] } = {}) {
  const ud = path.join(W, 'ud', name);
  if (fresh) fs.rmSync(ud, { recursive: true, force: true });
  fs.mkdirSync(ud, { recursive: true });
  const app = await pw._electron.launch({
    executablePath: '/home/claude/pcd-viewer/node_modules/electron/dist/electron',
    args: ['--no-sandbox', ...args, path.join(appdir, 'main.js')],
    env: { ...process.env, PCDV_USERDATA: ud, ...env },
    timeout: 60000,
  });
  const p = await app.firstWindow();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  return { app, p, errors, ud };
}

// 「点群を開く」の選択（#fileInput）か「軌跡を開く」（#trajInput）で開いて、読み込みが終わるまで待つ
async function open(p, files, { input = '#fileInput', wait = 180000 } = {}) {
  const before = await p.evaluate(() => window.__pcd.S.seq);
  await p.setInputFiles(input, files.map(f => path.resolve(f)));
  return waitIdle(p, { wait, seqAtLeast: before + files.length });
}
// ドラッグ＆ドロップと同じ道筋（kind なしの enqueue）で開く
async function drop(p, files, { wait = 180000 } = {}) {
  await p.evaluate(() => {
    let i = document.getElementById('__dropInput');
    if (!i) { i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = '__dropInput'; i.hidden = true; document.body.append(i); i.addEventListener('change', () => window.__pcd.enqueue([...i.files])); }
  });
  await p.setInputFiles('#__dropInput', files.map(f => path.resolve(f)));
  return waitIdle(p, { wait });
}
// 読み込みの終わり: 進み具合の表示が消え、ファイル数・軌跡の数・知らせが 1.2 秒変わらない
async function waitIdle(p, { wait = 180000, seqAtLeast = 0 } = {}) {
  const t0 = Date.now(); let last = '', since = Date.now();
  await p.waitForTimeout(300);
  while (true) {
    const s = await p.evaluate(() => JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, window.__pcd.S.trajs.length, document.getElementById('statMsg').textContent, window.__pcd.S.seq]));
    if (s !== last) { last = s; since = Date.now(); }
    const j = JSON.parse(s);
    if (j[0] && Date.now() - since > 1200 && j[4] >= seqAtLeast) break;
    if (Date.now() - t0 > wait) return { timedOut: true, ms: Date.now() - t0, ...(await state(p)) };
    await p.waitForTimeout(200);
  }
  return { timedOut: false, ms: Date.now() - t0, ...(await state(p)) };
}
async function state(p) {
  return p.evaluate(() => {
    const S = window.__pcd.S, m = document.getElementById('statMsg');
    return {
      msg: m.textContent, msgErr: !!m.style.color,
      files: S.files.map(f => ({ id: f.id, name: f.name, n: f.n, total: f.total, sampled: f.sampled, fields: f.header && f.header.fields, fmt: f.header && f.header.data, visible: f.visible, hasRgb: f.hasRgb })),
      trajs: S.trajs.map(t => ({ name: t.name, count: t.count, length: +t.length.toFixed(3), duration: t.duration, topic: t.topic })),
      offset: S.offset, level: S.levelInfo ? { tilt: S.levelInfo.tiltDeg, yaw: S.levelInfo.yawDeg, floorZ: S.levelInfo.floorZ } : null,
      ceilZ: S.ceilZ, hideCeil: S.hideCeil, colorMode: S.colorMode, field: S.field,
    };
  });
}
// ファイルの座標（オフセットを足した元の座標）→ 画面の位置（クライアント座標）
async function screenOf(p, xyz) {
  return p.evaluate(xyz => {
    const P = window.__pcd, S = P.S, o = S.offset || [0, 0, 0];
    const V = P.world.position.constructor;
    const v = new V(xyz[0] - o[0], xyz[1] - o[1], xyz[2] - o[2]).applyMatrix4(P.world.matrixWorld);
    const cam = P.cam; cam.updateMatrixWorld(); const s = v.clone().project(cam);
    const r = P.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (s.x + 1) / 2 * r.width, y: r.top + (1 - s.y) / 2 * r.height, z: s.z, world: v.toArray() };
  }, xyz);
}
async function click(p, xy) { await p.mouse.move(xy.x, xy.y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(150); }
async function render(p) { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function shot(p, name) { const f = path.join(OUT, name + '.png'); await p.screenshot({ path: f }); return f; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(...a) { console.log(...a.map(x => typeof x === 'string' ? x : JSON.stringify(x))); }
module.exports = { launch, open, drop, waitIdle, state, screenOf, click, render, shot, sleep, log, T, W, F, OUT };
