// 陽性対照: title などが付いたページを Electron で開く（吹き出しの検出方法が正しいかを確かめる）
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
if (process.env.PCDV_USERDATA) app.setPath('userData', process.env.PCDV_USERDATA);
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 900, height: 600, x: 0, y: 0, webPreferences: { contextIsolation: true, sandbox: true } });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'page.html'));
});
app.on('window-all-closed', () => app.quit());
