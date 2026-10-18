// メモリの足りない PC をまねる（故障注入）: 起動したあと、画面（renderer）か GPU のプロセスの RLIMIT_DATA を
// 「今の使用量 + headroom MB」に絞ってから、ファイルを開く。確保に失敗したときに何が起こるか（知らせ・落ちる・固まる）を記録する
//   node oom_inject.js [--electron] [--target=renderer|gpu] [--headroom=MB] [--cap=N] [--shot=写真.png] [--after=小さなファイル] [--out=結果.jsonl] <ファイル>...
//   ※ Windows はページファイルを含めた「確約の上限」を超えると確保に失敗する。Linux の RLIMIT_DATA はそれに近い（プロセスごと）
//   ※ Linux の既定（overcommit）では確保は通り、使ったときに OOM killer がプロセスを殺す。それは --kill で画面のプロセスを SIGKILL してまねる
const { launch, openFiles, phases, descendants, kindOf, MB } = require('./lib.js');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const argv = process.argv.slice(2);
const opt = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const files = argv.filter(a => !a.startsWith('--')).map(f => path.resolve(f));
const target = opt('target') || 'renderer';
const vmData = pid => { const m = /VmData:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8')); return m ? +m[1] * 1024 : 0; };
const rss = pid => { try { return +fs.readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1] * 4096; } catch (e) { return 0; } };

(async () => {
  const ctx = await launch({ electron: argv.includes('--electron') });
  const { page } = ctx;
  const res = { test: 'oom_inject', app: ctx.electron ? 'electron' : 'chromium', target, files: files.map(f => path.basename(f)), headroomMB: +(opt('headroom') || 0) };
  try {
    if (opt('cap')) await ctx.setCap(opt('cap'));
    await page.waitForTimeout(1000);
    const pids = descendants(process.pid).filter(p => kindOf(p) === target);
    const pid = pids.sort((a, b) => rss(b) - rss(a))[0];
    res.pid = pid;
    if (argv.includes('--kill')) {
      // OOM killer のまね: 読み込みを始めてから kill-after 秒後に画面のプロセスを SIGKILL
      const ka = +(opt('kill-after') || 3);
      setTimeout(() => { try { process.kill(pid, 'SIGKILL'); res.killedAt = ka; } catch (e) { res.killErr = e.message; } }, ka * 1000);
    } else {
      const lim = vmData(pid) + res.headroomMB * 1048576;
      res.vmDataMB = MB(vmData(pid)); res.limitMB = MB(lim);
      cp.execFileSync('prlimit', ['--pid', String(pid), `--data=${lim}:${lim}`]);
    }
    await ctx.resetPerf();
    // 途中経過（最後に受けた別スレッドの知らせ・進み具合）を覚えておく（落ちたあとに分かるように）
    res.trail = [];
    const o = await openFiles(ctx, files, { timeout: +(opt('timeout') || 600000), onTick: st => { if (st.lastWorker || st.prog) { const k = JSON.stringify([st.lastWorker && st.lastWorker[1], st.lastWorker && st.lastWorker[2], st.prog, st.msg]); if (!res.trail.length || res.trail[res.trail.length - 1].k !== k) res.trail.push({ t: Math.round(st.now || 0), k, w: st.lastWorker, prog: st.prog, msg: st.msg }); } } });
    res.end = o.st;
    const tmo = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    const perf = ctx.crash.at ? null : await tmo(ctx.perf(), 30000).catch(e => null);
    if (perf) { const ph = phases(perf, o.tStart); res.t = ph.t; res.workerErrors = ph.workerErrors; res.statMsgs = ph.statMsgs; res.pageErrors = perf.errors; }
    res.errors = ctx.errors.slice(0, 20);
    res.alive = fs.existsSync(`/proc/${pid}`);
    res.state = ctx.crash.at ? { crashed: true } : await tmo(page.evaluate(() => ({ files: window.__pcd.S.files.map(f => ({ name: f.name, n: f.n, total: f.total, spacing: f.spacing })), msg: document.getElementById('statMsg').textContent, isErr: !!document.getElementById('statMsg').style.color, progressHidden: document.getElementById('progress').hidden, progressText: document.getElementById('progressText').textContent, gl: (() => { const gl = window.__pcd.renderer.getContext(); return { lost: gl.isContextLost(), err: gl.getError() }; })() })), 30000).catch(e => ({ evalError: e.message }));
    // 失敗のあとに、画面と別スレッドに何が残っているか（失敗したファイルの点群が別スレッドに残っていないか）
    if (!ctx.crash.at) { await ctx.gc(); res.heapAfterFail = await tmo(ctx.heap(), 30000).catch(e => ({ err: e.message })); res.memAfterFail = ctx.mem.nowMB(); }
    if (opt('shot') && !ctx.crash.at) await page.screenshot({ path: opt('shot'), timeout: 15000 }).catch(e => { res.shotErr = e.message; });
    if (ctx.app) {
      // Electron: 主プロセスから窓の様子を見る（画面のプロセスが落ちていても撮れる）
      res.electronWin = await ctx.app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return { windows: 0 }; const wc = w.webContents; let png = null; try { png = (await w.capturePage()).toPNG().toString('base64'); } catch (e) { png = null; } return { windows: BrowserWindow.getAllWindows().length, crashed: wc.isCrashed(), url: wc.getURL(), title: w.getTitle(), png }; }).catch(e => ({ err: e.message }));
      if (res.electronWin && res.electronWin.png && opt('shot')) { fs.writeFileSync(opt('shot').replace(/\.png$/, '_win.png'), Buffer.from(res.electronWin.png, 'base64')); }
      if (res.electronWin) delete res.electronWin.png;
    }
    // その後、小さなファイルなら開けるか（立ち直れるか）
    if (opt('after') && !res.state.evalError && !ctx.crash.at) {
      const o2 = await openFiles(ctx, [path.resolve(opt('after'))], { timeout: 120000 }).catch(e => ({ st: { error: e.message } }));
      res.after = { st: o2.st, files: await page.evaluate(() => window.__pcd.S.files.map(f => [f.name, f.n])).catch(e => e.message) };
    }
  } catch (e) { res.fatal = e.message; }
  await ctx.close();
  const line = JSON.stringify(res);
  console.log(line);
  if (opt('out')) fs.appendFileSync(opt('out'), line + '\n');
  process.exit(0);
})();
