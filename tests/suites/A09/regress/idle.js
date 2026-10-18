// 何も操作していないときに CPU を使い続けていないか（描き直しが止まっているか）
//   node idle.js [--electron] [--out=結果.jsonl] [<ファイル>]
//   ファイルなし・ファイルあり（落ち着いて 5 秒後）で、10 秒間の CPU 使用率（画面・GPU のプロセス）と three.js の描画回数を測る
const { launch, openFiles, descendants, kindOf } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const file = argv.filter(a => !a.startsWith('--'))[0];
const HZ = 100;
const cpuOf = pid => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const r = s.slice(s.lastIndexOf(')') + 2).split(' '); return (+r[11] + +r[12]) / HZ; } catch (e) { return 0; } };
async function measure(ctx, sec = 10) {
  const pids = descendants(process.pid).map(p => [p, kindOf(p)]).filter(([, k]) => k === 'renderer' || k === 'gpu' || k === 'browser');
  const c0 = pids.map(([p]) => cpuOf(p));
  const f0 = await ctx.page.evaluate(() => window.__pcd.renderer.info.render.frame);
  await new Promise(r => setTimeout(r, sec * 1000));
  const c1 = pids.map(([p]) => cpuOf(p));
  const f1 = await ctx.page.evaluate(() => window.__pcd.renderer.info.render.frame);
  const by = {};
  pids.forEach(([p, k], i) => { by[k] = +((by[k] || 0) + (c1[i] - c0[i]) / sec * 100).toFixed(1); });
  return { cpuPercent: by, appRenders: f1 - f0, sec };
}
(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const res = { test: 'idle', app: ctx.electron ? 'electron' : 'chromium', file: file ? path.basename(file) : null };
  try {
    await ctx.page.waitForTimeout(3000);
    res.empty = await measure(ctx);
    if (file) {
      await openFiles(ctx, [path.resolve(file)]);
      await ctx.page.waitForTimeout(5000);
      res.loaded = await measure(ctx);
    }
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
