// 起動と終了の試験。配布物の Linux version（linux-unpacked）を Playwright で動かす
//   heavy xvfb-run -a -n 200 node lifecycle.js [場面...]   （場面を省くと全部）
//   環境変数: APPBIN（既定 release/linux-unpacked/lidar-viewer）、W（作業フォルダ）、BIGPCD（読み込み中に閉じる用の大きな PCD）
// 出力: 1 場面 1 行の JSON（ok が false の項目が問題）
'use strict';
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const W = process.env.W || path.resolve(__dirname, '..');
const APP = process.env.APPBIN || '/home/claude/pcd-viewer/release/linux-unpacked/lidar-viewer';
const RUN = path.join(W, 'run', 'lifecycle');
const BIG = process.env.BIGPCD || path.join(W, 'data', 'big8m.pcd');
const SAMPLE = '/home/claude/pcd-viewer/sample/formats/pcl_binary.pcd';
fs.mkdirSync(RUN, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const emit = o => console.log(JSON.stringify(o));

function procTable() {
  const t = {};
  for (const p of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(p)) continue;
    try { const st = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const r = st.slice(st.lastIndexOf(')') + 2).split(' '); t[p] = { ppid: +r[1] }; } catch (e) { /* 消えた */ }
  }
  return t;
}
function descendants(pid) {
  const t = procTable(); const kids = {};
  for (const [p, v] of Object.entries(t)) (kids[v.ppid] ||= []).push(+p);
  const out = [], st = [pid];
  while (st.length) { const x = st.pop(); for (const c of kids[x] || []) { out.push(c); st.push(c); } }
  return out;
}
const cmdline = pid => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').replace(/\s+/g, ' ').slice(0, 140); } catch (e) { return null; } };
const alive = pid => { try { process.kill(pid, 0); return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0] !== 'Z'; } catch (e) { return false; } };
const typeOf = pid => { const c = cmdline(pid) || ''; const m = c.match(/--type=([a-z-]+)/); return m ? m[1] : (/crashpad/.test(c) ? 'crashpad' : 'main?'); };

async function launch(name, { args = [], env = {}, noUd = false, bin = APP } = {}) {
  const ud = path.join(W, 'ud', name);
  const e = { ...process.env, ...env };
  if (noUd) delete e.PCDV_USERDATA; else e.PCDV_USERDATA = ud;
  const app = await pw._electron.launch({ executablePath: bin, args: ['--no-sandbox', ...args], env: e, timeout: 90000 });
  const page = await app.firstWindow({ timeout: 90000 });
  const errs = [];
  page.on('pageerror', x => errs.push('pageerror: ' + x.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await page.waitForFunction(() => window.__pcd, null, { timeout: 90000 });
  const proc = app.process();
  const exited = new Promise(r => proc.once('exit', (code, sig) => r({ code, sig, t: Date.now() })));
  return { app, page, pid: proc.pid, ud, errs, exited, proc };
}

// 窓を「利用者が閉じた」のと同じく主プロセスで close() し、終わるまでの時間と残ったプロセスを調べる
async function closeAndWatch(h, label) {
  const before = descendants(h.pid).map(p => ({ pid: p, type: typeOf(p) }));
  const t0 = Date.now();
  h.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; if (w) w.close(); }).catch(() => {});
  const r = await Promise.race([h.exited, sleep(15000).then(() => null)]);
  await sleep(1500);
  const left = before.filter(p => alive(p.pid)).map(p => ({ ...p, cmd: cmdline(p.pid) }));
  const mainAlive = alive(h.pid);
  return { label, exitMs: r ? r.t - t0 : null, exitCode: r ? r.code : null, signal: r ? r.sig : null, mainAlive, childrenBefore: before.length, childrenLeft: left };
}

const SCENES = {};

