// Electron の窓まわり: 題名・アイコン・最小の大きさ・背景色（起動時の白い画面）・ズーム・画像の保存・ファイルを開く画面・修飾キー
//   heavy xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" node electron_misc.js
const L = require('./lib.js');
const { spawn } = require('child_process');
(async () => {
  const out = {};
  L.fs.mkdirSync(L.SHOTS + '/electron', { recursive: true });
  // 1) 起動直後の画面（Playwright を使わずに起動して、画面全体を続けて撮る）
  {
    const ud = L.W + '/ud-flash'; L.fs.mkdirSync(ud, { recursive: true });
    const c = spawn('/home/claude/pcd-viewer/node_modules/electron/dist/electron', ['--no-sandbox', L.APP + '/main.js'], { env: { ...process.env, PCDV_USERDATA: ud }, stdio: 'ignore' });
    const frames = [];
    const t0 = Date.now();
    for (let i = 0; i < 14; i++) {
      const f = `${L.SHOTS}/electron/startup_${String(i).padStart(2, '0')}.png`;
      try { L.xshot(f); frames.push({ ms: Date.now() - t0, f }); } catch (e) { /* まだ */ }
      await L.sleep(60);
    }
    c.kill(); await L.sleep(800);
    // 各フレームの、窓の中ほどの色（白いかどうか）
    const { execFileSync } = require('child_process');
    out.startup = frames.map(fr => {
      const px = execFileSync('python3', ['-c', `from PIL import Image\nim=Image.open('${fr.f}').convert('RGB')\nw,h=im.size\nimport collections\nc=collections.Counter(im.crop((100,100,900,600)).getdata()).most_common(1)[0]\nprint(c[0], c[1])`], { encoding: 'utf8' }).trim();
      return { ms: fr.ms, f: L.path.basename(fr.f), dominant: px };
    });
  }
  // 2) Playwright で起動
  const { app, p, errors, close } = await L.electron({ w: 1280, h: 800, name: 'misc' });
  out.win = await L.winInfo(app);
  out.docTitle = await p.title();
  out.icon = L.xicon('LiDAR Viewer', `${L.SHOTS}/electron/window_icon.png`);
  // 3) 最小の大きさ
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(500, 400));
  await L.sleep(400);
  out.afterSetSmall = await app.evaluate(({ BrowserWindow }) => ({ size: BrowserWindow.getAllWindows()[0].getSize(), content: BrowserWindow.getAllWindows()[0].getContentSize() }));
  out.innerAfterSmall = await p.evaluate(() => [innerWidth, innerHeight]);
  await L.setContentSize(app, 1280, 800); await L.sleep(300);
  // 4) ズーム（Ctrl + = / Ctrl + - / Ctrl + ホイール）
  const zf = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());
  const z0 = await zf();
  await p.keyboard.press('Control+Equal'); await p.keyboard.press('Control+Shift+Equal'); await p.keyboard.press('Control+Minus'); await L.sleep(300);
  const cb = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
  out.zoom = { before: z0, afterKeys: await zf() };
  // 5) 画像の保存（ダイアログが出る前に「保存しました」と出るか、保存名）
  await L.openFiles(p, [L.FILES + '/corr_intensity.pcd']);
  const dlP = app.evaluate(({ BrowserWindow }) => new Promise(res => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    wc.session.once('will-download', (e, item) => res({ filename: item.getFilename(), savePath: item.getSavePath(), mime: item.getMimeType() }));
    setTimeout(() => res(null), 8000);
  }));
  await L.openCard(p, 'view');
  const base = L.xwindows();
  await p.click('#btnShot');
  await L.sleep(300);
  out.saveMsgImmediately = await p.evaluate(() => document.getElementById('statMsg').textContent);
  out.download = await dlP;
  await L.sleep(2500);
  out.windowsAfterSave = L.xwindows().filter(w => !base.some(b => b.id === w.id));
  L.xshot(`${L.SHOTS}/electron/save_dialog.png`);
  // ダイアログを閉じる（取り消し）
  for (const w of out.windowsAfterSave) { L.xclick(w.x + w.w / 2, w.y + 20); }
  L.xkey('Escape'); await L.sleep(1200);
  out.windowsAfterEsc = L.xwindows().filter(w => !base.some(b => b.id === w.id)).length;
  out.saveMsgAfterCancel = await p.evaluate(() => document.getElementById('statMsg').textContent);
  // 6) ファイルを開く画面（形式の種類の並び）
  await L.closeCards(p); await L.openCard(p, 'open');
  const base2 = L.xwindows();
  await p.evaluate(() => document.getElementById('btnOpen').click());
  await L.sleep(3000);
  out.openDialogWindows = L.xwindows().filter(w => !base2.some(b => b.id === w.id));
  L.xshot(`${L.SHOTS}/electron/open_dialog.png`);
  // 種類の一覧を開いてみる（ダイアログの右下あたりのドロップダウン）
  const dw = out.openDialogWindows.find(w => !w.override) || out.openDialogWindows[0];
  if (dw) {
    out.openDialog = dw;
  }
  L.xkey('Escape'); await L.sleep(1000);
  out.windowsAfterOpenEsc = L.xwindows().filter(w => !base2.some(b => b.id === w.id)).length;
  out.errors = errors;
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  L.fs.writeFileSync(L.W + '/out/electron_misc.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await close().catch(() => {});
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
