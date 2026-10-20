// 大きなファイル・解凍爆弾の試験: 読み込みの時間、Chromium の全プロセスの RSS の最大、画面が固まった最長の時間（longtask）
//   使い方: node perf_probe.js [ファイル名の絞り込み]   （data/big/ のファイルを 1 つずつ。bigmem で動かす）
//   出力: 1 ファイル 1 行の JSON
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path');
const BIG = path.join(__dirname, 'data', 'big');
const filt = new RegExp(process.argv[2] || '.');
const files = fs.existsSync(BIG) ? fs.readdirSync(BIG).filter(f => filt.test(f)).sort() : [];

function rssTree(root) {
  const kids = {}, rss = {};
  for (const p of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(p)) continue;
    try {
      const s = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const r = s.slice(s.lastIndexOf(')') + 2).split(' ');
      (kids[r[1]] ||= []).push(p);
      rss[p] = Number(fs.readFileSync(`/proc/${p}/statm`, 'utf8').split(' ')[1]) * 4096;
    } catch (e) { /* 消えたプロセス */ }
  }
  let tot = 0; const st = [String(root)];
  while (st.length) { const x = st.pop(); for (const c of kids[x] || []) { tot += rss[c] || 0; st.push(c); } }
  return tot;
}

(async () => {
  for (const f of files) {
    const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    let crashed = false; p.on('crash', () => { crashed = true; });
    const errors = []; p.on('pageerror', e => errors.push(e.message.slice(0, 200)));
    await p.goto('http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html');
    await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
    await p.evaluate(() => { window.__long = 0; window.__longN = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__long = Math.max(window.__long, e.duration); window.__longN++; } }).observe({ entryTypes: ['longtask'] }); });
    const base = rssTree(process.pid);
    let peak = base;
    const timer = setInterval(() => { peak = Math.max(peak, rssTree(process.pid)); }, 200);
    const t0 = Date.now();
    await p.setInputFiles('#fileInput', path.join(BIG, f));
    let last = '', since = Date.now(), timedOut = false;
    while (!crashed) {
      let s;
      try { s = await p.evaluate(() => JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, document.getElementById('statMsg').textContent])); } catch (e) { crashed = true; break; }
      if (s !== last) { last = s; since = Date.now(); }
      if (JSON.parse(s)[0] && Date.now() - since > 2000) break;
      if (Date.now() - t0 > 900000) { timedOut = true; break; }
      await new Promise(r => setTimeout(r, 300));
    }
    clearInterval(timer);
    let r = {};
    if (!crashed) r = await p.evaluate(() => ({ files: window.__pcd.S.files.map(x => ({ n: x.n, total: x.total, fmt: x.header.data, note: x.header.note })), msg: document.getElementById('statMsg').textContent, longestTaskMs: Math.round(window.__long), longTasks: window.__longN })).catch(e => ({ err: e.message }));
    console.log(JSON.stringify({ file: f, sizeMB: +(fs.statSync(path.join(BIG, f)).size / 1048576).toFixed(1), ms: Date.now() - t0, timedOut, crashed, baseMB: Math.round(base / 1048576), peakMB: Math.round(peak / 1048576), ...r, errors }));
    await b.close().catch(() => {});
  }
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
