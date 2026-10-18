// Electron の起動部分
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { Live } = require('./live.js');

// ライブ表示（LiDAR の直接受信・配信）。最初に「ライブ」を開いたときに動かし始める
let live = null, liveWin = null;
function setupLive(win) {
  liveWin = win;
  const send = (ch, v) => { if (liveWin && !liveWin.isDestroyed()) liveWin.webContents.send(ch, v); };
  ipcMain.handle('live:open', async () => {
    if (!live) {
      live = new Live();
      live.on('state', s => send('live:state', s));
      live.on('points', b => send('live:points', b));
      live.on('log', t => send('live:log', t));
    }
    return live.open();
  });
  ipcMain.handle('live:startLidar', (e, sn) => live.startLidar(sn));
  ipcMain.handle('live:startPeer', (e, key) => live.startPeer(key));
  ipcMain.handle('live:share', (e, on, step) => live.setShare(on, step));
  ipcMain.handle('live:stop', () => live.stopAll());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'LiDAR Viewer',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.removeMenu();
  setupLive(win);
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  // ファイルを窓に落としたときに、ページが置き換わらないようにする
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // F12 で開発者ツール（不具合の調査用）
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

// 試験用: 同じパソコンで 2 つ目を起動するときは、設定の置き場所を分ける
if (process.env.PCDV_USERDATA) app.setPath('userData', process.env.PCDV_USERDATA);

// 2 回目の起動では新しい窓を開かず、すでに開いている窓を前に出す
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => { if (live) live.close(); app.quit(); });
