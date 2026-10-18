// hw_check.js — 実機用の hw_live.js を、にせ LiDAR 2 台で動かして確かめる（a072 から）。light node t/hw_check.js
'use strict';
const H = require('../lib/h.js');
const { check, sleep, ns, ip } = H;
const path = require('node:path');
(async () => {
  const A = H.sim(ns(1), { ip: ip(1), sn: 'HWCHECKA000001', reply: 'broadcast', pattern: 'grid', rate: 50000 });
  const B = H.sim(ns(4), { ip: ip(4), sn: 'HWCHECKB000001', reply: 'broadcast', pattern: 'ring', rate: 50000 });
  await A.waitFor(e => e.ev === 'ready'); await B.waitFor(e => e.ev === 'ready');
  const P = H.spawnJson(ns(2), H.ENODE, [path.join(H.W, 'lib', 'hw_live.js'), '--secs', '3', '--share'], { env: { ELECTRON_RUN_AS_NODE: '1' }, name: 'hw' });
  const t = Date.now(); while (!P.exited && Date.now() - t < 90000) await sleep(200);
  let R = null; try { R = JSON.parse(P.raw.join('\n')); } catch (e) { R = { raw: P.raw.slice(0, 5), err: P.err.slice(0, 500) }; }
  check('J2-hw_live-runs', R.devices && R.devices.length === 2 && R.runs && R.runs.length === 2 && R.mixCheck, R);
  H.save('hw_check');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
