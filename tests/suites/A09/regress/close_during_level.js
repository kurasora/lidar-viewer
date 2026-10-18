// 読み込み直後（自動の水平補正の計算中）にファイルを閉じると、あとから届いた補正が何も開いていない画面や次のファイルに当たらないか
//   node close_during_level.js [--electron] [--out=結果.jsonl] <A（大きめ）> <B（小さい）>
//   1) A を開く（「開いたときに自動で水平にする」は既定のまま）→ 一覧に出たらすぐ × で閉じる
//   2) 「開いたときに自動で水平にする」を外して B を開く
//   3) B の表示に、A の水平補正（回転・床の高さ）が当たっていないか（world の行列が単位行列か）、知らせ・補正の結果欄を記録
const { launch, openFiles } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const [A, B] = argv.filter(a => !a.startsWith('--')).map(f => path.resolve(f));

(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page } = ctx;
  const res = { test: 'close_during_level', app: ctx.electron ? 'electron' : 'chromium', A: path.basename(A), B: path.basename(B) };
  const state = () => page.evaluate(() => ({ t: Math.round(performance.now()), files: window.__pcd.S.files.map(f => f.name), msg: document.getElementById('statMsg').textContent, levelResult: document.getElementById('levelResult').textContent, levelInfo: !!window.__pcd.S.levelInfo, identity: window.__pcd.world.matrix.equals(new window.__pcd.world.matrix.constructor()), m: window.__pcd.world.matrix.elements.map(v => +v.toFixed(3)) }));
  try {
    await ctx.resetPerf();
    await page.setInputFiles('#fileInput', [A]);
    await page.waitForFunction(() => window.__pcd.S.files.length >= 1, null, { timeout: 300000 });
    res.whenShown = await state();
    await page.evaluate(() => document.querySelector('#fileList [data-act=remove]').click());
    res.justAfterClose = await state();
    await page.waitForTimeout(8000);
    res.after8s = await state();
    await page.evaluate(() => { document.getElementById('autoLevel').checked = false; });
    await openFiles(ctx, [B], { quietMs: 2000 });
    await page.waitForTimeout(1500);
    res.afterB = await state();
    const perf = await ctx.perf();
    res.statMsgs = perf.statMsgs.map(x => [Math.round(x[0]), x[1], x[2]]);
    res.msgs = perf.msgs.filter(x => x[1] !== 'progress').map(x => [Math.round(x[0]), x[1], x[4]]);
    if (opt('shot')) await page.screenshot({ path: opt('shot') });
    res.errors = ctx.errors.concat(perf.errors).slice(0, 10);
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
