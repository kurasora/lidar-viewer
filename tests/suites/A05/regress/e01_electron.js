// e01 Electron 固有（自分の netns の中で動かす）
//   窓の名前・最小の大きさ・F12・ページが置き換わらない（落としたとき・location・window.open）・再読み込みのキー・
//   ファイルを開く（ドロップ／種類の画面）・画像の保存・二重起動・窓を閉じたら終わる
//   heavy ip netns exec a051 xvfb-run -a -n 150 -s "-screen 0 1600x1000x24" node e01_electron.js
const L = require('./lib.js');
const D = L.DATA;
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const X = (...a) => { try { return execFileSync('python3', [L.W + '/regress/xtool.py', ...a], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: L.W + '/pylib' } }); } catch (e) { return 'ERR ' + e.message; } };

(async () => {
  const R = L.recorder('e01_electron');
  const UD = L.W + '/ud-e01';
  const { app, p, errors, close } = await L.electron({ userdata: UD });
  const info = await p.evaluate(() => ({ title: document.title, app: !!window.pcdApp, sofp: typeof window.showOpenFilePicker, top: window.top === window, url: location.href }));
  const win = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { title: w.getTitle(), min: w.getMinimumSize(), size: w.getSize(), menu: w.isMenuBarVisible() }; });
  R.ok('EL1 窓の名前は LiDAR Viewer・アプリ版の窓口（pcdApp）あり', info.title === 'LiDAR Viewer' && win.title === 'LiDAR Viewer' && info.app, { info, win });
  // ---- 最小の大きさ ----
  const sz = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(500, 400); return { size: w.getSize(), content: w.getContentSize(), min: w.getMinimumSize() }; });
  await p.waitForTimeout(800);
  const vp = await p.evaluate(() => [innerWidth, innerHeight]);
  R.ok('EL2 最小の大きさ 900×600（それより小さくできない）', sz.min[0] === 900 && sz.min[1] === 600 && sz.size[0] >= 900 && sz.size[1] >= 600, { ...sz, viewport: vp });
  await L.open(p, [`${D}/c_xyzi.pcd`]);
  for (const n of ['open', 'view', 'color', 'display', 'section', 'level']) await p.click(`[data-open="${n}"]`);
  await p.click('[data-tool="measure"]'); await p.waitForTimeout(900);
  const geo = await p.evaluate(() => { const r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }; return { pop: r(document.getElementById('pop')), dock: r(document.getElementById('dock')), hud: r(document.querySelector('.hud')), vw: innerWidth, vh: innerHeight }; });
  R.ok('EL3 最小の窓でカードを 7 枚重ねても、カード・ドックが窓の中に収まる', geo.pop[3] <= geo.dock[1] && geo.dock[2] <= geo.vw && geo.dock[0] >= 0, geo);
  await L.shot(p, 'e01_EL3_min_window');
  while (!(await p.isHidden('#pop'))) await p.click('#popClose');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await p.waitForTimeout(500);
  // ---- F12 ----
  await p.keyboard.press('F12'); await p.waitForTimeout(1500);
  const dev1 = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened());
  await p.keyboard.press('F12'); await p.waitForTimeout(1500);
  const dev2 = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened());
  R.ok('EL4 F12 で開発者ツールが開き、もう一度で閉じる', dev1 === true && dev2 === false, { dev1, dev2 });
  // ---- 再読み込み・開発者ツールのほかのキー（メニューがないので効かないはず） ----
  await p.evaluate(() => { window.__marker = 1; });
  for (const k of ['Control+r', 'F5', 'Control+Shift+r']) { await p.keyboard.press(k); await p.waitForTimeout(800); }
  const kept = await p.evaluate(() => window.__marker === 1 && window.__pcd.S.files.length === 1).catch(() => false);
  R.ok('EL5 Ctrl+R・F5 でページが読み直されない（開いた点群が消えない）', kept, kept);
  // ---- ページが置き換わらない ----
  const url0 = p.url();
  await p.evaluate(f => { location.href = 'file://' + f; }, `${D}/c_xyzi.pcd`).catch(() => {});
  await p.waitForTimeout(1500);
  const nav1 = await p.evaluate(() => ({ url: location.href, ok: !!window.__pcd && window.__marker === 1 })).catch(e => ({ err: e.message }));
  R.ok('EL6 ページからファイルの場所へ移ろうとしても（落としたときと同じ移動）ページが置き換わらない', nav1.ok && nav1.url === url0, nav1);
  await p.evaluate(() => { location.href = 'https://example.com/'; }).catch(() => {});
  await p.waitForTimeout(1500);
  const nav2 = await p.evaluate(() => ({ url: location.href, ok: !!window.__pcd })).catch(e => ({ err: e.message }));
  R.ok('EL7 外の URL へも移らない', nav2.ok && nav2.url === url0, nav2);
  const wo = await p.evaluate(() => { const w = window.open('https://example.com/'); return w === null; });
  await p.waitForTimeout(800);
  const nw = app.windows().length;
  R.ok('EL8 window.open で新しい窓が開かない', wo && nw === 1, { wo, windows: nw });
  // ---- ドロップ（DataTransfer）----
  await L.drop(p, [`${D}/c_xyz.pcd`]);
  let st = await L.state(p);
  R.ok('EL9 ドロップで開く（アプリ版）', st.files.length === 2, st.files.map(f => f.name));
  // ---- ファイルを開く画面（showOpenFilePicker がアプリ版で使えるか・Playwright で受けられるか） ----
  await p.evaluate(() => { window.__res = []; const o = window.showOpenFilePicker; if (o) window.showOpenFilePicker = function (x) { window.__res.push('called:' + x.types.length + ':' + x.types[0].description); const pr = o.call(window, x); pr.then(r => window.__res.push('ok ' + r.length), e => window.__res.push(e.name + ': ' + e.message)); return pr; }; });
  let fc = null; const onFc = f => { fc = f; }; p.on('filechooser', onFc);
  await L.card(p, 'open'); await p.click('#btnOpen'); await p.waitForTimeout(2500);
  const res1 = await p.evaluate(() => window.__res);
  R.ok('EL10 アプリ版の「点群を開く」は形式ごとの種類の画面（showOpenFilePicker）を使う', info.sofp === 'function' && info.top && res1.some(r => r.startsWith('called:34:')), { sofp: info.sofp, res1, filechooser: !!fc });
  if (fc) { await fc.setFiles([`${D}/c_label.pcd`]).catch(() => {}); await L.idle(p); }
  p.off('filechooser', onFc);
  st = await L.state(p);
  R.ok('EL11 その画面で選んだファイルが開く', st.files.some(f => f.name === 'c_label.pcd'), { files: st.files.map(f => f.name), res: await p.evaluate(() => window.__res) });
  // ---- ネイティブのダイアログ（Playwright が受けないとき）: X の画面写真で種類の欄を見る ----
  await p.evaluate(() => { window.__res = []; });
  await L.card(p, 'open'); await p.click('#btnOpen'); await p.waitForTimeout(4000);
  const wins = X('windows');
  X('shot', L.SHOTS + '/e01_native_open_dialog.png');
  console.log('X windows:\n' + wins);
  X('key', 'Escape'); await p.waitForTimeout(1500);
  const res3 = await p.evaluate(() => window.__res);
  R.ok('EL11b ネイティブのファイル選択の画面が出て、Esc で閉じると「取り消し」になる（代わりの画面は出ない）', /called:34/.test(res3.join()) && res3.some(r => /AbortError/.test(r)), { res3, windows: wins.trim().split('\n').length });
  // ---- 画像の保存（アプリ版のダウンロード） ----
  await app.evaluate(({ session }) => { global.__dl = []; session.defaultSession.on('will-download', (e, item) => { global.__dl.push({ name: item.getFilename(), mime: item.getMimeType(), path: item.getSavePath() }); item.cancel(); }); });
  await L.card(p, 'view'); await p.click('#btnShot'); await p.waitForTimeout(1500);
  const dl = await app.evaluate(() => global.__dl);
  const sm = (await L.msg(p)).text;
  R.ok('EL12 「画像を保存」でダウンロードが始まる（名前 pcd_…png）', dl.length === 1 && /^pcd_\d{8}_\d{6}\.png$/.test(dl[0].name), { dl, msg: sm });
  // ---- 二重起動 ----
  const t0 = Date.now();
  const second = await new Promise(res => {
    const c = spawn('/home/claude/pcd-viewer/node_modules/electron/dist/electron', ['--no-sandbox', '/home/claude/pcd-viewer/main.js'], { env: { ...process.env, PCDV_USERDATA: UD }, stdio: 'ignore' });
    const to = setTimeout(() => { c.kill('SIGKILL'); res({ timeout: true }); }, 15000);
    c.on('exit', (code, sig) => { clearTimeout(to); res({ code, sig, ms: Date.now() - t0 }); });
  });
  const still = await p.evaluate(() => window.__pcd.S.files.length).catch(() => -1);
  R.ok('EL15 同じ設定の置き場所で 2 つ目を起動すると、すぐ終わり、1 つ目はそのまま', !second.timeout && second.code === 0 && still >= 2 && app.windows().length === 1, { second, still });
  // ---- 窓を閉じたらアプリが終わる ----
  const proc = app.process();
  const exited = new Promise(res => { const to = setTimeout(() => res({ timeout: true }), 15000); proc.on('exit', (code, sig) => { clearTimeout(to); res({ code, sig }); }); });
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  const ex = await exited;
  R.ok('EL16 窓を閉じるとアプリが終わる（15 秒以内・終了コード 0）', !ex.timeout && ex.code === 0, ex);
  if (ex.timeout) await close().catch(() => {});
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
