// 読み込み中の操作（状態遷移）: 大きなファイル BIG を読み込んでいる最中に、
//   ①視点を回す（固まらないか） ②色の切り替え ③上限の変更 ④先に開いていた小さなファイル A を閉じる ⑤別の小さなファイル B を開く
// を行い、最後に一覧（名前・点数）が正しいか、知らせが的外れでないかを見る
//   node during_load.js [--electron] [--out=結果.jsonl] <BIG> <A> <B>
const { launch, openFiles, phases } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const [BIG, A, B] = argv.filter(a => !a.startsWith('--')).map(f => path.resolve(f));

(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page } = ctx;
  const res = { test: 'during_load', app: ctx.electron ? 'electron' : 'chromium', big: path.basename(BIG), steps: [] };
  const step = async (name, fn) => { const t = Date.now(); let r; try { r = await fn(); } catch (e) { r = { err: e.message }; } const s = await page.evaluate(() => ({ prog: document.getElementById('progress').hidden ? null : document.getElementById('progressText').textContent + ' ' + document.getElementById('progressBar').style.width, msg: document.getElementById('statMsg').textContent, files: window.__pcd.S.files.map(f => f.name) })).catch(e => ({ err: e.message })); res.steps.push({ name, ms: Date.now() - t, r, s }); };
  try {
    await openFiles(ctx, [A]);
    res.aInfo = await page.evaluate(() => window.__pcd.S.files.map(f => [f.name, f.n]));
    await ctx.resetPerf();
    const t0 = await page.evaluate(() => performance.now());
    await page.setInputFiles('#fileInput', [BIG]);
    // 読み込みが 10% を超えるまで待つ
    for (let i = 0; i < 600; i++) { const w = await page.evaluate(() => parseFloat(document.getElementById('progressBar').style.width) || 0); if (w >= 10) break; await page.waitForTimeout(200); }
    const box = await page.evaluate(() => { const c = window.__pcd.renderer.domElement.getBoundingClientRect(); return { x: c.left + c.width / 2 - 220, y: c.top + c.height / 2 + 140 }; }); // 中心の印を避ける
    await step('rotate', async () => {
      await page.evaluate(() => { window.__fr = []; const f = t => { window.__fr.push(t); if (window.__fr.length < 2000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await page.mouse.move(box.x, box.y); await page.mouse.down();
      for (let i = 0; i < 20; i++) { await page.mouse.move(box.x + i * 8, box.y + i * 3); await page.waitForTimeout(100); }
      await page.mouse.up();
      return page.evaluate(() => { const f = window.__fr; let mx = 0; for (let i = 1; i < f.length; i++) mx = Math.max(mx, f[i] - f[i - 1]); return { frames: f.length, maxGapMs: Math.round(mx) }; });
    });
    await step('colorField', async () => { await page.evaluate(() => { const s = document.getElementById('colorMode'); s.value = 'field'; s.dispatchEvent(new Event('change')); }); await page.waitForTimeout(500); return page.evaluate(() => document.getElementById('colorMode').value); });
    await step('capChange', async () => { await ctx.setCap(10000000); return page.evaluate(() => document.getElementById('statMsg').textContent); });
    await step('closeA', async () => { await page.evaluate(() => { const x = document.querySelector('#fileList [data-act=remove]'); if (x) x.click(); }); await page.waitForTimeout(300); return page.evaluate(() => ({ offset: window.__pcd.S.offset })); });
    await step('openB', async () => { await page.setInputFiles('#fileInput', [B]); await page.waitForTimeout(300); return null; });
    // 全部終わるまで待つ
    const tEnd = Date.now() + 1200000;
    while (Date.now() < tEnd) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => ({ hidden: document.getElementById('progress').hidden, n: window.__pcd.S.files.length, last: window.__perf.msgs.length ? window.__perf.msgs[window.__perf.msgs.length - 1][0] : 0, now: performance.now() }));
      if (s.hidden && s.n >= 2 && s.now - s.last > 3000) break;
    }
    const perf = await ctx.perf();
    res.ph = phases(perf, t0);
    delete res.ph.bars;
    res.final = await page.evaluate(() => ({ files: window.__pcd.S.files.map(f => ({ name: f.name, n: f.n, total: f.total, size: f.size, spacing: f.spacing != null })), offset: window.__pcd.S.offset, msg: document.getElementById('statMsg').textContent, colorMode: document.getElementById('colorMode').value, cap: document.getElementById('capSel').value }));
    res.errors = ctx.errors.concat(perf.errors).slice(0, 10);
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