// S1: 普通に起動して終わる。名前・version・設定の置き場所（既定）・窓の題・WM_CLASS・ロックの片付け
SCENES.basic = async () => {
  const home = path.join(W, 'home', 'basic');
  fs.rmSync(home, { recursive: true, force: true }); fs.mkdirSync(home, { recursive: true });
  const h = await launch('basic', { noUd: true, env: { HOME: home, XDG_CONFIG_HOME: '' } });
  const m = await h.app.evaluate(({ app, BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return {
      name: app.getName(), version: app.getVersion(), isPackaged: app.isPackaged, userData: app.getPath('userData'), appData: app.getPath('appData'),
      logs: app.getPath('logs'), crashDumps: app.getPath('crashDumps'), locale: app.getLocale(), argv: process.argv,
      winTitle: w.getTitle(), bounds: w.getBounds(), menuBarVisible: w.isMenuBarVisible(), ua: w.webContents.getUserAgent(),
      chromeDesktop: process.env.CHROME_DESKTOP || null, windows: BrowserWindow.getAllWindows().length,
    };
  });
  const d = await h.page.evaluate(() => ({ title: document.title, lang: document.documentElement.lang }));
  // X の窓の属性（WM_CLASS・_NET_WM_NAME・_NET_WM_ICON の大きさ）
  let x11 = null;
  try { x11 = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'x11_windows.py')], { env: { ...process.env, PYTHONPATH: path.join(W, 'pylib') } }).toString()); } catch (e) { x11 = { error: e.message.slice(0, 200) }; }
  const udFilesRunning = fs.existsSync(m.userData) ? fs.readdirSync(m.userData) : null;
  const c = await closeAndWatch(h, 'basic');
  const udFilesAfter = fs.existsSync(m.userData) ? fs.readdirSync(m.userData) : null;
  const ls = fs.existsSync(path.join(m.userData, 'Local Storage')) ? 'あり' : 'なし';
  const checks = {
    userDataName: m.userData === path.join(home, '.config', 'LiDAR Viewer'),
    title: m.winTitle === 'LiDAR Viewer' && d.title === 'LiDAR Viewer',
    exitedQuickly: c.exitMs !== null && c.exitMs < 5000,
    noLeftovers: c.childrenLeft.length === 0 && !c.mainAlive,
    lockRemoved: !(udFilesAfter || []).some(f => /^Singleton/.test(f)),
    wmClass: !!(x11 && x11.windows && x11.windows.some(w => (w.wm_class || []).includes('LiDAR Viewer'))),
  };
  return { main: m, doc: d, x11, udFilesRunning, udFilesAfter, localStorageDir: ls, close: c, errs: h.errs, checks };
};

// S2: 二重起動。2 つ目は（ファイルを引数に渡しても）すぐ終わり、1 つ目の second-instance が呼ばれて窓を前に出す（restore/focus）
SCENES.second = async () => {
  const h = await launch('second');
  await h.app.evaluate(({ app, BrowserWindow }) => {
    globalThis.__si = []; globalThis.__calls = [];
    app.on('second-instance', (e, argv, cwd, add) => globalThis.__si.push({ argv, cwd, add }));
    const P = BrowserWindow.prototype;
    for (const k of ['restore', 'focus', 'show', 'moveTop']) { const o = P[k]; P[k] = function (...a) { globalThis.__calls.push(k); return o.apply(this, a); }; }
    const om = P.isMinimized; P.isMinimized = function () { globalThis.__calls.push('isMinimized'); return true; }; // 最小化されている場合の道を通す（窓管理なしの xvfb では最小化できないため）
  });
  const t0 = Date.now();
  const b = spawn(APP, ['--no-sandbox', SAMPLE], { env: { ...process.env, PCDV_USERDATA: h.ud }, stdio: ['ignore', 'pipe', 'pipe'] });
  let berr = ''; b.stderr.on('data', x => { berr += x; }); b.stdout.on('data', x => { berr += x; });
  const br = await new Promise(r => { const to = setTimeout(() => r({ code: 'timeout' }), 20000); b.on('exit', (code, sig) => { clearTimeout(to); r({ code, sig }); }); });
  const bMs = Date.now() - t0;
  await sleep(2500);
  const si = await h.app.evaluate(() => ({ si: globalThis.__si, calls: globalThis.__calls }));
  const files = await h.page.evaluate(() => window.__pcd.S.files.map(f => f.name));
  const c = await closeAndWatch(h, 'second');
  return { second: { exit: br, ms: bMs, stderrTail: berr.split('\n').filter(Boolean).slice(-3) }, secondInstanceEvents: si, filesInFirst: files, close: c,
    checks: { secondExited: br.code === 0 && bMs < 10000, eventFired: si.si.length === 1, restoredAndFocused: si.calls.includes('restore') && si.calls.includes('focus'), fileFromSecondOpened: files.length > 0 } };
};

// S3: コマンドラインでファイルを渡して起動（関連付け・「このアプリで開く」と同じ）
SCENES.argv = async () => {
  const h = await launch('argv', { args: [SAMPLE] });
  await sleep(5000);
  const st = await h.page.evaluate(() => ({ files: window.__pcd.S.files.map(f => f.name), msg: document.getElementById('statMsg').textContent }));
  const argv = await h.app.evaluate(() => process.argv);
  const c = await closeAndWatch(h, 'argv');
  return { argv, state: st, close: c, checks: { fileOpened: st.files.length > 0 } };
};

