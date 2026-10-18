// 画面（メインスレッド）とワーカーの CPU プロファイルを取りながらファイルを開き、自分の時間（self time）の多い関数を出す
//   node prof_load.js [--cap=N] [--electron] [--save=dir] <ファイル>...
const { launch, openFiles, phases } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const files = argv.filter(a => !a.startsWith('--')).map(f => path.resolve(f));

function summarize(profile, top = 25) {
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas; const samples = profile.samples;
  for (let i = 0; i < samples.length; i++) {
    const n = byId.get(samples[i]); const d = dt[i] || 0;
    const cf = n.callFrame; const key = `${cf.functionName || '(anon)'} ${path.basename(cf.url || '')}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`;
    self.set(key, (self.get(key) || 0) + d);
  }
  const tot = [...self.values()].reduce((a, b) => a + b, 0);
  return { totalMs: Math.round(tot / 1000), top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => [k, Math.round(v / 1000)]) };
}

(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page, cdp, wsend } = ctx;
  if (opt('cap')) await ctx.setCap(opt('cap'));
  await page.waitForTimeout(500);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
  await wsend('Profiler.enable'); await wsend('Profiler.setSamplingInterval', { interval: 500 }); await wsend('Profiler.start');
  const { tStart, st } = await openFiles(ctx, files);
  const perf = await ctx.perf();
  const ph = phases(perf, tStart);
  const pm = await cdp.send('Profiler.stop');
  const pwk = await wsend('Profiler.stop', {}, 60000);
  const out = { files: files.map(f => path.basename(f)), t: ph.t, longTasks: ph.longTasks, main: summarize(pm.profile), worker: pwk && pwk.profile ? summarize(pwk.profile) : pwk };
  if (opt('save')) { fs.mkdirSync(opt('save'), { recursive: true }); fs.writeFileSync(path.join(opt('save'), 'main.cpuprofile'), JSON.stringify(pm.profile)); if (pwk && pwk.profile) fs.writeFileSync(path.join(opt('save'), 'worker.cpuprofile'), JSON.stringify(pwk.profile)); }
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
  process.exit(0);
})();
