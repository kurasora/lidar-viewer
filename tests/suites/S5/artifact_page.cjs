// S5: 試作ページ（claude.ai のアーティファクト）で、今回の追加（設定・English・見た目）を確かめる
// 使い方: NOSAMPLE= node build.mjs artifact で dist-artifact/pcd-viewer.html を作り、http で配る（文字コードの指定を先頭に足す）
//   node tests/suites/S5/artifact_page.cjs <作業フォルダ> <http://…/pcd-viewer.html>
const pw = require(process.env.PW || '/opt/npm-tools/node_modules/playwright');
const path = require('node:path'), fs = require('node:fs'), http = require('node:http');
const W = path.resolve(process.argv[2] || '/tmp/s5art'); fs.mkdirSync(W, { recursive: true });
const URL_ = process.argv[3];
const res = []; const ok = (n, c, info = '') => { res.push([!!c, n]); console.log(`${c ? 'OK' : 'NG'}  [page] ${n}${info ? '  … ' + info : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const J = /[぀-ヿ㐀-鿿]/;
(async () => {
  const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
  // ---- 1. ふつうに開く
  let p = await b.newPage({ viewport: { width: 1280, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL_); await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 }); await wait(1000);
  const oc = async n => { if (await p.evaluate(n => document.querySelector('#pop').dataset.name !== n, n)) await p.click(`[data-open=${n}]`); await wait(200); };
  await oc('open');
  ok('サンプルのボタンがある', await p.isVisible('#btnSample'));
  await p.click('#btnSample'); await p.waitForFunction(() => window.__pcd.S.files.length > 0 && !document.querySelector('#progress:not([hidden])'), null, { timeout: 90000 }); await wait(2500);
  await oc('settings'); await p.click('#setTabEtc');
  const t0 = Date.now(); await p.selectOption('#langSel', 'en'); const dt = Date.now() - t0;
  ok('サンプルを開いたまま English に切り替えても固まらない（1 秒未満）', dt < 1000, dt + ' ms');
  const resp = await Promise.race([p.evaluate(() => 'ok'), wait(5000).then(() => 'TIMEOUT')]);
  ok('切り替えたあとも画面が反応する', resp === 'ok', resp);
  // 形式ごとのサンプルの一覧（試作ページだけにある）
  await oc('open');
  for (const s of await p.$$('.pop details summary')) if (await s.isVisible()) { await s.click().catch(() => {}); await wait(200); }
  const scan = () => p.evaluate(src => { const J = new RegExp(src), out = []; const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = it.nextNode(); n; n = it.nextNode()) { const e = n.parentElement; if (!e || e.closest('script,style,#langSel')) continue; if (J.test(n.data)) out.push(n.data.trim().slice(0, 100)); } return out; }, J.source);
  let left = await scan();
  ok('ファイルのカード（形式ごとのサンプルの一覧を含む）に日本語が残らない', left.length === 0, left.slice(0, 5).join(' / '));
  // 形式ごとのサンプルを 3 つ開いてみる
  const sbtn = await p.$$('#fmtSampleList button');
  // 全部の形式を順に開き、そのつど知らせとファイルの一覧を見る（形式ごとの知らせ・注意書きが英語か）
  let opened = 0; const leftAll = new Set();
  for (let i = 0; i < sbtn.length; i++) {
    const x = (await p.$$('#fmtSampleList button'))[i];
    if (!x || !(await x.isVisible())) { await oc('open'); continue; }
    await x.click().catch(() => {}); await p.waitForFunction(() => !document.querySelector('#progress:not([hidden])'), null, { timeout: 60000 }).catch(() => {}); await wait(1200); opened++;
    for (const s of await scan()) leftAll.add(s);
    if (opened % 8 === 0) { await p.evaluate(() => document.getElementById('btnCloseAll').click()); await wait(500); }
    await oc('open');
  }
  left = [...leftAll]; fs.writeFileSync(path.join(W, 'left_formats.txt'), left.join('\n'));
  ok(`形式ごとのサンプルを開いた知らせも英語（${opened} 個）`, opened > 0 && left.length === 0, left.slice(0, 5).join(' / '));
  // 画像を保存（試作ページは画像を出して右クリックで保存）
  await oc('open'); await p.click('#btnShot').catch(() => {}); await wait(1500);
  const shot = await p.evaluate(() => ({ open: !document.getElementById('shotView').hidden, alt: document.getElementById('shotImg').alt, hint: document.querySelector('#shotView .hint').textContent }));
  ok('画像の画面も英語', shot.open && !J.test(shot.alt + shot.hint), JSON.stringify(shot).slice(0, 200));
  await p.click('#btnShotClose').catch(() => {});
  ok('途中でエラーが出ない', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.close();
  // ---- 2. 設定を保存できない画面（枠の中で localStorage が使えない）
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(`<iframe sandbox="allow-scripts" src="${URL_}" style="width:1200px;height:780px;border:0"></iframe>`); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  p = await b.newPage({ viewport: { width: 1280, height: 820 } });
  const errs2 = []; p.on('pageerror', e => errs2.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/`); await wait(1000);
  const f = p.frames().find(x => x !== p.mainFrame());
  await f.waitForFunction(() => window.__pcd, null, { timeout: 60000 }); await wait(800);
  const ls = await f.evaluate(() => { try { localStorage.getItem('x'); return 'ok'; } catch (e) { return 'blocked'; } });
  await f.click('[data-open=settings]'); await f.click('#setTabEtc'); await f.selectOption('#langSel', 'en'); await wait(300);
  await f.click('#setTabCtrl'); await f.selectOption('#unitSel', 'cm'); await f.click('#setTabLook'); await f.click('[data-uitheme=light]');
  const st = await f.evaluate(() => [document.querySelector('[data-open=settings]').textContent.trim(), document.getElementById('unitSel').value, document.documentElement.dataset.ui].join());
  ok(`保存できない画面でも設定・English が効き、エラーにならない（localStorage: ${ls}）`, st === 'Settings,cm,light' && errs2.length === 0, st + ' ' + errs2.join('|'));
  await f.click('#setTabEtc'); await f.click('#btnResetSettings'); await wait(300);
  ok('保存できない画面でも「初めの状態に戻す」が効く', (await f.evaluate(() => [document.getElementById('unitSel').value, document.documentElement.dataset.ui, document.documentElement.lang].join())) === 'm,dark,ja');
  srv.close();
  await b.close();
  const n = res.filter(x => x[0]).length; console.log(`\n[page] ${n} / ${res.length} OK`);
  process.exit(0);
})().catch(e => { console.log('NG  試験が途中で止まりました: ' + e.message.split('\n')[0]); process.exit(1); });
