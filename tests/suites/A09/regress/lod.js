// 操作中の間引き（LOD）がどの操作で効くか、1 回の描画の時間（gl.finish まで）と描いた点数を記録する
//   node lod.js [--electron] [--out=結果.jsonl] <ファイル>
//   操作: 左ドラッグで回転 / ホイールでズーム / 視点ボタン（アニメーション）/ 中心の印のドラッグ / 「間引かない」でのドラッグ
//   SwiftShader（CPU で描く）なので時間の絶対値は実機と違う。描いた点数と、間引きの有無による比を見る
const { launch, openFiles } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const file = path.resolve(argv.filter(a => !a.startsWith('--'))[0]);

(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page } = ctx;
  const res = { test: 'lod', app: ctx.electron ? 'electron' : 'chromium', file: path.basename(file), rows: {} };
  try {
    if (opt('cap')) await ctx.setCap(opt('cap'));
    const o = await openFiles(ctx, [file]);
    res.n = await page.evaluate(() => window.__pcd.S.files.reduce((a, f) => a + f.n, 0));
    res.lod = await page.evaluate(() => +document.getElementById('lodSel').value);
    await page.evaluate(() => {
      const r = window.__pcd.renderer, orig = r.render.bind(r), gl = r.getContext();
      window.__renders = [];
      const px = new Uint8Array(4);
      r.render = (s, c) => { const t = performance.now(); orig(s, c); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__renders.push([t, performance.now() - t, window.__pcd.S.files.reduce((a, f) => a + (f.points.visible ? Math.min(f.n, f.geom.drawRange.count) : 0), 0)]); };
    });
    await page.waitForTimeout(1500);
    const box = await page.evaluate(() => { const c = window.__pcd.renderer.domElement.getBoundingClientRect(); return { x: c.left + c.width / 2 - 220, y: c.top + c.height / 2 + 140, w: c.width, h: c.height }; }); // 中心の印（回転の中心）を避けた所でドラッグ
    const run = async (label, fn) => {
      await page.evaluate(() => { window.__renders = []; });
      const t = Date.now();
      await fn();
      await page.waitForTimeout(1200); // 操作が終わったあとの描画も入れる
      const r = await page.evaluate(() => window.__renders);
      const during = r.slice(0, -1);
      const ms = during.map(x => x[1]);
      res.rows[label] = { wallMs: Date.now() - t, renders: r.length, meanRenderMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null, maxRenderMs: Math.round(Math.max(0, ...ms)), drawn: [...new Set(during.map(x => x[2]))].slice(0, 6), lastDrawn: r.length ? r[r.length - 1][2] : null };
    };
    // 1) 左ドラッグで回転（3 秒）
    await run('drag', async () => { await page.mouse.move(box.x, box.y); await page.mouse.down(); for (let i = 0; i < 30; i++) { await page.mouse.move(box.x + i * 6, box.y + i * 2); await page.waitForTimeout(100); } await page.mouse.up(); });
    // 2) ホイールでズーム（3 秒、30 回）
    await run('wheel', async () => { await page.mouse.move(box.x, box.y); for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, i < 15 ? -60 : 60); await page.waitForTimeout(100); } });
    // 3) 視点ボタン（アニメーション 420 ms）×3
    await run('viewButtons', async () => { for (const v of ['top', 'front', 'fit']) { await page.evaluate(v => document.querySelector(`[data-view="${v}"]`).click(), v); await page.waitForTimeout(900); } });
    // 4) 中心の印をドラッグ（点の上を滑らせる）
    await run('pivotDrag', async () => {
      const pv = await page.evaluate(() => { const r = document.getElementById('pivot').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, ok: r.width > 0 }; });
      if (!pv.ok) return;
      await page.mouse.move(pv.x, pv.y); await page.mouse.down();
      for (let i = 0; i < 20; i++) { await page.mouse.move(pv.x + i * 5, pv.y + i * 3); await page.waitForTimeout(100); }
      await page.mouse.up();
    });
    // 5) 「間引かない」にしてドラッグ
    await page.evaluate(() => { const s = document.getElementById('lodSel'); s.value = '0'; s.dispatchEvent(new Event('change')); });
    await run('dragNoLod', async () => { await page.mouse.move(box.x, box.y); await page.mouse.down(); for (let i = 0; i < 30; i++) { await page.mouse.move(box.x - i * 6, box.y - i * 2); await page.waitForTimeout(100); } await page.mouse.up(); });
    // 6) 描画 1 回の時間を、描く点数を変えて直接測る（同じ視点）
    res.direct = await page.evaluate(async () => {
      const S = window.__pcd.S, r = window.__pcd.renderer, gl = r.getContext(), scene = window.__pcd.world.parent, cam = window.__pcd.cam;
      const out = {};
      for (const ratio of [1, 0.5, 0.15, 0.05]) {
        for (const f of S.files) f.geom.setDrawRange(0, Math.ceil(f.n * ratio));
        const t = [];
        const px = new Uint8Array(4);
        for (let i = 0; i < 4; i++) { const a = performance.now(); r.render(scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); }
        t.sort((a, b) => a - b);
        out[ratio] = Math.round(t[1]);
      }
      for (const f of S.files) f.geom.setDrawRange(0, f.n);
      return out;
    });
    res.errors = ctx.errors.slice(0, 10);
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
