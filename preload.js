// 画面（サンドボックス）に、ライブ表示の操作だけを渡す
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pcdLive', {
  open: () => ipcRenderer.invoke('live:open'),
  startLidar: sn => ipcRenderer.invoke('live:startLidar', sn),
  startPeer: (key, code) => ipcRenderer.invoke('live:startPeer', key, code),
  share: (on, step) => ipcRenderer.invoke('live:share', on, step),
  stop: () => ipcRenderer.invoke('live:stop'),
  onState: cb => ipcRenderer.on('live:state', (e, s) => cb(s)),
  onPoints: cb => ipcRenderer.on('live:points', (e, b) => cb(b)),
  onLog: cb => ipcRenderer.on('live:log', (e, t) => cb(t)),
});
// OS から渡されたファイル（関連付け・コマンドライン・「このアプリで開く」）の受け取り。
// ファイルそのものは主プロセスが隠れた <input id="pcdOsOpen"> に入れ、ここでは「入れた」ことだけを知らせる
contextBridge.exposeInMainWorld('pcdApp', {
  ready: () => ipcRenderer.send('app:ready'),
  // 「画像を保存」: 画面のこの範囲をそのまま撮った PNG（Uint8Array）を返す
  capture: rect => ipcRenderer.invoke('app:capture', rect),
  onOpenFiles: cb => ipcRenderer.on('app:openFiles', (e, names) => cb(Array.isArray(names) ? names.map(String) : [])),
});
