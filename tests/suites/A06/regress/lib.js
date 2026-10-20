// A06 の試験の共通部品（Chromium / Electron の起動、ファイルを開く、カードを開く、写真、本物のマウス）
//   使い方: const L = require('./lib.js');
const { execSync, execFileSync } = require('child_process');
const PW = require(execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const fs = require('fs');

const T = '/tmp/claude-0/-home-claude/fe3573b3-7a2d-5bb1-85c8-c22e6780cf30/scratchpad/testenv';
const W = T + '/work/A06';
const APP = process.env.APPDIR || '/home/claude/pcd-viewer';
const PAGE = process.env.PAGE || `http://127.0.0.1:8740/abs${APP}/dist/index.html`;
const FILES = W + '/files';
const SAMPLES = '/home/claude/pcd-viewer/sample/formats';
const SHOTS = process.env.SHOTS || W + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const CHROME_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'];

function attachErrors(p) {
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Chromium で dist/index.html を開く
async function chromium({ w = 1280, h = 800, dpr = 1, scheme = 'dark', reducedMotion = 'no-preference', forcedColors = 'none', headless = true } = {}) {
  const b = await PW.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless, args: CHROME_ARGS });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, colorScheme: scheme, reducedMotion, forcedColors });
  const p = await ctx.newPage();
  const errors = attachErrors(p);
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.waitForTimeout(300);
  return { b, ctx, p, errors, close: () => b.close() };
}

// Electron でアプリを起動する（X が必要。xvfb-run -a -n 160 -s "-screen 0 WxHx24" の中で）
async function electron({ w = 1280, h = 800, dpr = 1, name = 'e', extraArgs = [], env = {} } = {}) {
  const ud = W + '/ud-' + name;
  fs.mkdirSync(ud, { recursive: true });
  const args = ['--no-sandbox'];
  if (dpr !== 1) args.push('--force-device-scale-factor=' + dpr);
  args.push(...extraArgs, path.join(APP, 'main.js'));
  const app = await PW._electron.launch({
    executablePath: '/home/claude/pcd-viewer/node_modules/electron/dist/electron', args,
    env: { ...process.env, PCDV_USERDATA: ud, ...env },
  });
  const p = await app.firstWindow();
  const errors = attachErrors(p);
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  if (w && h) await setContentSize(app, w, h);
  await p.waitForTimeout(400);
  return { app, p, errors, close: () => app.close() };
}
async function setContentSize(app, w, h) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setPosition(0, 0); win.setContentSize(w, h); }, [w, h]);
}
async function winInfo(app) {
  return app.evaluate(({ BrowserWindow, app }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return { title: win.getTitle(), bounds: win.getBounds(), content: win.getContentBounds(), min: win.getMinimumSize(), name: app.getName(), menu: !!win.getMenu?.(), menuBarVisible: win.isMenuBarVisible(), bg: win.getBackgroundColor?.() };
  });
}

// 読み込みが落ち着くまで待つ（進み具合の表示が消え、ファイル数と知らせが 1 秒変わらない）
async function waitIdle(p, limit = 120000) {
  const t0 = Date.now(); let last = '', since = Date.now();
  await p.waitForTimeout(300);
  while (true) {
    const s = await p.evaluate(() => JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, window.__pcd.S.trajs.length, document.getElementById('statMsg').textContent]));
    if (s !== last) { last = s; since = Date.now(); }
    if (JSON.parse(s)[0] && Date.now() - since > 1000) return JSON.parse(s);
    if (Date.now() - t0 > limit) return { timedOut: true, s };
    await p.waitForTimeout(200);
  }
}
async function openFiles(p, files) {
  await p.setInputFiles('#fileInput', files.map(f => path.resolve(f)));
  return waitIdle(p);
}
// 好きな名前のファイルとして開く（ファイル名の長さの制限を受けない）
async function openAs(p, src, names, kind = 'cloud') {
  const b64 = fs.readFileSync(src).toString('base64');
  await p.evaluate(({ b64, names, kind }) => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    window.__pcd.enqueue(names.map(n => new File([bin], n)), kind);
  }, { b64, names, kind });
  return waitIdle(p);
}
async function closeAll(p) {
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); let t; while ((t = document.querySelector('#trajList [data-act=tremove]'))) t.click(); });
  await p.waitForTimeout(200);
}
// ドックのカードを開く（開いていなければ）
// 0.4.2 から: 「表示」の細かい設定（点の大きさ・背景・座標軸・点数）と自動補正は「設定」のカード（4 つのタブ）へ移った。
//   古い名前 'display' は設定のカードを開き、4 つのタブの中身を全部見えるようにする（どの部品もそのまま触れるように）
async function openCard(p, name) {
  const all = name === 'display';
  if (all) name = 'settings';
  await p.evaluate(([n, all]) => {
    document.querySelectorAll('[data-pop=settings] .spane').forEach(e => { if (all) e.hidden = false; }); const s = document.querySelector('#pop').dataset.name; const b = document.querySelector(`[data-open="${n}"]`); if (s !== n) { b.click(); if (document.querySelector('#pop').dataset.name !== n) b.click(); }
    if (all) document.querySelectorAll('[data-pop=settings] .spane').forEach(e => { e.hidden = false; });
  }, [name, all]);
  await p.waitForTimeout(350);
}
async function closeCards(p) {
  await p.evaluate(() => { for (let i = 0; i < 20 && !document.getElementById('pop').hidden; i++) document.getElementById('popClose').click(); });
  await p.waitForTimeout(300);
}
async function shot(p, name, opts = {}) {
  const f = path.join(SHOTS, name + '.png');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  await p.screenshot({ path: f, ...opts });
  return f;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 本物のマウス（XTest）・X の窓一覧（DISPLAY は環境から）
const XH = path.join(__dirname, 'xhover.py');
function x(cmd, ...a) { return execFileSync('python3', [XH, cmd, ...a.map(String)], { encoding: 'utf8' }).trim(); }
const xmove = (px, py) => x('move', Math.round(px), Math.round(py));
const xwindows = () => JSON.parse(x('windows'));
const xshot = f => x('shot', f);
const xclick = (px, py, btn = 1) => x('click', Math.round(px), Math.round(py), btn);
const xkey = keysym => x('key', keysym);
const xicon = (name, out) => JSON.parse(x('icon', name, out));

// 画面の文字の対比（WCAG）
function lum([r, g, b]) { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function contrast(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

module.exports = { PW, T, W, APP, PAGE, FILES, SAMPLES, SHOTS, chromium, electron, setContentSize, winInfo, waitIdle, openFiles, openAs, closeAll, openCard, closeCards, shot, sleep, xmove, xwindows, xshot, xclick, xkey, xicon, lum, contrast, fs, path };