// S4: 読み込み中に窓を閉じる（大きな PCD）
SCENES.closeLoading = async () => {
  if (!fs.existsSync(BIG)) return { skip: 'no ' + BIG };
  const h = await launch('closeLoading');
  await h.page.setInputFiles('#fileInput', BIG);
  let seen = false;
  for (let i = 0; i < 60; i++) { // 読み込み中の表示を待つ
    seen = await h.page.evaluate(() => { const p = document.getElementById('progress'); return !!p && !p.hidden && getComputedStyle(p).display !== 'none'; });
    if (seen) break; await sleep(100);
  }
  await sleep(800);
  const loadingNow = await h.page.evaluate(() => ({ files: window.__pcd.S.files.length, progress: (document.getElementById('progress') || {}).textContent }));
  const c = await closeAndWatch(h, 'closeLoading');
  return { progressSeen: seen, loadingNow, close: c, checks: { exitedQuickly: c.exitMs !== null && c.exitMs < 5000, noLeftovers: c.childrenLeft.length === 0 && !c.mainAlive } };
};

// S5: 主プロセスを強制終了（kill -9）→ 子が残らないか、同じ設定の置き場所ですぐ起動し直せるか
SCENES.kill9 = async () => {
  const h = await launch('kill9');
  const kids = descendants(h.pid).map(p => ({ pid: p, type: typeOf(p) }));
  process.kill(h.pid, 'SIGKILL');
  await Promise.race([h.exited, sleep(5000)]);
  await sleep(3000);
  const left = kids.filter(p => alive(p.pid)).map(p => ({ ...p, cmd: cmdline(p.pid) }));
  const lockFiles = fs.readdirSync(h.ud).filter(f => /^Singleton/.test(f));
  for (const p of left) try { process.kill(p.pid, 'SIGKILL'); } catch (e) { /* */ }
  let relaunch = null;
  try {
    const h2 = await launch('kill9');
    relaunch = { ok: true, title: await h2.page.title() };
    relaunch.close = await closeAndWatch(h2, 'kill9-relaunch');
  } catch (e) { relaunch = { ok: false, error: e.message.slice(0, 300) }; }
  return { childrenBefore: kids, leftAfterKill: left, staleLockFiles: lockFiles, relaunch, checks: { noOrphans: left.length === 0, relaunchOk: !!(relaunch && relaunch.ok) } };
};

// S6: キー操作（再読み込み・開発者ツール・閉じる・拡大）。メニューを外しているので効かないのが期待
SCENES.keys = async () => {
  const h = await launch('keys');
  await h.page.evaluate(() => { window.__marker = 42; });
  const res = {};
  const devtools = () => h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened());
  const zoom = () => h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel());
  for (const k of ['Control+r', 'F5', 'Control+Shift+r', 'Control+Shift+i', 'Control+=', 'Control+-', 'Control+w', 'Control+q', 'Alt']) {
    await h.page.keyboard.press(k).catch(e => { res[k] = 'press error ' + e.message; });
    await sleep(700);
    const st = await h.page.evaluate(() => window.__marker).catch(() => 'gone');
    res[k] = { marker: st, devtools: await devtools().catch(() => 'n/a'), zoom: await zoom().catch(() => 'n/a'), windows: await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length).catch(() => 'n/a') };
  }
  await h.page.keyboard.press('F12'); await sleep(1000);
  res.F12 = { devtools: await devtools() };
  const c = await closeAndWatch(h, 'keys');
  return { res, close: c };
};

// S7: 起動して 20 秒置いたときに、外へ通信しようとするか（Chromium の net-log で見る）
SCENES.netlog = async () => {
  const log = path.join(RUN, 'netlog.json');
  fs.rmSync(log, { force: true });
  const h = await launch('netlog', { args: [`--log-net-log=${log}`, '--net-log-capture-mode=Default'] });
  // 文字の入力欄に触る（スペルチェックの辞書の取得などのきっかけ）
  await h.page.evaluate(() => { const i = document.querySelector('input[type=text], input:not([type]), textarea'); if (i) i.focus(); });
  await sleep(20000);
  const c = await closeAndWatch(h, 'netlog');
  await sleep(1000);
  let hosts = [], urls = [];
  try {
    const txt = fs.readFileSync(log, 'utf8');
    const j = JSON.parse(txt.trim().endsWith(']}') || txt.trim().endsWith('}') ? txt : txt.replace(/,\s*$/, '') + ']}');
    const s = new Set(), u = new Set();
    for (const ev of j.events || []) {
      const p = ev.params || {};
      if (p.host) s.add(p.host);
      if (p.url) u.add(p.url.slice(0, 120));
    }
    hosts = [...s]; urls = [...u];
  } catch (e) { hosts = ['parse error ' + e.message.slice(0, 100)]; }
  return { hosts, urls: urls.filter(x => !/^(file|data|blob|devtools|chrome):/.test(x)).slice(0, 30), close: c,
    checks: { noExternal: !urls.some(x => /^https?:/.test(x)) && !hosts.some(x => !/^(localhost|127\.|\[::1\])/.test(x)) } };
};

