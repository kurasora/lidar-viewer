// 1 つのファイルを開いて、時間・メモリ・進み具合・固まり時間を測る（1 回ごとにブラウザを起動し直す）
//   node perf_load.js [--electron] [--cap=N] [--label=名前] [--out=結果.jsonl] [--close] [--shot=写真.png] [--level=0|1] <ファイル> [<同時に選ぶファイル>...]
//   出力: 1 行の JSON（--out があれば追記も）
const { launch, openFiles, phases, MB } = require('./lib.js');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const flag = k => argv.includes('--' + k);
const files = argv.filter(a => !a.startsWith('--')).map(f => path.resolve(f));
if (!files.length) { console.error('usage: node perf_load.js [--electron] [--cap=N] <file>'); process.exit(2); }

(async () => {
  const ctx = await launch({ electron: flag('electron') });
  const { page, mem } = ctx;
  const res = { label: opt('label') || path.basename(files[0]), app: ctx.electron ? 'electron' : 'chromium', file: path.basename(files[0]), bytes: files.reduce((a, f) => a + fs.statSync(f).size, 0) };
  try {
    if (opt('cap')) await ctx.setCap(opt('cap'));
    if (opt('level') === '0') await page.evaluate(() => { document.getElementById('autoLevel').checked = false; });
    await page.waitForTimeout(800);
    await ctx.gc();
    res.cap = await page.evaluate(() => +document.getElementById('capSel').value);
    res.base = { mem: mem.nowMB(), heap: await ctx.heap(), appMetrics: await ctx.appMetrics() };
    mem.reset(); mem.start(200);
    // --live=ファイル: 途中経過（メモリの最大・進み具合）を 2 秒ごとに書く（途中で止められても残るように）
    let lastLive = 0;
    const onTick = opt('live') ? async st => { if (Date.now() - lastLive < 2000) return; lastLive = Date.now(); const pr = await page.evaluate(() => [document.getElementById('progressText').textContent, document.getElementById('progressBar').style.width, document.getElementById('statMsg').textContent]).catch(() => null); fs.writeFileSync(opt('live'), JSON.stringify({ t: Date.now() - t0, peak: mem.peaksMB(), now: mem.nowMB(), st, pr })); } : null;
    const t0 = Date.now();
    const { tStart, st } = await openFiles(ctx, files, { timeout: +(opt('timeout') || 1500000), onTick });
    res.wallMs = Date.now() - t0;
    res.end = st;
    mem.tick();
    const perf = await ctx.perf().catch(e => ({ msgs: [], prog: [], longtasks: [], frames: {}, statMsgs: [], errors: ['perf: ' + e.message] }));
    res.ph = phases(perf, tStart); res.tStart = Math.round(tStart);
    res.pageErrors = (perf.errors || []).concat(ctx.errors).slice(0, 20);
    res.peak = mem.peaksMB();
    res.hwm = Object.fromEntries(Object.entries(mem.hwm()).map(([k, v]) => [k, MB(v)]));
    res.appMetricsPeak = await ctx.appMetrics();
    if (!st.crashed) {
      res.result = await page.evaluate(() => {
        const S = window.__pcd.S;
        return { files: S.files.map(f => ({ name: f.name, n: f.n, total: f.total, sampled: f.sampled, fmt: f.header.data, fields: f.header.fields.join(' '), spacing: f.spacing })), offset: S.offset, msg: document.getElementById('statMsg').textContent, msgIsError: !!document.getElementById('statMsg').style.color, level: document.getElementById('levelResult').textContent };
      });
      if (flag('stats')) res.stats = await page.evaluate(() => {
        // 点の座標の統計と、x の 20 区間のヒストグラム（間引きの偏りを見る）
        const S = window.__pcd.S, f = S.files[0], o = S.offset || [0, 0, 0];
        if (!f) return null;
        const P = f.positions, n = f.n, m = [0, 0, 0], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = P[3 * i + k] + o[k]; m[k] += v; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
        const H = new Array(20).fill(0);
        for (let i = 0; i < n; i++) { const b = Math.min(19, Math.floor((P[3 * i] + o[0] - lo[0]) / ((hi[0] - lo[0]) || 1) * 20)); H[b]++; }
        return { n, mean: m.map(v => +(v / n).toFixed(4)), min: lo.map(v => +v.toFixed(4)), max: hi.map(v => +v.toFixed(4)), histX: H };
      });
      res.afterLoad = { mem: mem.nowMB(), heap: await ctx.heap() };
      await ctx.gc();
      res.afterLoadGc = { mem: mem.nowMB(), heap: await ctx.heap(), appMetrics: await ctx.appMetrics() };
      if (opt('shot')) await page.screenshot({ path: opt('shot') });
      if (flag('close')) {
        await ctx.closeAll();
        await page.waitForTimeout(1500);
        await ctx.gc(); await page.waitForTimeout(1500); await ctx.gc();
        res.afterClose = { mem: mem.nowMB(), heap: await ctx.heap(), appMetrics: await ctx.appMetrics() };
      }
    }
    // 速さ
    const n = res.result && res.result.files[0] ? res.result.files[0].total : null;
    const tl = res.ph.t.loaded;
    if (n && tl) res.speed = { MBps: +(res.bytes / 1048576 / (tl / 1000)).toFixed(1), MptsPerSec: +(n / 1e6 / (tl / 1000)).toFixed(2), readMBps: res.ph.t.readEnd ? +(res.bytes / 1048576 / (res.ph.t.readEnd / 1000)).toFixed(1) : null };
  } catch (e) {
    res.fatal = e.message;
  } finally {
    mem.stop();
    await ctx.close();
  }
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
