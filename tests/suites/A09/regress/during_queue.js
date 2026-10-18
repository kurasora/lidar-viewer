// 読み込みの順番待ちの確認: 3 つのファイルを一度に選ぶ（1 つ目が読み込み後に別スレッドで失敗する場合など）
//   node during_queue.js [--electron] [--out=結果.jsonl] <1つ目> <2つ目> <3つ目>
//   見るもの: 一覧の名前と点数が正しく対応しているか（取り違え）、知らせ、点の間隔、点のクリック（座標）が動くか
const { launch, openFiles, phases } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const files = argv.filter(a => !a.startsWith('--')).map(f => path.resolve(f));

(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page } = ctx;
  const res = { test: 'during_queue', app: ctx.electron ? 'electron' : 'chromium', files: files.map(f => [path.basename(f), fs.statSync(f).size]) };
  try {
    if (opt('cap')) await ctx.setCap(opt('cap'));
    const o = await openFiles(ctx, files, { timeout: 1500000, quietMs: 4000 });
    // 全部そろうまで少し待つ（2 本並行になった場合、片方が後から来る）
    await page.waitForTimeout(5000);
    const perf = await ctx.perf();
    const ph = phases(perf, o.tStart);
    res.t = ph.t; res.workerErrors = ph.workerErrors; res.statMsgs = ph.statMsgs;
    res.loadSent = perf.sent.filter(x => x[1] === 'load').map(x => [Math.round(x[0] - o.tStart), x[2]]);
    res.loadedMsgs = perf.msgs.filter(x => x[1] === 'loaded').map(x => [Math.round(x[0] - o.tStart), x[4], x[5]]);
    res.final = await page.evaluate(() => ({ files: window.__pcd.S.files.map(f => ({ id: f.id, name: f.name, n: f.n, total: f.total, size: f.size, spacing: f.spacing === undefined ? 'undefined' : f.spacing })), msg: document.getElementById('statMsg').textContent, isErr: !!document.getElementById('statMsg').style.color, info: document.getElementById('info').innerText.slice(0, 400), list: [...document.querySelectorAll('#fileList li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()) }));
    // 1 つ目のファイルだけ表示して、画面の中央の点をクリック（座標）
    await page.evaluate(() => { const S = window.__pcd.S; S.files.forEach((f, i) => { f.visible = i === 0; f.points.visible = i === 0; }); });
    const box = await page.evaluate(() => { const c = window.__pcd.renderer.domElement.getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height / 2]; });
    res.pick = await page.evaluate(async ([x, y]) => { try { const h = await Promise.race([window.__pcd.pickAt(x, y), new Promise((_, rej) => setTimeout(() => rej(new Error('20 秒で返らない')), 20000))]); return { ok: true, hit: !!h, msg: document.getElementById('statMsg').textContent }; } catch (e) { return { ok: false, err: e.message, msg: document.getElementById('statMsg').textContent }; } }, box);
    res.errors = ctx.errors.concat(perf.errors).slice(0, 10);
    if (opt('shot')) await page.screenshot({ path: opt('shot') });
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
