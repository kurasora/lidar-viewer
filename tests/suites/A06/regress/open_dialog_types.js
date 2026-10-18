// ファイルを開く画面（GTK）の「種類」の一覧を開いて写真に撮る（Electron）。形式が縦に 1 つずつ並ぶか
const L = require('./lib.js');
(async () => {
  const { app, p, close } = await L.electron({ w: 1280, h: 800, name: 'opendlg' });
  await L.openCard(p, 'open');
  const base = L.xwindows();
  await p.evaluate(() => document.getElementById('btnOpen').click());
  await L.sleep(3000);
  const dw = L.xwindows().filter(w => !base.some(b => b.id === w.id))[0];
  const out = { dialog: dw };
  if (dw) {
    // 右下の種類のドロップダウン（ダイアログの右下から 約 (165, 70) 戻った所）
    L.xclick(dw.x + dw.w - 165, dw.y + dw.h - 70); await L.sleep(1500);
    out.popups = L.xwindows().filter(w => !base.some(b => b.id === w.id));
    L.xshot(`${L.SHOTS}/electron/open_dialog_types.png`);
    L.xkey('Escape'); await L.sleep(500); L.xkey('Escape'); await L.sleep(800);
  }
  // 軌跡を開く
  await L.openCard(p, 'open');
  await p.evaluate(() => document.getElementById('btnTraj').click());
  await L.sleep(3000);
  const dw2 = L.xwindows().filter(w => !base.some(b => b.id === w.id))[0];
  if (dw2) { L.xclick(dw2.x + dw2.w - 165, dw2.y + dw2.h - 70); await L.sleep(1500); L.xshot(`${L.SHOTS}/electron/traj_dialog_types.png`); L.xkey('Escape'); await L.sleep(500); L.xkey('Escape'); await L.sleep(800); }
  console.log(JSON.stringify(out, null, 1));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
