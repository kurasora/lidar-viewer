// Electron の起動部分
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { fileURLToPath } = require('node:url');
const { Live } = require('./live.js');

// ライブ表示（LiDAR の直接受信・配信）。最初に「ライブ」を開いたときに動かし始める
let live = null, liveWin = null;
function setupLive(win) {
  liveWin = win;
  const send = (ch, v) => { if (liveWin && !liveWin.isDestroyed()) liveWin.webContents.send(ch, v); };
  ipcMain.handle('live:open', async () => {
    if (!live) {
      live = new Live(app.getPath('userData'));
      live.on('state', s => send('live:state', s));
      live.on('points', b => send('live:points', b));
      live.on('log', t => send('live:log', t));
    }
    return live.open();
  });
  // ライブを開く前に呼ばれても落ちないように
  const need = () => { if (!live) throw new Error('ライブがまだ開かれていません'); return live; };
  // sn は SN の文字列か { sn, takeover }（ほかの PC へ送っている LiDAR を、確かめたうえで切り替える）
  ipcMain.handle('live:startLidar', (e, sn) => (sn && typeof sn === 'object' ? need().startLidar(String(sn.sn), sn.takeover === true) : need().startLidar(String(sn))));
  // 終了する前に、横取りした LiDAR の送り先を元に戻す（最大 2 秒待つ）
  ipcMain.handle('live:startPeer', (e, key, code) => need().startPeer(String(key), code == null ? undefined : String(code)));
  ipcMain.handle('live:share', (e, on, step) => need().setShare(!!on, step));
  ipcMain.handle('live:stop', () => need().stopAll());
}

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
  setupLive(win);
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  // ファイルを窓に落としたときに、ページが置き換わらないようにする
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // 画面のプロセスが落ちたら（メモリ不足など）: ライブを止めて LiDAR を戻し、知らせてから読み込み直す（R5-001・B27）
  win.webContents.on('render-process-gone', async (e, d) => {
    if (d && d.reason === 'clean-exit') return;
    pageReady = false;
    const wasLive = !!(live && live.mode);
    if (live) { try { await live.stopAll(); } catch (er) { /* 戻せなくても続ける */ } }
    if (win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'error', title: 'LiDAR Viewer',
      message: '画面が止まりました',
      detail: `画面の処理が終了しました（${GONE_REASON[d && d.reason] || '原因は不明'}）。開いていた点群は閉じられました。${wasLive ? 'ライブの表示は止め、LiDAR は表示する前の状態に戻しました。' : ''}` + (d && d.reason === 'oom' ? '\n大きなファイルは「間引き」を強めて開いてください。' : ''),
      buttons: ['読み込み直す', '終了する'], defaultId: 0, cancelId: 0,
    });
    if (win.isDestroyed()) return;
    if (response === 1) app.quit(); else win.reload();
  });
  // F12 で開発者ツール（不具合の調査用）。製品版では環境変数 LIDAR_VIEWER_DEVTOOLS=1 のときだけ
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
  const n = v => Math.max(0, Math.round(Number(v) || 0));
  const rect = r ? { x: n(r.x), y: n(r.y), width: Math.max(1, n(r.width)), height: Math.max(1, n(r.height)) } : undefined;
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

// Linux の AppImage 版: Ubuntu 23.10 以降は AppArmor が「プロファイルのないアプリの user 名前空間」を止めるため、
// Chromium の安全な囲い（サンドボックス）が作れず起動直後に落ちる。AppImage には SUID の補助も置けないので、
// その制限があるときだけ囲いなしで動かす（deb 版は AppArmor のプロファイルを入れるので囲いありのまま動く）
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
  app.whenReady().then(() => { setupMacMenu(); createWindow(); });
}
app.on('window-all-closed', () => { if (live) live.close(); app.quit(); });
// 終了する前に、横取りした LiDAR の送り先を元に戻す（最大 2 秒待つ）。
// will-quit の最中に app.quit() を呼ぶと無視されるので、戻し終えたら app.exit() で確実に終える（R1-001）
let quitting = false;
app.on('will-quit', e => {
  if (!live || live.closed) return;
  e.preventDefault();
  if (quitting) return;
  quitting = true;
  live.close().finally(() => app.exit(0));
});
// Ctrl+C・kill（SIGINT・SIGTERM）でも同じ順で終える
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.quit());
