// S5: English と、今回の追加（設定・見た目・中心の移動）の影響を、English のときにも確かめる
// 使い方（Xvfb の :99）:
//   開発 version:  node build.mjs && DISPLAY=:99 node tests/suites/S5/english_ui.cjs <作業フォルダ>
//   製品 version:  EXE=release/linux-unpacked/lidar-viewer DISPLAY=:99 node tests/suites/S5/english_ui.cjs <作業フォルダ>
//     （製品 version は fuse で --inspect が使えないので、--remote-debugging-port から画面だけを操作する）
const pw = require(process.env.PW || '/opt/npm-tools/node_modules/playwright');
const path = require('node:path'), fs = require('node:fs'), cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const W = path.resolve(process.argv[2] || '/tmp/s5en'); fs.mkdirSync(path.join(W, 'shots'), { recursive: true });
const TAG = process.env.EXE ? 'pkg' : 'dev';
const UD = path.join(W, 'ud-' + TAG); fs.rmSync(UD, { recursive: true, force: true });
const res = []; const ok = (n, c, info = '') => { res.push([!!c, n]); console.log(`${c ? 'OK' : 'NG'}  [${TAG}] ${n}${info ? '  … ' + info : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const J = /[぀-ヿ㐀-鿿]/;
// 開けない・壊れたファイル（知らせの英語を見る）
const BAD = [
  ['bad.ply', 'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nend_header\n1\n'],
  ['empty.pcd', '# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 0\nHEIGHT 1\nPOINTS 0\nDATA ascii\n'],
  ['scan.rdb', 'xx'], ['rec.db3', 'SQLite format 3\0'], ['noext', 'abc'], ['broken.las', 'LASFxx'], ['words.txt', 'hello world\nfoo bar\n'],
  ['traj_as_cloud.mcap', '\x89MCAP0\r\n'], ['bin.dxf', 'AutoCAD Binary DXF\r\n'], ['x.wrl', '#VRML V2.0'],
];

async function start() {
  if (!process.env.EXE) {
    const app = await pw._electron.launch({ executablePath: require(path.join(ROOT, 'node_modules/electron')), args: [ROOT, '--no-sandbox', '--user-data-dir=' + UD], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
    const p = await app.firstWindow();
    return { app, p, close: () => app.close() };
  }
  const PORT = 9631;
  const child = cp.spawn(path.resolve(ROOT, process.env.EXE), ['--no-sandbox', '--remote-debugging-port=' + PORT, '--user-data-dir=' + UD], { env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' }, stdio: 'ignore' });
  process.on('exit', () => { try { child.kill('SIGKILL'); } catch (e) { /* もう終わっている */ } });
  let br; for (let i = 0; i < 60 && !br; i++) { try { br = await pw.chromium.connectOverCDP('http://127.0.0.1:' + PORT); } catch (e) { await wait(500); } }
  let p; for (let i = 0; i < 60 && !p; i++) { p = br.contexts().flatMap(c => c.pages()).find(x => /index\.html/.test(x.url())); if (!p) await wait(500); }
  return { app: null, p, close: async () => { child.kill('SIGTERM'); await wait(800); } };
}

(async () => {
  let { app, p, close } = await start();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Electron Security/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 }); await wait(800);
  const $v = (f, a) => p.evaluate(f, a);
  const oc = async n => { if (await $v(n => document.querySelector('#pop').dataset.name !== n, n)) await p.click(`[data-open=${n}]`); await wait(200); };
  const left = new Map();
  const scan = async tag => {
    const r = await $v(src => {
      const J = new RegExp(src), out = [];
      const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = it.nextNode(); n; n = it.nextNode()) { const e = n.parentElement; if (!e || e.closest('script,style') || e.closest('#langSel')) continue; if (J.test(n.data)) out.push(n.data.trim().slice(0, 140)); }
      for (const e of document.querySelectorAll('[aria-label],[alt],[placeholder]')) for (const a of ['aria-label', 'alt', 'placeholder']) { const v = e.getAttribute(a); if (v && J.test(v)) out.push('@' + a + ': ' + v); }
      return out;
    }, J.source);
    for (const s of r) if (!left.has(s)) left.set(s, tag);
  };
  // はみ出し: カード・ドックの中で、文字が枠からあふれていないか
  const overflow = async tag => $v(tag => {
    const out = [];
    const pop = document.getElementById('pop');
    if (!pop.hidden && pop.scrollWidth > pop.clientWidth + 1) out.push(`${tag}: カードが横にあふれる ${pop.scrollWidth}>${pop.clientWidth}`);
    for (const e of [...pop.querySelectorAll('button, label, .row > *, .hint, h2, h3, summary, select, li, dd, dt, td, th, span')]) {
      if (!e.offsetParent || e.closest('.files .sub') || e.closest('table')) continue;
      const cs = getComputedStyle(e);
      if (cs.overflow === 'visible' && cs.whiteSpace !== 'nowrap') continue;
      if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0) out.push(`${tag}: 「${(e.textContent || '').trim().slice(0, 40)}」が切れる ${e.scrollWidth}>${e.clientWidth}`);
    }
    const dock = document.getElementById('dock').getBoundingClientRect();
    if (dock.left < 0 || dock.right > innerWidth) out.push(`${tag}: ドックが画面からはみ出す`);
    for (const b of document.querySelectorAll('#dock button')) if (b.scrollWidth > b.clientWidth + 1) out.push(`${tag}: ドックの「${b.textContent.trim()}」が切れる`);
    return out;
  }, tag);
  const over = [];

  // ---- 1. 切り替え（何も開いていないとき）
  await oc('settings'); await p.click('#setTabEtc');
  let t0 = Date.now(); await p.selectOption('#langSel', 'en'); const tSwitch = Date.now() - t0;
  ok('English に切り替えるのが速い（1 秒未満）', tSwitch < 1000, tSwitch + ' ms');
  await scan('start');
  for (const t of ['setTabLook', 'setTabPerf', 'setTabCtrl', 'setTabEtc']) { await p.click('#' + t); await wait(120); await scan(t); over.push(...await overflow('設定/' + t)); }
  // ---- 2. ファイルを選ぶ画面の種類の名前
  const types = await $v(async () => { let got = null; const o = window.showOpenFilePicker; window.showOpenFilePicker = async opt => { got = opt; throw Object.assign(new Error('x'), { name: 'AbortError' }); }; return { o: !!o, got: null, wait: true }; });
  if (types.o) {
    await oc('open'); await p.click('#btnOpen'); await wait(300);
    const d = await $v(() => null);
    const desc = await p.evaluate(async () => new Promise(r => { const o = window.showOpenFilePicker; window.showOpenFilePicker = async opt => { r(opt.types.map(t => t.description)); throw Object.assign(new Error('x'), { name: 'AbortError' }); }; document.getElementById('btnOpen').click(); setTimeout(() => r(null), 2000); }));
    ok('ファイルを選ぶ画面の種類の名前が英語', Array.isArray(desc) && desc.length > 20 && !desc.some(s => J.test(s)) && desc[0] === 'All supported formats', desc ? desc.slice(0, 3).join(' / ') : 'null');
  }
  // ---- 3. 読み込み中に切り替え → 終わったら英語のまま
  await oc('settings'); await p.click('#setTabEtc'); await p.selectOption('#langSel', 'ja'); await wait(200);
  const lp = p.setInputFiles('#fileInput', path.join(ROOT, 'sample/map.laz'));
  await wait(150); await p.selectOption('#langSel', 'en');
  await lp; await p.waitForFunction(() => window.__pcd.S.files.length && !document.querySelector('#progress:not([hidden])'), null, { timeout: 60000 }); await wait(2500);
  await scan('読み込み中に切り替え');
  ok('読み込み中に English にしても、開き終わり・知らせが英語', (await $v(() => window.__pcd.S.files.length)) === 1 && !J.test(await $v(() => document.getElementById('statMsg').textContent)), await $v(() => document.getElementById('statMsg').textContent));
  // ---- 4. 全部のカード・タブ・はみ出し
  await p.setInputFiles('#trajInput', path.join(ROOT, 'sample/trajectory.txt')); await wait(2500);
  for (const c of ['open', 'view', 'color', 'section', 'level']) {
    await oc(c); await scan(c); over.push(...await overflow(c));
    for (const tb of await p.$$('.pop [role=tab]')) if (await tb.isVisible()) { await tb.click(); await wait(150); await scan(c + '/tab'); over.push(...await overflow(c + '/tab')); }
  }
  await oc('open'); for (const s of await p.$$('.pop details summary')) if (await s.isVisible()) { await s.click().catch(() => {}); await wait(200); } await scan('ファイルの情報'); over.push(...await overflow('ファイルの情報'));
  await oc('view'); await p.$eval('#trajPos', e => { e.value = 500; e.dispatchEvent(new Event('input', { bubbles: true })); }).catch(() => {}); await wait(300); await scan('軌跡に沿って');
  await oc('level'); await p.click('#btnLevel'); await wait(3000); await scan('補正'); await p.click('#btnLevelReset').catch(() => {}); await wait(1500); await scan('補正を戻す');
  await oc('section'); for (const b of await p.$$('.secui .axes3 button')) if (await b.isVisible()) { await b.click().catch(() => {}); await wait(400); await scan('断面'); await b.click().catch(() => {}); await wait(200); }
  await oc('color'); for (const b of await p.$$('.pop button[role=radio], .ctiles button')) if (await b.isVisible()) { await b.click({ timeout: 2000 }).catch(() => {}); await wait(250); await scan('色'); }
  await p.click('#btnCeil').catch(() => {}); await wait(400); await scan('天井');
  // ---- 5. 座標・距離（英語の単位の表示、モード中の中心の移動）
  await p.keyboard.press('Escape'); await oc('settings'); await p.click('#setTabCtrl'); await p.selectOption('#unitSel', 'mm');
  const r = await $v(() => { const b = window.__pcd.renderer.domElement.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  const findPt = async (skip = []) => { for (let gy = 0.3; gy < 0.8; gy += 0.05) for (let gx = 0.3; gx < 0.85; gx += 0.03) { const x = r.left + r.width * gx, y = r.top + r.height * gy; if (skip.some(q => Math.hypot(q.x - x, q.y - y) < 60)) continue; if (await $v(([x, y]) => document.elementFromPoint(x, y) === window.__pcd.renderer.domElement && window.__pcd.pickAt(x, y, true).then(h => !!h), [x, y])) return { x, y }; } return null; };
  await p.click('[data-tool=info]'); await wait(200);
  const a1 = await findPt(); await p.mouse.click(a1.x, a1.y); await wait(500);
  ok('座標のカードの単位が英語（Unit mm）', /^Unit mm · (leveled|original) coordinates$/.test(await $v(() => document.getElementById('pinUnit').textContent)), await $v(() => document.getElementById('pinUnit').textContent));
  const pv = await $v(() => { const e = document.getElementById('pivot').getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2 }; });
  const t1 = await $v(() => window.__pcd.controlsTarget()); const dst = await findPt([a1, pv]);
  await p.mouse.move(pv.x, pv.y); await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(pv.x + (dst.x - pv.x) * i / 10, pv.y + (dst.y - pv.y) * i / 10); await wait(50); } await wait(300); await p.mouse.up(); await wait(600);
  const t2 = await $v(() => window.__pcd.controlsTarget());
  ok('English でも、座標のモード中に中心を動かせる', Math.hypot(...t1.map((v, i) => v - t2[i])) > 0.05 && (await $v(() => window.__pcd.S.pins.length)) === 1);
  ok('中心を動かした知らせが英語', /^Moved the rotation center to \(/.test(await $v(() => document.getElementById('statMsg').textContent)), await $v(() => document.getElementById('statMsg').textContent));
  await scan('座標'); await oc('info').catch(() => {});
  await p.click('[data-tool=info]'); await p.click('[data-tool=measure]'); await wait(200);
  const b1 = await findPt(), b2 = await findPt([b1]); await p.mouse.click(b1.x, b1.y); await wait(400); await scan('距離 1 点目'); await p.mouse.click(b2.x, b2.y); await wait(500);
  ok('距離のカードの単位が英語（Unit mm）', (await $v(() => document.getElementById('measUnit').textContent)) === 'Unit mm');
  await scan('距離'); over.push(...await overflow('距離'));
  await p.click('[data-tool=measure]'); await wait(200);
  const shotJa = await $v(src => { const J = new RegExp(src); const got = []; const P = CanvasRenderingContext2D.prototype, f = P.fillText; P.fillText = function (t, ...a) { got.push(String(t)); return f.call(this, t, ...a); }; try { window.__pcd.shotCanvas(); } finally { P.fillText = f; } return got.filter(t => J.test(t)); }, J.source);
  // 描く直前に訳されるので、記録した元の文が訳せるかを、画面の文字と同じ仕組みで確かめる（置いた文字が訳されるのを読む）
  const shotLeft = await $v(async ([list, src]) => { const J = new RegExp(src); const box = document.createElement('div'); box.hidden = true; document.body.append(box); for (const s of list) { const d = document.createElement('div'); d.textContent = s; box.append(d); } await new Promise(r => setTimeout(r, 100)); const out = [...box.children].map(d => d.textContent).filter(s => J.test(s)); box.remove(); return out; }, [shotJa, J.source]);
  ok('保存する画像の文字に日本語が残らない', shotLeft.length === 0, shotJa.length + ' 個の文 → 残り: ' + shotLeft.join(' / '));
  await p.screenshot({ path: path.join(W, `shots/${TAG}_en_pins.png`) });
  // ---- 6. 開けないファイルの知らせ
  for (const [name, body] of BAD) { await p.setInputFiles('#fileInput', { name, mimeType: 'application/octet-stream', buffer: Buffer.from(body, 'binary') }); await wait(1500); await scan('開けない ' + name); }
  await oc('open'); await scan('開けないファイルの一覧'); over.push(...await overflow('開けないファイルの一覧'));
  const errList = await $v(() => document.getElementById('loadErrors').innerText);
  ok('開けなかったファイルの理由が英語で出る', /Files that could not be opened/.test(errList) && !J.test(errList), errList.replace(/\s+/g, ' ').slice(0, 300));
  await p.screenshot({ path: path.join(W, `shots/${TAG}_en_errors.png`) });
  // ---- 7. 画面の色「明るい」・狭い窓
  await oc('settings'); await p.click('#setTabLook'); await p.click('[data-uitheme=light]'); await wait(200);
  for (const c of ['settings', 'open', 'view', 'color', 'section', 'level']) { await oc(c); await wait(150); await p.screenshot({ path: path.join(W, `shots/${TAG}_en_light_${c}.png`), clip: { x: 0, y: 0, width: 400, height: 720 } }); }
  await oc('settings'); await p.click('#setTabLook'); await p.click('[data-uitheme=dark]');
  await p.setViewportSize({ width: 900, height: 600 }).catch(() => {});
  if (process.env.EXE) await $v(() => null);
  await wait(400);
  for (const c of ['settings', 'open', 'view', 'color', 'section', 'level']) { await oc(c); over.push(...await overflow('900×600 ' + c)); for (const tb of await p.$$('.pop [role=tab]')) if (await tb.isVisible()) { await tb.click(); await wait(100); over.push(...await overflow('900×600 ' + c + '/tab')); } }
  await p.screenshot({ path: path.join(W, `shots/${TAG}_en_900.png`) });
  await p.setViewportSize({ width: 1280, height: 820 }).catch(() => {});
  ok('English の文字がカード・ドックからあふれない（1280×820・900×600）', over.length === 0, [...new Set(over)].slice(0, 8).join(' | '));
  // ---- 8. 動かしたときの重さ（English と日本語で比べる）
  const orbit = async () => { await p.keyboard.press('Escape'); await $v(() => document.getElementById('popClose').click()); const c = await $v(() => { const c = window.__pcd.renderer.domElement, b = c.getBoundingClientRect(); for (let gy = 0.15; gy < 0.85; gy += 0.05) for (let gx = 0.55; gx < 0.95; gx += 0.04) { const x = b.left + b.width * gx, y = b.top + b.height * gy; if (document.elementFromPoint(x, y) === c && document.elementFromPoint(x - 200, y) === c) return { x, y }; } return { x: b.left + b.width * 0.8, y: b.top + b.height * 0.2 }; });
    await $v(() => { window.__fr = []; let last = performance.now(); const tick = t => { window.__fr.push(t - last); last = t; if (window.__fr.length < 400) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    const s = Date.now(); await p.mouse.move(c.x, c.y); await p.mouse.down(); for (let i = 0; i < 60; i++) await p.mouse.move(c.x - i * 3, c.y + (i % 10)); await p.mouse.up(); const d = Date.now() - s;
    const fr = await $v(() => { const f = window.__fr.slice(2).sort((a, b) => a - b); return f.length ? f[Math.floor(f.length * 0.9)] : 0; });
    return { ms: d, p90: +fr.toFixed(1) };
  };
  const en = await orbit();
  await oc('settings'); await p.click('#setTabEtc'); await p.selectOption('#langSel', 'ja'); await wait(300);
  const ja = await orbit();
  ok('English でも動かしたときの重さは日本語と同じくらい（1.5 倍以内）', en.ms < ja.ms * 1.5 + 300, `English ${JSON.stringify(en)} / 日本語 ${JSON.stringify(ja)}`);
  // ---- 9. 日本語に戻すと、全部日本語に戻る
  const back = await $v(src => { const J = new RegExp(src); const it = document.createTreeWalker(document.getElementById('dock'), NodeFilter.SHOW_TEXT); const t = []; for (let n = it.nextNode(); n; n = it.nextNode()) if (n.data.trim()) t.push(n.data.trim()); return t.join(','); }, J.source);
  ok('日本語に戻すと、ドックも日本語', back === 'ファイル,座標,距離,表示,色,断面,補正,設定', back);
  await oc('settings'); await p.click('#setTabEtc'); await p.selectOption('#langSel', 'en'); await wait(200);
  console.log('残った日本語:'); for (const [s, t] of left) console.log(`   [${t}] ${s}`);
  ok('どの場面でも画面に日本語が残らない', left.size === 0, left.size + ' 件');
  ok('途中でエラーが出ない', errs.length === 0, errs.slice(0, 3).join(' | '));
  // ---- 10. 主プロセスの言葉（開発 version だけ: 画面が落ちたときの知らせ）
  if (app) {
    await app.evaluate(({ dialog }) => { global.__dlg = null; dialog.showMessageBox = async (w, o) => { global.__dlg = o; return { response: 0 }; }; });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
    await wait(2500);
    const dlg = await app.evaluate(() => global.__dlg);
    ok('画面が落ちたときの知らせも英語', dlg && dlg.message === 'The view stopped' && /^The view process ended/.test(dlg.detail) && dlg.buttons.join() === 'Reload,Quit', JSON.stringify(dlg));
    await wait(3000);
    const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript("document.querySelector('[data-open=settings]').textContent.trim()"));
    ok('読み込み直したあとも English のまま', after === 'Settings', after);
  }
  await close();
  const n = res.filter(x => x[0]).length; console.log(`\n[${TAG}] ${n} / ${res.length} OK`);
  fs.writeFileSync(path.join(W, `result_${TAG}.json`), JSON.stringify({ res, left: [...left], over }, null, 1));
  process.exit(0);
})().catch(e => { console.log('NG  試験が途中で止まりました: ' + e.message.split('\n')[0]); process.exit(1); });
