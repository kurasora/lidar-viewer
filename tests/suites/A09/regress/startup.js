// 起動の速さと、何も開いていないときのメモリ（k 回起動して中央値）
//   node startup.js [--electron] [--k=5] [--out=結果.jsonl]
//   測るもの: ページの読み込み開始 → 画面の準備（window.__pcd）→ 別スレッドが最初の返事をするまで、の時間。何も開いていないときのプロセスごとのメモリ・JS ヒープ
const { launch, MB } = require('./lib.js');
const fs = require('fs');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const K = +(opt('k') || 5);
(async () => {
  const rows = [];
  for (let i = 0; i < K; i++) {
    const t0 = Date.now();
    const ctx = await launch({ electron: argv.includes('--electron') });
    const tReady = Date.now() - t0;
    const r = await ctx.page.evaluate(async () => {
      const nav = performance.getEntriesByType('navigation')[0];
      const t = performance.now();
      await window.__pcd.call({ type: 'pick', queries: [], clipMin: [0, 0, 0], clipMax: [0, 0, 0] });
      return { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), workerReplyAt: Math.round(performance.now()), workerRoundTrip: Math.round(performance.now() - t), scriptBytes: performance.getEntriesByType('resource').filter(e => /app\.js/.test(e.name)).map(e => e.decodedBodySize)[0] || null };
    });
    await ctx.page.waitForTimeout(1500);
    await ctx.gc();
    const mem = ctx.mem.nowMB();
    const heap = await ctx.heap();
    const gpu = ctx.app ? await ctx.app.evaluate(({ app }) => app.getGPUFeatureStatus()).catch(e => e.message) : null;
    const glInfo = await ctx.page.evaluate(() => { const gl = window.__pcd.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) }; }).catch(e => e.message);
    rows.push({ i, launchToReadyMs: tReady, ...r, mem, heap, appMetrics: await ctx.appMetrics(), gpuFeatureStatus: gpu, glInfo });
    await ctx.close();
  }
  const med = k => { const a = rows.map(r => r[k]).filter(v => v != null).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  const res = { test: 'startup', app: argv.includes('--electron') ? 'electron' : 'chromium', k: K, median: { launchToReadyMs: med('launchToReadyMs'), domContentLoaded: med('domContentLoaded'), workerReplyAt: med('workerReplyAt') }, rows };
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
