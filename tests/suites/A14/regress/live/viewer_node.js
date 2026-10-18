// LiDAR Viewer のライブ部分（live.js の Live）を Node で直接動かす: 探して、つないで、1 秒ごとに点数を数える
//   node viewer_node.js <秒> [startAfterSec=3]
'use strict';
const { Live } = require('/home/claude/pcd-viewer/live.js');
const secs = +(process.argv[2] || 10), startAfter = +(process.argv[3] || 3);
(async () => {
  const live = new Live();
  let pts = 0; live.on('points', b => { pts += b.n; });
  live.on('log', t => console.log(JSON.stringify({ who: 'viewer', log: t })));
  const st = await live.open();
  console.log(JSON.stringify({ who: 'viewer', openErrors: st.errors, nets: st.nets }));
  let t = 0;
  const iv = setInterval(async () => {
    t++;
    console.log(JSON.stringify({ who: 'viewer', t, ptsPerSec: pts, mode: live.mode, devices: live.state().devices.map(d => d.sn + '@' + d.ip) })); pts = 0;
    if (t === startAfter) {
      const d = live.state().devices[0];
      if (!d) console.log(JSON.stringify({ who: 'viewer', error: 'no device' }));
      else { try { await live.startLidar(d.sn); console.log(JSON.stringify({ who: 'viewer', started: d })); } catch (e) { console.log(JSON.stringify({ who: 'viewer', startError: e.message })); } }
    }
    if (t >= secs) { clearInterval(iv); live.close(); process.exit(0); }
  }, 1000);
})().catch(e => { console.log(JSON.stringify({ who: 'viewer', fatal: e.message })); process.exit(1); });
