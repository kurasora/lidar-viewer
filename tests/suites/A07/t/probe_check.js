// probe_check.js — 実機用の道具 probe_mid360.js を、にせ LiDAR で動かして確かめる（a072 から a071 のにせ LiDAR へ）
//   light node t/probe_check.js
'use strict';
const H = require('../lib/h.js');
const { check, sleep, ns, ip } = H;
const path = require('node:path');
(async () => {
  for (const reply of ['broadcast', 'unicast']) {
    const A = H.sim(ns(1), { ip: ip(1), sn: 'PROBE' + reply.toUpperCase().slice(0, 5) + '0001', reply, pattern: 'grid', rate: 100000, autoStart: { ip: ip(4), port: 56301 } });
    await A.waitFor(e => e.ev === 'ready');
    const P = H.spawnJson(ns(2), H.ENODE, [path.join(H.W, 'lib', 'probe_mid360.js'), '--stream', '3', '--types'], { env: { ELECTRON_RUN_AS_NODE: '1' }, name: 'probe' });
    const t = Date.now(); while (!P.exited && Date.now() - t < 40000) await sleep(200);
    let R = null; try { R = JSON.parse(P.raw.join('\n')); } catch (e) { R = { raw: P.raw.slice(0, 5), err: P.err.slice(0, 500) }; }
    const s1 = R.stream && R.stream[0];
    check(`J1-probe-${reply}`, R.detect && R.detect[0] && R.detect[0].replyIsBroadcast === (reply === 'broadcast') && R.before && R.before.pointcloud_host_ipcfg && s1 && s1.pts > 100000 && s1.crcBad === 0 && R.after && R.after.pointcloud_host_ipcfg.hostIp === ip(4),
      { detect: R.detect, before: R.before, stream: R.stream && R.stream.map(s => ({ type: s.type, ack: s.ack, ptsPerSec: s.ptsPerSec, crcBad: s.crcBad, udpLossPct: s.udpLossPct, types: s.types, dotNums: s.dotNums, sources: s.sources })), restored: R.restored, after: R.after, notes: R.notes });
    await A.kill(); await sleep(500);
  }
  H.save('probe_check');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
