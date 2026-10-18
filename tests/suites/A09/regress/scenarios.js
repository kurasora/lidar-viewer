// 繰り返しの操作でメモリが戻るか（リーク）・時間が延びないかを見る
//   node scenarios.js <名前> [--electron] [--k=回数] [--out=結果.jsonl] <ファイル>
//   名前:
//     reopen  … 同じファイルを開いて閉じるを k 回
//     color   … 色の切り替え（値: 強度 → 分類 → GPS 時刻 → 高さ → RGB …）を k 回
//     measure … 距離の計測を 10 本引いて全部消す、を k 回
//     cmap    … 色の配色（turbo → viridis → rainbow → gray）を k 回
//     level   … 水平補正を k 回
//     pick    … 点のクリック（座標）を k 回（時間）
const { launch, openFiles, MB } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const pos = argv.filter(a => !a.startsWith('--'));
const name = pos[0];
const file = path.resolve(pos[1]);
const K = +(opt('k') || 20);

async function snap(ctx, extra = {}) {
  await ctx.gc();
  const h = await ctx.heap();
  const m = ctx.mem.nowMB();
  const r = await ctx.page.evaluate(() => { const i = window.__pcd.renderer.info; return { geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs ? i.programs.length : null, files: window.__pcd.S.files.length, overlay: window.__pcd.world.children.reduce((a, c) => a + c.children.length, 0) }; }).catch(e => ({ err: e.message }));
  return { mainUsed: h.main && h.main.used, mainAB: h.main && h.main.ab, wUsed: h.worker && h.worker.used, wAB: h.worker && h.worker.ab, rend: m && (m.rss.renderer), rendPss: m && m.pss.renderer, gpu: m && m.rss.gpu, gpuPss: m && m.pss.gpu, totalPss: m && m.totalPss, three: r, ...extra };
}
const sel = (page, id, v) => page.evaluate(([id, v]) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);

(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page } = ctx;
  const res = { test: 'scenario:' + name, app: ctx.electron ? 'electron' : 'chromium', file: path.basename(file), k: K, rows: [] };
  try {
    if (opt('cap')) await ctx.setCap(opt('cap'));
    await page.waitForTimeout(800);
    res.base = await snap(ctx);
    if (name !== 'reopen') { const o = await openFiles(ctx, [file]); res.loadMs = Math.round(o.st.now - o.tStart); res.loaded = await snap(ctx); }
    const cv = await page.evaluate(() => { const r = window.__pcd.renderer.domElement.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    for (let i = 0; i < K; i++) {
      const t = Date.now();
      if (name === 'reopen') {
        const o = await openFiles(ctx, [file]);
        const tl = Math.round(o.st.now - o.tStart);
        const loaded = ctx.mem.nowMB();
        await ctx.closeAll();
        await page.waitForTimeout(500);
        res.rows.push(await snap(ctx, { i, loadMs: tl, rendLoaded: loaded && loaded.rss.renderer, gpuLoaded: loaded && loaded.rss.gpu, msg: o.st.msg }));
      } else if (name === 'color') {
        for (const [mode, field] of [['field', 'intensity'], ['field', 'classification'], ['field', 'gps_time'], ['height', null], ['rgb', null]]) {
          if (field) await sel(page, 'fieldSel', field);
          await sel(page, 'colorMode', mode);
          await page.waitForFunction(f => !f || window.__pcd.S.files.every(x => x.fieldName === f), field, { timeout: 120000 }).catch(() => {});
          await page.waitForTimeout(400);
        }
        res.rows.push(await snap(ctx, { i, ms: Date.now() - t }));
      } else if (name === 'measure') {
        await page.evaluate(() => { const b = document.querySelector('[data-tool="measure"]'); if (!b.classList.contains('on')) b.click(); });
        for (let j = 0; j < 20; j++) {
          const x = cv[0] + cv[2] * (0.3 + 0.4 * ((j * 37) % 20) / 20), y = cv[1] + cv[3] * (0.35 + 0.3 * ((j * 13) % 20) / 20);
          await page.mouse.click(x, y);
          await page.waitForTimeout(150);
        }
        const nm = await page.evaluate(() => window.__pcd.S.measures.length);
        await page.evaluate(() => document.getElementById('btnMeasureClear').click());
        await page.evaluate(() => { const b = document.querySelector('[data-tool="measure"]'); if (b.classList.contains('on')) b.click(); });
        res.rows.push(await snap(ctx, { i, measures: nm, ms: Date.now() - t }));
      } else if (name === 'cmap') {
        for (const c of ['viridis', 'rainbow', 'gray', 'turbo']) { await sel(page, 'cmapSel', c); await page.waitForTimeout(100); }
        res.rows.push(await snap(ctx, { i, ms: Date.now() - t }));
      } else if (name === 'level') {
        const ms = await page.evaluate(async () => { const t = performance.now(); document.getElementById('btnLevel').click(); while (!/水平補正しました|できませんでした/.test(document.getElementById('statMsg').textContent)) await new Promise(r => setTimeout(r, 20)); const d = performance.now() - t; document.getElementById('statMsg').textContent = ''; return Math.round(d); });
        res.rows.push(await snap(ctx, { i, ms }));
      } else if (name === 'pick') {
        const ms = await page.evaluate(async ([x, y]) => { const t = performance.now(); const h = await window.__pcd.pickAt(x, y, true); return [Math.round(performance.now() - t), !!h]; }, [cv[0] + cv[2] * (0.3 + 0.4 * Math.random()), cv[1] + cv[3] * (0.3 + 0.4 * Math.random())]);
        res.rows.push({ i, ms: ms[0], hit: ms[1] });
      }
    }
    res.final = await snap(ctx);
    res.errors = ctx.errors.slice(0, 10);
    const perf = await ctx.perf(); res.pageErrors = perf.errors;
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
