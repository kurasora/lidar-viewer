// 画面（サンドボックス）に、アプリ version だけの操作（OS から渡されたファイル・画像の保存）を渡す
const { contextBridge, ipcRenderer } = require('electron');
// OS から渡されたファイル（関連付け・コマンドライン・「このアプリで開く」）の受け取り。
// ファイルそのものは主プロセスが隠れた <input id="pcdOsOpen"> に入れ、ここでは「入れた」ことだけを知らせる
contextBridge.exposeInMainWorld('pcdApp', {
  ready: () => ipcRenderer.send('app:ready'),
  // 「画像を保存」: 画面のこの範囲をそのまま撮った PNG（Uint8Array）を返す
  capture: rect => ipcRenderer.invoke('app:capture', rect),
  // 言語（ja / en）を主プロセスに知らせる（落ちたときの知らせ・Mac のメニューの言葉）
  setLang: l => ipcRenderer.send('app:lang', l === 'en' ? 'en' : 'ja'),
  onOpenFiles: cb => ipcRenderer.on('app:openFiles', (e, names) => cb(Array.isArray(names) ? names.map(String) : [])),
});