// S8: 既定のアプリのメニュー（mac では画面上のメニューバーになる）。removeMenu() は窓のメニューを外すだけ
SCENES.menu = async () => {
  const h = await launch('menu');
  const m = await h.app.evaluate(({ Menu, BrowserWindow }) => {
    const am = Menu.getApplicationMenu();
    const walk = it => ({ label: it.label, role: it.role || null, accel: it.accelerator || null, sub: it.submenu ? it.submenu.items.map(walk) : undefined });
    return { appMenu: am ? am.items.map(walk) : null, windowMenuBarVisible: BrowserWindow.getAllWindows()[0].isMenuBarVisible() };
  });
  const c = await closeAndWatch(h, 'menu');
  const flat = JSON.stringify(m.appMenu || []);
  return { ...m, close: c, checks: { appMenuHasReload: /"role":"reload"/i.test(flat), appMenuHasToggleDevTools: /toggledevtools/i.test(flat) } };
};

// S9: 日本語のフォントがない Linux（最小構成）で画面がどう見えるか（写真を残す）
SCENES.fonts = async () => {
  const res = {};
  for (const [tag, env] of [['normal', {}], ['nocjk', { FONTCONFIG_FILE: path.join(W, 'data', 'fc', 'nocjk.conf') }]]) {
    const h = await launch('fonts_' + tag, { env });
    await sleep(1500);
    const shot = path.join(RUN, `fonts_${tag}.png`);
    await h.page.screenshot({ path: shot });
    res[tag] = { shot, sample: await h.page.evaluate(() => document.body.innerText.slice(0, 80)) };
    res[tag].close = await closeAndWatch(h, 'fonts_' + tag);
  }
  return res;
};

// S10: 設定の置き場所が作れない（読み取り専用・権限なし）とき。何も言わずに終わらないか
SCENES.roUserData = async () => {
  const ro = '/home/claude/pcd-viewer/__a10_ro_test__/ud'; // 読み取り専用のマウントの下（mkdir が EROFS で失敗する）
  const t0 = Date.now();
  const b = spawn(APP, ['--no-sandbox'], { env: { ...process.env, PCDV_USERDATA: ro }, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; b.stderr.on('data', x => { err += x; }); b.stdout.on('data', x => { err += x; });
  let wins = null;
  const r = await new Promise(res => { const to = setTimeout(() => res({ code: 'still running' }), 15000); b.on('exit', (code, sig) => { clearTimeout(to); res({ code, sig }); }); });
  if (r.code === 'still running') {
    try { wins = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'x11_windows.py')], { env: { ...process.env, PYTHONPATH: path.join(W, 'pylib') } }).toString()); } catch (e) { wins = { error: e.message.slice(0, 100) }; }
    b.kill('SIGTERM'); await sleep(1500); try { b.kill('SIGKILL'); } catch (e) { /* */ }
  }
  return { exit: r, ms: Date.now() - t0, windows: wins, stderr: err.split('\n').filter(l => l && !/bus\.cc|dbus/.test(l)).slice(0, 8), checks: { silentExit: r.code !== 'still running' && !/[぀-ヿ]/.test(err) } };
};

// S11: 描画プロセスが落ちたとき（大きすぎるファイルでのメモリ不足などと同じ）。立ち直るか・知らせが出るか
SCENES.rendererCrash = async () => {
  const h = await launch('rendererCrash');
  await h.app.evaluate(({ app }) => { globalThis.__gone = []; app.on('render-process-gone', (e, wc, d) => globalThis.__gone.push(d)); });
  const kids = descendants(h.pid).filter(p => typeOf(p) === 'renderer');
  for (const p of kids) process.kill(p, 'SIGKILL');
  await sleep(4000);
  const st = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { windows: BrowserWindow.getAllWindows().length, crashed: w ? w.webContents.isCrashed() : null, url: w ? w.webContents.getURL().slice(-30) : null, gone: globalThis.__gone, visible: w ? w.isVisible() : null };
  });
  const shot = path.join(RUN, 'renderer_crash.png');
  try { const img = await h.app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')); fs.writeFileSync(shot, Buffer.from(img, 'base64')); } catch (e) { /* */ }
  const c = await closeAndWatch(h, 'rendererCrash');
  return { renderersKilled: kids.length, state: st, shot, close: c, checks: { recovered: st.crashed === false } };
};

