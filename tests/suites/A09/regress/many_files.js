// 多数のファイルを一度に開く・全部閉じる（1 フレームごとの PCD を何百個も開くような使い方）
//   node many_files.js [--electron] [--limit=秒] [--out=結果.jsonl] <フォルダ> [個数]
//   測るもの: 全部が開くまでの時間、1 ファイルごとの間隔（後になるほど遅くなるか）、画面が固まった時間（長いタスク・フレームの間隔）、
//             全部閉じる時間、メモリ（開く前・開いた後・閉じた後）
const { launch, MB } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const pos = argv.filter(a => !a.startsWith('--'));
const dir = path.resolve(pos[0]);
const count = +(pos[1] || 1e9);
const files = fs.readdirSync(dir).filter(f => /\.(pcd|las|ply|xyz|txt)$/i.test(f)).sort().slice(0, count).map(f => path.join(dir, f));
const limitMs = +(opt('limit') || 1200) * 1000;

(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page, mem } = ctx;
  const res = { test: 'many_files', app: ctx.electron ? 'electron' : 'chromium', dir: path.basename(dir), count: files.length };
  try {
    await page.waitForTimeout(800);
    await ctx.gc();
    res.base = { mem: mem.nowMB(), heap: await ctx.heap() };
    mem.reset(); mem.start(500);
    await ctx.resetPerf();
    const t0 = await page.evaluate(() => performance.now());
    const w0 = Date.now();
    await page.setInputFiles('#fileInput', files);
    // 進み具合: 10 秒ごとに何個開いたか
    const progress = [];
    let n = 0;
    while (Date.now() - w0 < limitMs) {
      await page.waitForTimeout(1000);
      const s = await page.evaluate(() => ({ n: window.__pcd.S.files.length, hidden: document.getElementById('progress').hidden, now: performance.now() })).catch(e => ({ err: e.message }));
      if (s.err) { res.crash = s.err; break; }
      n = s.n;
      if (!progress.length || Date.now() - progress[progress.length - 1][0] >= 10000) progress.push([Date.now() - w0, n]);
      if (n >= files.length && s.hidden) break;
    }
    res.opened = n;
    res.openMs = Date.now() - w0;
    res.progress = progress;
    const perf = await ctx.perf();
    const at = (perf.filesAt || []).map(x => [Math.round(x[0] - t0), x[1]]);
    // 1 ファイルごとの間隔（最初の 10 個・最後の 10 個の平均）
    const gaps = []; for (let i = 1; i < at.length; i++) gaps.push(at[i][0] - at[i - 1][0]);
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
    res.perFileMs = { first10: avg(gaps.slice(0, 10)), last10: avg(gaps.slice(-10)), max: Math.max(0, ...gaps) };
    const lt = perf.longtasks.filter(x => x[0] >= t0);
    res.longTasks = { count: lt.length, totalMs: Math.round(lt.reduce((a, x) => a + x[1], 0)), maxMs: Math.round(Math.max(0, ...lt.map(x => x[1]))) };
    res.frames = { maxGap: Math.round(perf.frames.maxGap), gaps500: perf.frames.gaps500 };
    res.peak = mem.peaksMB();
    await ctx.gc();
    res.afterOpen = { mem: mem.nowMB(), heap: await ctx.heap(), points: await page.evaluate(() => window.__pcd.S.files.reduce((a, f) => a + f.n, 0)) };
    // 全部閉じる（× を 1 つずつ押す）
    await ctx.resetPerf();
    const c0 = Date.now();
    const closed = await page.evaluate(async lim => {
      const t = performance.now(); let k = 0, x;
      while ((x = document.querySelector('#fileList [data-act=remove]'))) { x.click(); k++; if (performance.now() - t > lim) break; }
      return { k, ms: Math.round(performance.now() - t), left: window.__pcd.S.files.length };
    }, limitMs);
    res.close = { ...closed, wallMs: Date.now() - c0 };
    await page.waitForTimeout(1500);
    await ctx.gc(); await page.waitForTimeout(1000); await ctx.gc();
    res.afterClose = { mem: mem.nowMB(), heap: await ctx.heap(), msg: await page.evaluate(() => document.getElementById('statMsg').textContent) };
    res.errors = ctx.errors.slice(0, 10).concat(perf.errors || []);
  } catch (e) { res.fatal = e.message; }
  mem.stop();
  await ctx.close();
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
