// Electron の起動部分
const { app, BrowserWindow, ipcMain, Menu, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { fileURLToPath } = require('node:url');

// 画面のプロセスが落ちた理由を日本語に（R15-003）
const GONE_REASON = { oom: 'メモリ不足', killed: 'ほかのプログラムに止められました', crashed: '異常終了', 'abnormal-exit': '異常終了',
  'launch-failed': '起動に失敗', 'integrity-failure': 'プログラムの検証に失敗', 'memory-eviction': 'メモリ不足' };

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'LiDAR Viewer',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    // 起動直後に白く光らないように: 画面の地の色（styles.css の --bg）で塗り、描けてから見せる
    backgroundColor: '#0e1317',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js') },
  });
  let shown = false;
  const showOnce = () => { if (!shown && !win.isDestroyed()) { shown = true; win.show(); } };
  win.once('ready-to-show', showOnce);
  setTimeout(showOnce, 4000); // 描画が遅い PC（ソフトウェア描画など）でも窓は必ず出す
  win.removeMenu();
  mainWin = win;
  win.on('closed', () => { if (mainWin === win) { mainWin = null; pageReady = false; } });
  // WebRTC（ビデオ通話などの部品）で、CSP を通らずに外へ UDP を送れないようにする（使っていない。S1-003）
  win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  // ファイルを窓に落としたときに、ページが置き換わらないようにする
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // 画面のプロセスが落ちたら（メモリ不足など）: 知らせてから読み込み直す（R5-001・B27）
  win.webContents.on('render-process-gone', async (e, d) => {
    if (d && d.reason === 'clean-exit') return;
    pageReady = false;
    if (win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'error', title: 'LiDAR Viewer',
      message: '画面が止まりました',
      detail: `画面の処理が終了しました（${GONE_REASON[d && d.reason] || '原因は不明'}）。開いていた点群は閉じられました。` +(d && d.reason === 'oom' ? '\n大きなファイルは「間引き」を強めて開いてください。' : ''),
      buttons: ['読み込み直す', '終了する'], defaultId: 0, cancelId: 0,
    });
    if (win.isDestroyed()) return;
    if (response === 1) app.quit(); else win.reload();
  });
  // F12 で開発者ツール（不具合の調査用）。製品 version では環境変数 LIDAR_VIEWER_DEVTOOLS=1 のときだけ
  if (!app.isPackaged || process.env.LIDAR_VIEWER_DEVTOOLS === '1') {
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    });
  }
}

