// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
// C12 使い勝手・表示の細かい確かめ
//   a) 情報のカードの「範囲」は点の本当の範囲か（自動水平補正を切って、期待値の分かっているサンプルで）
//   b) title（吹き出し）が付いた要素が残っていないか（仕様: 一切出さない）
//   c) いちばん小さい窓（900×600）でカードを全部開いたときの重なり
//   d) Electron で showOpenFilePicker が使えるか（使えないと、ファイルを選ぶ画面の種類が 1 行にまとまる）
'use strict';
const L = require('./lib.js');
(async () => {
  const { app, p, errors } = await L.launch('c12');
  const R = {};
  await p.evaluate(() => { document.getElementById('autoLevel').checked = false; });
  await L.open(p, ['/home/claude/pcd-viewer/sample/formats/cc_cloud.xyz']);
  R.a_info = await p.evaluate(() => [...document.querySelectorAll('#info dt')].map(dt => dt.textContent + ': ' + dt.nextElementSibling.textContent).filter(s => /範囲/.test(s)));
  R.a_expected = { min: [-4.3512, -4.6035, -0.5653], max: [28.6278, 6.1359, 3.8554] };
  R.a_trueFromPositions = await p.evaluate(() => { const f = window.__pcd.S.files[0], P = f.sample, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < (f.sample.length / 3); i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[3 * i + k]); hi[k] = Math.max(hi[k], P[3 * i + k]); } return { lo, hi }; });
  // b)
  for (const n of ['open', 'view', 'color', 'section', 'level', 'settings']) await p.click(`[data-open="${n}"]`);
  await p.click('[data-tool="measure"]');
  R.b_titles = await p.evaluate(() => [...document.querySelectorAll('[title], svg title')].map(e => e.outerHTML.slice(0, 80)));
  // c)
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(900, 600); });
  await L.sleep(800);
  R.c_layout = await p.evaluate(() => { const r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }; return { win: [innerWidth, innerHeight], pop: r(document.getElementById('pop')), dock: r(document.getElementById('dock')), tabs: [...document.querySelectorAll('#popStack .ptab')].map(r), hud: r(document.querySelector('.hud')) }; });
  await L.shot(p, 'c12_small_window');
  // d)
  R.d_picker = await p.evaluate(() => ({ hasShowOpenFilePicker: typeof window.showOpenFilePicker, top: window.top === window }));
  R.errors = errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e)).slice(0, 10);
  L.log(R);
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
