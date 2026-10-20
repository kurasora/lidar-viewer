// C6 悪い地区ツアー（1 回の起動でまとめて調べる）
//   a) カード: 0.4.2 からは 1 枚だけ（全部を順に開く → 最後の 1 枚だけ → × で閉じる）
//   b) 色を「反射」にしたまま、最後のファイルを閉じる／項目のないファイルだけ残す → 的外れな知らせが出ないか
//   c) Ctrl+C（文字のコピー）・Ctrl+S・Ctrl+A などで、ショートカットが動いてしまわないか
//   d) 水平補正の計算中にファイルを閉じる → あとで開いた別のファイルに古い補正が残らないか
//   f) 画像を保存（ダウンロードが始まるか）
'use strict';
const L = require('./lib.js');
const fs = require('fs');
(async () => {
  const { app, p, errors } = await L.launch('c6');
  const R = {};
  const msg = () => p.evaluate(() => document.getElementById('statMsg').textContent);
  // 0.4.2 からカードは 1 枚だけ（別のカードを開くと前のカードは閉じる。重ねた「つまみ」はない）
  const front = async n => { const top = await p.evaluate(() => document.getElementById('pop').dataset.name); if (top !== n) await p.click(`[data-open="${n}"]`); await L.sleep(250); };
  const pops = () => p.evaluate(() => ({ top: document.getElementById('pop').dataset.name || null, hidden: document.getElementById('pop').hidden, tabs: document.querySelectorAll('#popStack .ptab').length }));
  // ---- a) カード: 順に開くと最後の 1 枚だけが出る。× で閉じると何も出ない（距離の道具が × のあとどうなるかも記録する）
  await L.open(p, [L.F + '/liosam/GlobalMap.pcd']);
  for (const n of ['open', 'view', 'color', 'section', 'level', 'settings']) await p.click(`[data-open="${n}"]`);
  R.a_afterOpenAll = await pops();
  await p.click('[data-tool="measure"]'); await L.sleep(300);
  R.a_afterMeasure = await pops();
  await p.click('#popClose'); await L.sleep(300);
  R.a_afterClose = await pops();
  R.a_measureToolAfterClose = await p.evaluate(() => window.__pcd.S.tools.measure);
  await p.click('[data-open="open"]'); await L.sleep(300);
  R.a_afterOpenAgain = await pops();
  await L.shot(p, 'c6_a_cards');
  // 全部閉じる
  for (let i = 0; i < 10; i++) { const n = await p.evaluate(() => { const e = document.getElementById('pop'); return e.hidden ? null : e.dataset.name; }); if (!n) break; await p.click('#popClose'); await L.sleep(150); }
  L.log({ part: 'a', ...R });
  // ---- b) 色「反射」で閉じる
  await front('color');
  await p.click('#colorBasic [data-val="field"]'); await L.sleep(500);
  R.b_colorMode = (await L.state(p)).colorMode;
  await p.evaluate(() => document.getElementById('statMsg').textContent = '');
  await front('open');
  await p.click('#fileList [data-act=remove]'); await L.sleep(800);
  R.b_msgAfterCloseLast = await msg();
  // 項目のあるファイル＋項目のないファイル（xyz だけ）→ 反射で色分け → 項目のある方を閉じる
  await L.open(p, [L.F + '/liosam/GlobalMap.pcd']);
  await L.open(p, ['/home/claude/pcd-viewer/sample/formats/cc_cloud.xyz']);
  R.b_files = (await L.state(p)).files.map(f => f.name + ':' + f.fields.join(' '));
  await front('color');
  await p.click('#colorBasic [data-val="field"]'); await L.sleep(500);
  await p.evaluate(() => document.getElementById('statMsg').textContent = '');
  await front('open');
  await p.click('#fileList li:first-child [data-act=remove]'); await L.sleep(800);
  R.b_msgAfterCloseFieldFile = await msg();
  R.b_colorModeAfter = (await L.state(p)).colorMode;
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
  for (let i = 0; i < 10; i++) { const n = await p.evaluate(() => document.getElementById('pop').dataset.name); if (!n) break; await p.click('#popClose'); await L.sleep(150); }
  L.log({ part: 'b', ...R });
  // ---- c) ショートカット
  await L.open(p, [L.F + '/liosam/GlobalMap.pcd']);
  await p.click('[data-tool="info"]');
  const r = await p.evaluate(() => { const b = window.__pcd.renderer.domElement.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  // 何かの点を選んで、吹き出しの座標を選択してコピー（Ctrl+C）
  let picked = null;
  for (const [dx, dy] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [60, 60]]) { await L.click(p, { x: r.x + dx, y: r.y + dy }); await L.sleep(700); if (!(await p.evaluate(() => !document.querySelector('.pcall.pin.sel')))) { picked = [dx, dy]; break; } }
  R.c_picked = picked;
  const ceil0 = (await L.state(p)).hideCeil;
  await p.evaluate(() => { const s = window.getSelection(); s.removeAllRanges(); const rg = document.createRange(); rg.selectNodeContents((document.querySelector('.pcall.pin.sel .pc-box') || document.createElement('div'))); s.addRange(rg); });
  await p.keyboard.press('Control+c'); await L.sleep(300);
  R.c_ctrlC = { hideCeilBefore: ceil0, hideCeilAfter: (await L.state(p)).hideCeil, msg: await msg(), clipboard: await app.evaluate(({ clipboard }) => clipboard.readText()).catch(e => 'ERR ' + e.message) };
  const camBefore = await p.evaluate(() => window.__pcd.cam.position.toArray().map(v => +v.toFixed(2)));
  await p.keyboard.press('Control+s'); await L.sleep(800);
  R.c_ctrlS_camMoved = JSON.stringify(camBefore) !== JSON.stringify(await p.evaluate(() => window.__pcd.cam.position.toArray().map(v => +v.toFixed(2))));
  const projBefore = await p.evaluate(() => document.getElementById('btnProj').textContent);
  await p.keyboard.press('Control+p'); await L.sleep(300);
  R.c_ctrlP = { before: projBefore, after: await p.evaluate(() => document.getElementById('btnProj').textContent) };
  await p.keyboard.press('Control+m'); await L.sleep(300);
  R.c_ctrlM_tools = await p.evaluate(() => ({ ...window.__pcd.S.tools }));
  L.log({ part: 'c', ...R });
  // ---- d) 水平補正の計算中にファイルを閉じる
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
  await p.evaluate(() => { const c = document.getElementById('autoLevel'); c.checked = false; });
  await L.open(p, [L.F + '/fastlio/scans.pcd']);
  R.d_matrixAfterOpenNoAuto = await p.evaluate(() => Array.from(window.__pcd.world.matrix.elements).map(v => +v.toFixed(3)));
  await p.evaluate(() => { document.getElementById('btnLevel').click(); setTimeout(() => document.querySelector('#fileList [data-act=remove]').click(), 50); });
  await L.sleep(8000);
  R.d_afterRemove = await p.evaluate(() => ({ levelInfo: !!window.__pcd.S.levelInfo, msg: document.getElementById('statMsg').textContent, levelText: document.getElementById('levelResult').textContent, matrixIdentity: window.__pcd.world.matrix.elements.every((v, i) => Math.abs(v - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]) < 1e-9) }));
  await L.open(p, ['/home/claude/pcd-viewer/sample/map.laz']);
  R.d_nextFile = await p.evaluate(() => ({ levelInfo: !!window.__pcd.S.levelInfo, levelText: document.getElementById('levelResult').textContent, matrixIdentity: window.__pcd.world.matrix.elements.every((v, i) => Math.abs(v - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]) < 1e-9) }));
  await L.shot(p, 'c6_d_stale_level');
  await p.evaluate(() => { const c = document.getElementById('autoLevel'); c.checked = true; });
  L.log({ part: 'd', ...R });
  // ---- f) 画像を保存
  await app.evaluate(({ session }) => { global.__dl = []; session.defaultSession.on('will-download', (e, item) => { global.__dl.push(item.getFilename()); item.setSavePath('/dev/null'); }); });
  await front('open'); await p.click('#btnShot'); await L.sleep(1500); // 0.4.1 から「画像を保存」はファイルのカード
  R.f_downloads = await app.evaluate(() => global.__dl);
  R.f_msg = await msg();
  R.errors = errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e));
  L.log(R);
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
