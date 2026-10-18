// compat.js — 旧版 PCD Viewer 0.2.0 の live.js（app:'pcd-viewer'）との互換: 旧→新・新→旧で見つけて見られるか、自分の配信が自分の一覧に出ないか
//   light node t/compat.js   （LiDAR=a071、配信元=a073、見る側=a072）
'use strict';
const H = require('../lib/h.js');
const { check, info, sleep, ns, ip } = H;
const path = require('node:path');
const PC = path.join(H.W, 'lib', 'livepc.js');
const OLD = path.join(H.W, 'old020', 'app', 'live.js'), NEW = '/home/claude/pcd-viewer/live.js';
const pc = (n, livejs) => H.spawnJson(n, H.ENODE, [PC], { env: { ELECTRON_RUN_AS_NODE: '1', LIVEJS: livejs }, name: 'pc@' + n });
async function ask(p, cmd, ev, ms = 8000) { const k = p.ev.length; p.send(cmd); const t = Date.now(); while (Date.now() - t < ms) { const e = p.ev.slice(k).find(x => x.ev === ev || x.ev === 'error'); if (e) return e; await sleep(50); } return null; }

(async () => {
  const A = H.sim(ns(1), { ip: ip(1), sn: 'COMPATLIDAR001', reply: 'broadcast', pattern: 'ring', rate: 50000 });
  await A.waitFor(e => e.ev === 'ready');
  for (const [sname, sjs, vname, vjs] of [['旧 0.2.0', OLD, '新 0.3.0', NEW], ['新 0.3.0', NEW, '旧 0.2.0', OLD]]) {
    const S = pc(ns(3), sjs), V = pc(ns(2), vjs);
    await S.waitFor(e => e.ev === 'ready', 10000); await V.waitFor(e => e.ev === 'ready', 10000); await sleep(2500);
    await ask(S, 'start COMPATLIDAR001', 'started'); await ask(S, 'share 1 1', 'share'); await sleep(2500);
    const vs = await ask(V, 'state', 'state'); const peer = vs.st.peers[0];
    const ss = await ask(S, 'state', 'state');
    if (peer) await ask(V, 'peer ' + peer.key, 'peer');
    await sleep(2500); const v2 = await ask(V, 'state', 'state');
    check(`F11-${sname}→${vname}`, !!peer && v2.pts > 10000, { peer, viewerPts: v2.pts, sharerSeesItself: ss.st.peers.length > 0 ? ss.st.peers : false });
    await ask(S, 'quit', 'bye'); await ask(V, 'quit', 'bye'); await S.kill(); await V.kill(); await sleep(1000);
  }
  H.save('compat');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
