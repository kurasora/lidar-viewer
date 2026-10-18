// 生の点群を含む大きな rosbag2（約 320 MB）を「軌跡を開く」で開く: かかる時間と、メモリ（画面のプロセス）の山
'use strict';
const L = require('./lib.js');
const fs = require('fs'), path = require('path');
function rssTree(root) {
  const info = {};
  for (const x of fs.readdirSync('/proc')) { if (!/^\d+$/.test(x)) continue; try { const st = fs.readFileSync(`/proc/${x}/stat`, 'utf8'); const pp = +st.slice(st.lastIndexOf(')') + 2).split(' ')[1]; const cmd = fs.readFileSync(`/proc/${x}/cmdline`, 'utf8'); const rss = +(fs.readFileSync(`/proc/${x}/status`, 'utf8').match(/VmRSS:\s+(\d+)/) || [0, 0])[1]; info[x] = { pp, cmd, rss }; } catch (e) { } }
  let ren = 0, all = info[root] ? info[root].rss : 0;
  const walk = pid => { for (const [c, v] of Object.entries(info)) if (v.pp === pid) { all += v.rss; if (/--type=renderer/.test(v.cmd)) ren += v.rss; walk(+c); } };
  walk(root); return { renderer: Math.round(ren / 1024), all: Math.round(all / 1024) };
}
(async () => {
  const { app, p, errors } = await L.launch('c7b');
  const mainPid = await app.evaluate(() => process.pid);
  const dir = L.F + '/bigbag';
  const f = fs.readdirSync(dir).find(n => n.endsWith('.mcap'));
  const size = fs.statSync(path.join(dir, f)).size;
  const base = rssTree(mainPid);
  let peak = { ...base };
  const iv = setInterval(() => { const r = rssTree(mainPid); if (r.renderer > peak.renderer) peak.renderer = r.renderer; if (r.all > peak.all) peak.all = r.all; }, 200);
  const t0 = Date.now();
  const st = await L.open(p, [path.join(dir, f)], { input: '#trajInput', wait: 300000 });
  clearInterval(iv);
  L.log({ file: f, sizeMB: Math.round(size / 1e6), ms: Date.now() - t0, msg: st.msg, trajs: st.trajs, base, peak, after: rssTree(mainPid), errors: errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e)).slice(0, 5) });
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