// S12: 旧 version（PCD Viewer 0.2.0）からの引き継ぎ。旧 version で変えた設定（点数の上限・背景）が新 version で残るか／旧 version と新 version を同時に起動できるか
const OLDAPP = process.env.OLDBIN || '/home/claude/release-archive/release-0.2.0/linux-unpacked/pcd-viewer';
SCENES.migrate = async () => {
  if (!fs.existsSync(OLDAPP)) return { skip: 'no ' + OLDAPP };
  const home = path.join(W, 'home', 'migrate');
  fs.rmSync(home, { recursive: true, force: true }); fs.mkdirSync(home, { recursive: true });
  const env = { HOME: home };
  const o = await launch('migrate_old', { noUd: true, env, bin: OLDAPP });
  const oldInfo = await o.app.evaluate(({ app }) => ({ name: app.getName(), version: app.getVersion(), userData: app.getPath('userData') }));
  const setv = await o.page.evaluate(() => {
    const sel = document.getElementById('capSel'); const v = sel.options[sel.options.length - 1].value;
    sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true }));
    try { localStorage.setItem('pcdviewer.bg', '33'); } catch (e) { /* */ }
    return { cap: localStorage.getItem('pcdviewer.cap'), bg: localStorage.getItem('pcdviewer.bg') };
  });
  const oc = await closeAndWatch(o, 'migrate_old');
  const n = await launch('migrate_new', { noUd: true, env });
  const newInfo = await n.app.evaluate(({ app }) => ({ name: app.getName(), version: app.getVersion(), userData: app.getPath('userData') }));
  const got = await n.page.evaluate(() => ({ cap: localStorage.getItem('pcdviewer.cap'), bg: localStorage.getItem('pcdviewer.bg'), capSel: document.getElementById('capSel').value }));
  // 新 version を起動したまま旧 version も起動（設定の置き場所が違うので二重起動にならない）
  let both = null;
  try {
    const o2 = await launch('migrate_old2', { noUd: true, env, bin: OLDAPP });
    both = { oldStarted: true, newStillAlive: alive(n.pid) };
    both.closeOld = await closeAndWatch(o2, 'migrate_old2');
  } catch (e) { both = { oldStarted: false, error: e.message.slice(0, 200) }; }
  const nc = await closeAndWatch(n, 'migrate_new');
  const cfg = fs.existsSync(path.join(home, '.config')) ? fs.readdirSync(path.join(home, '.config')) : [];
  return { oldInfo, setInOld: setv, newInfo, readInNew: got, configDirs: cfg, both, closeOld: oc, closeNew: nc,
    checks: { settingsCarriedOver: got.cap === setv.cap && got.bg === setv.bg, singleInstanceAcrossVersions: both && !both.oldStarted } };
};

// S13: 一時フォルダ（TMPDIR）のパスが長いとき。二重起動の防止の部品（ソケット）が作れず、何も言わずに終わらないか
SCENES.longTmpdir = async () => {
  const longTmp = path.join(W, 'tmp', 'long_tmpdir_' + 'x'.repeat(40));
  fs.mkdirSync(longTmp, { recursive: true });
  const ud = path.join(W, 'ud', 'longTmpdir');
  const t0 = Date.now();
  const b = spawn(APP, ['--no-sandbox'], { env: { ...process.env, TMPDIR: longTmp, PCDV_USERDATA: ud }, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; b.stderr.on('data', x => { err += x; }); b.stdout.on('data', x => { err += x; });
  const r = await new Promise(res => { const to = setTimeout(() => res({ code: 'still running' }), 15000); b.on('exit', (code, sig) => { clearTimeout(to); res({ code, sig }); }); });
  if (r.code === 'still running') { b.kill('SIGTERM'); await sleep(1500); try { b.kill('SIGKILL'); } catch (e) { /* */ } }
  return { tmpdirLength: longTmp.length, exit: r, ms: Date.now() - t0, stderr: err.split('\n').filter(l => l && !/bus\.cc|dbus/.test(l)).slice(0, 8),
    checks: { started: r.code === 'still running' } };
};

(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
  for (const name of want) {
    const t0 = Date.now();
    try { emit({ scene: name, ms: 0, ...(await SCENES[name]()), took: Date.now() - t0 }); }
    catch (e) { emit({ scene: name, fatal: e.message.slice(0, 500), took: Date.now() - t0 }); }
  }
  process.exit(0);
})();