// ---- OS から渡されたファイルを開く（コマンドライン・関連付け・ダブルクリック・「このアプリで開く」・mac の open-file）----
// 画面はサンドボックスの中なので、パスから File を作れない。画面の隠れた <input type=file id="pcdOsOpen"> に
// Chromium の DevTools プロトコル（DOM.setFileInputFiles）でファイルを入れ、画面に「開いて」と知らせる
// （ファイルの中身は写さず、ディスク上の File のまま渡るので大きなファイルでも速い）
let mainWin = null, pageReady = false;
const pendingPaths = [];
function filesFromArgv(argv, cwd) {
  const args = argv.slice(process.defaultApp ? 2 : 1);
  const out = [];
  for (let a of args) {
    if (typeof a !== 'string' || !a || a.startsWith('-')) continue;
    try {
      if (/^file:\/\//i.test(a)) a = fileURLToPath(a);
      const p = path.resolve(cwd || process.cwd(), a);
      if (p === __filename || path.dirname(p) === __dirname) continue; // 開発時に electron へ渡すアプリ自身（main.js など）は開かない
      if (fs.statSync(p).isFile()) out.push(p);
    } catch (e) { /* ファイルでないもの（Chromium の引数など）は無視 */ }
  }
  return out;
}
// 複数のファイルが続けて渡されても（関連付けで同時に開く・2 回目の起動が続く）、DevTools プロトコルへの接続が
// 重ならないように 1 回ずつ順に渡す（重なると半分前後が黙って開かない。R4-001）
let openChain = Promise.resolve();
function openPaths(paths) {
  if (paths && paths.length) pendingPaths.push(...paths);
  openChain = openChain.then(() => new Promise(r => setTimeout(r, 150))).then(flushPaths).catch(() => {});
}
async function flushPaths() {
  if (!pendingPaths.length || !pageReady || !mainWin || mainWin.isDestroyed()) return;
  const files = [...new Set(pendingPaths.splice(0))]; // 同じファイルを 2 回渡されても 1 回だけ（R4-002）
  const dbg = mainWin.webContents.debugger;
  let attached = false;
  try {
    if (!dbg.isAttached()) { dbg.attach('1.3'); attached = true; }
    const { result } = await dbg.sendCommand('Runtime.evaluate', { expression: "document.getElementById('pcdOsOpen')" });
    if (!result || !result.objectId) throw new Error('受け取り口がありません');
    await dbg.sendCommand('DOM.setFileInputFiles', { objectId: result.objectId, files });
    dbg.sendCommand('Runtime.releaseObject', { objectId: result.objectId }).catch(() => {});
    mainWin.webContents.send('app:openFiles', files.map(f => path.basename(f)));
  } catch (e) {
    console.error('ファイルを渡せませんでした:', e && e.message);
  } finally {
    if (attached) try { dbg.detach(); } catch (e) { /* もう外れている */ }
  }
}
// 「画像を保存」: 画面に映っているもの（点群・吹き出し・距離）をそのまま撮る
ipcMain.handle('app:capture', async (e, r) => {
  if (!mainWin || e.sender !== mainWin.webContents) throw new Error('この画面からは撮れません');
  // 範囲は窓の中だけ（S1-005）。数でないもの・窓からはみ出すもの（端の丸めの 2 画素を超える）は断る
  const bad = () => new Error('撮る範囲が正しくありません');
  if (!r || typeof r !== 'object') throw bad();
  const v = ['x', 'y', 'width', 'height'].map(k => Number(r[k]));
  if (!v.every(Number.isFinite)) throw bad();
  const [W, H] = mainWin.getContentSize();
  const x0 = Math.max(0, Math.floor(v[0])), y0 = Math.max(0, Math.floor(v[1]));
  const x1 = Math.min(W, Math.ceil(v[0] + v[2])), y1 = Math.min(H, Math.ceil(v[1] + v[3]));
  if (v[0] < -2 || v[1] < -2 || v[0] + v[2] > W + 2 || v[1] + v[3] > H + 2 || x1 - x0 < 1 || y1 - y0 < 1) throw bad();
  const rect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  const img = await mainWin.webContents.capturePage(rect);
  return new Uint8Array(img.toPNG());
});
// 画面の準備ができた（app.js の末尾から呼ばれる）
ipcMain.on('app:ready', e => {
  if (!mainWin || e.sender !== mainWin.webContents) return;
  pageReady = true;
  openPaths();
});
// mac: Finder でダブルクリック・「このアプリで開く」・Dock に落とす（起動前にも来る）
app.on('open-file', (e, p) => {
  e.preventDefault();
  openPaths([p]);
  if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
});

// 画面からの要求を絞る（S1-004・S3-001・S3-004）
//  - 権限（カメラ・マイク・位置・クリップボードの読み取り・通知など）は使わないので、すべて断る
//  - file:// はアプリ自身の画面のファイル（dist の中）だけ。共有フォルダ（file://ホスト名/…）やほかの場所は断る。
//    利用者が選んだファイルは File（blob）として渡るので、ここは通らない
//  - インターネット（http・https・ws・wss・ftp）へは一切出ない
const APP_DIR = path.join(__dirname, 'dist');
function isAppFile(url) {
  try {
    const u = new URL(url);
    if (u.hostname) return false;
    const rel = path.relative(APP_DIR, fileURLToPath(u));
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch (e) { return false; }
}
function lockDownSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.webRequest.onBeforeRequest((d, cb) => {
    const s = (d.url.match(/^([a-z][a-z0-9+.-]*):/i) || [])[1];
    const scheme = s ? s.toLowerCase() : '';
    if (scheme === 'file') return cb({ cancel: !isAppFile(d.url) });
    if (/^(https?|wss?|ftp)$/.test(scheme)) return cb({ cancel: true });
    cb({});
  });
}

// mac: 既定のメニュー（⌘R の再読み込み・開発者ツールなど）を出さず、最小限の日本語のメニューにする
function setupMacMenu() {
  if (process.platform !== 'darwin') return;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [
      { role: 'about', label: 'LiDAR Viewer について' },
      { type: 'separator' },
      { role: 'hide', label: 'LiDAR Viewer を隠す' },
      { role: 'hideOthers', label: 'ほかを隠す' },
      { role: 'unhide', label: 'すべてを表示' },
      { type: 'separator' },
      { role: 'quit', label: 'LiDAR Viewer を終了' },
    ] },
    { label: '編集', submenu: [
      { role: 'undo', label: '取り消す' },
      { role: 'redo', label: 'やり直す' },
      { type: 'separator' },
      { role: 'cut', label: '切り取り' },
      { role: 'copy', label: 'コピー' },
      { role: 'paste', label: 'ペースト' },
      { role: 'selectAll', label: 'すべてを選択' },
    ] },
    { label: 'ウインドウ', submenu: [
      { role: 'minimize', label: 'しまう' },
      { role: 'zoom', label: '拡大／縮小' },
      { role: 'togglefullscreen', label: 'フルスクリーン' },
      { type: 'separator' },
      { role: 'close', label: '閉じる' },
    ] },
  ]));
}

// Linux の AppImage version: Ubuntu 23.10 以降は AppArmor が「プロファイルのないアプリの user 名前空間」を止めるため、
// Chromium の安全な囲い（サンドボックス）が作れず起動直後に落ちる。AppImage には SUID の補助も置けないので、
// その制限があるときだけ囲いなしで動かす（deb version は AppArmor のプロファイルを入れるので囲いありのまま動く）
if (process.platform === 'linux' && process.env.APPIMAGE) {
  try {
    if (require('node:fs').readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1') app.commandLine.appendSwitch('no-sandbox');
  } catch (e) { /* その設定がない OS では何もしない */ }
}

// GPU が使えない・使えない扱いの PC（リモートデスクトップ・仮想マシン・古いドライバ）でも、
// ソフトウェア描画（SwiftShader）で 3D を出せるようにする（Electron 36 以降は明示しないと WebGL が作れない）
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

// 試験用: 同じパソコンで 2 つ目を起動するときは、設定の置き場所を分ける
if (process.env.PCDV_USERDATA) app.setPath('userData', process.env.PCDV_USERDATA);

// 2 回目の起動では新しい窓を開かず、すでに開いている窓を前に出す
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv, cwd) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
    openPaths(filesFromArgv(argv, cwd)); // 2 回目の起動に渡されたファイルは、開いている窓で開く
  });
  pendingPaths.push(...filesFromArgv(process.argv)); // 起動時のコマンドライン・関連付けで渡されたファイル
  app.whenReady().then(() => { lockDownSession(); setupMacMenu(); createWindow(); });
}
app.on('window-all-closed', () => app.quit());
// Ctrl+C・kill（SIGINT・SIGTERM）でも、窓を閉じたときと同じように終える
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.quit());
