// livepc.js — live.js の Live を 1 台の「PC」として動かし、標準入力の命令で操作する（A07）。enode lib/livepc.js
//   命令: state / start <SN> / stop / share <0|1> [step] / peer <key> / quit   → 1 行 1 JSON で結果
'use strict';
const L = require(process.env.LIVEJS || require('node:path').join(process.env.APPDIR || '/home/claude/pcd-viewer', 'live.js'));
const out = x => process.stdout.write(JSON.stringify(x) + '\n');
const live = new L.Live();
let pts = 0, batches = 0; live.on('points', b => { pts += b.n; batches++; });
live.on('log', t => out({ ev: 'log', t }));
const uncaught = []; process.on('uncaughtException', e => { uncaught.push(e.message); out({ ev: 'uncaught', msg: e.message }); });
(async () => {
  const s = await live.open(); out({ ev: 'open', errors: s.errors, nets: s.nets });
  require('node:readline').createInterface({ input: process.stdin }).on('line', async l => {
    const [c, a, b] = l.trim().split(/\s+/);
    try {
      if (c === 'state') out({ ev: 'state', st: live.state(), pts, batches, stat: live.lidar.stat });
      else if (c === 'start') { const st = await live.startLidar(a); out({ ev: 'started', source: st.source }); }
      else if (c === 'stop') { await live.stopAll(); out({ ev: 'stopped' }); }
      else if (c === 'share') { const st = await live.setShare(a === '1', +(b || 1)); out({ ev: 'share', sharing: st.sharing, port: live.sharer.port }); }
      else if (c === 'peer') { const st = await live.startPeer(a); out({ ev: 'peer', source: st.source }); }
      else if (c === 'mem') { const m = process.memoryUsage(); out({ ev: 'mem', rss: m.rss, ab: m.arrayBuffers, cpu: process.cpuUsage() }); }
      else if (c === 'quit') { live.close(); out({ ev: 'bye', uncaught }); setTimeout(() => process.exit(0), 200); }
    } catch (e) { out({ ev: 'error', cmd: c, msg: e.message }); }
  });
  out({ ev: 'ready' });
})();
