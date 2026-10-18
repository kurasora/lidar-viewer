// 色分けのモードごとに、最後のファイルを閉じたあとに出る知らせを記録する（「閉じたあとに的外れな知らせが出ない」の確認）
//   node field_close.js [--electron] [--out=結果.jsonl] <値の欄と色を持つファイル（LAS など）>
const { launch, openFiles } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const file = path.resolve(argv.filter(a => !a.startsWith('--'))[0]);
(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page } = ctx;
  const res = { test: 'field_close', file: path.basename(file), rows: [] };
  try {
    for (const mode of ['field', 'rgb', 'height', 'single']) {
      await openFiles(ctx, [file], { quietMs: 1500 });
      await page.evaluate(m => { const s = document.getElementById('colorMode'); s.value = m; s.dispatchEvent(new Event('change')); }, mode);
      await page.waitForTimeout(1500);
      await page.evaluate(() => { document.getElementById('statMsg').textContent = ''; });
      await ctx.resetPerf();
      await ctx.closeAll();
      await page.waitForTimeout(1500);
      const perf = await ctx.perf();
      res.rows.push({ mode, afterClose: await page.evaluate(() => ({ msg: document.getElementById('statMsg').textContent, colorMode: document.getElementById('colorMode').value })), statMsgs: perf.statMsgs.map(x => x[1]) });
    }
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
