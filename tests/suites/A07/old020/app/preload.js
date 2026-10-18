// 画面（サンドボックス）に、ライブ表示の操作だけを渡す
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pcdLive', {
  open: () => ipcRenderer.invoke('live:open'),
  startLidar: sn => ipcRenderer.invoke('live:startLidar', sn),
  startPeer: key => ipcRenderer.invoke('live:startPeer', key),
  share: (on, step) => ipcRenderer.invoke('live:share', on, step),
  stop: () => ipcRenderer.invoke('live:stop'),
  onState: cb => ipcRenderer.on('live:state', (e, s) => cb(s)),
  onPoints: cb => ipcRenderer.on('live:points', (e, b) => cb(b)),
  onLog: cb => ipcRenderer.on('live:log', (e, t) => cb(t)),
});
