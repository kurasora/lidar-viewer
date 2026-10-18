// 閉じたあとに描き直しが起きているか（three.js の renderer.info.render.frame）と、描画の繰り返し（rAF）が生きているかを見る
//   node probe_render.js <ファイル>
const { launch, openFiles } = require('./lib.js');
const path = require('path');
const file = path.resolve(process.argv[2]);
(async () => {
  const ctx = await launch({});
  const { page } = ctx;
  const res = {};
  try {
    const frames = () => page.evaluate(() => ({ threeFrame: window.__pcd.renderer.info.render.frame, rafFrames: window.__perf.frames.n, files: window.__pcd.S.files.length, opaque: (() => { try { return null; } catch (e) { return null; } })() }));
    res.start = await frames();
    await openFiles(ctx, [file], { quietMs: 2000 });
    res.loaded = await frames();
    await page.waitForTimeout(1000);
    res.loaded1s = await frames();
    await ctx.closeAll();
    res.justClosed = await frames();
    await page.waitForTimeout(1500);
    res.closed1500 = await frames();
    await ctx.gc();
    res.heap = await ctx.heap();
    // 画面を少し動かす（描き直しを起こす）と放されるか
    await page.mouse.move(400, 300); await page.mouse.wheel(0, -100);
    await page.waitForTimeout(800);
    res.afterWheel = await frames();
    await ctx.gc();
    res.heapAfterWheel = await ctx.heap();
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  console.log(JSON.stringify(res));
  process.exit(0);
})();
