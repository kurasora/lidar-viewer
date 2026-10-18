// share2.js — 見る側（画面, a07u3）: 配信元（a07u2、Node の Live）のファイアウォールが接続を黙って捨てるとき（Windows の受信の許可がない場合を模す）
//   NSP=a07u NET=10.117.0 heavy ip netns exec a07u3 xvfb-run -a -n 170 node t/share2.js
'use strict';
const H = require('../lib/h.js'); const E = require('../lib/el.js');
const { check, info, sleep, ns, ip } = H;
const path = require('node:path');
const PC = path.join(H.W, 'lib', 'livepc.js');
async function ask(p, cmd, ev, ms = 8000) { const n = p.ev.length; p.send(cmd); const t = Date.now(); while (Date.now() - t < ms) { const e = p.ev.slice(n).find(x => x.ev === ev || x.ev === 'error'); if (e) return e; await sleep(50); } return null; }

(async () => {
  const A = H.sim(ns(1), { ip: ip(1), sn: 'FWLIDAR0000001', reply: 'broadcast', pattern: 'ring', rate: 50000 });
  await A.waitFor(e => e.ev === 'ready');
  const S = H.spawnJson(ns(2), H.ENODE, [PC], { env: { ELECTRON_RUN_AS_NODE: '1' }, name: 'sharer' });
  await S.waitFor(e => e.ev === 'ready', 10000); await sleep(2500);
  await ask(S, 'start FWLIDAR0000001', 'started');
  const sh = await ask(S, 'share 1 1', 'share');
  const port = sh.port;
  // 配信元の受信を黙って捨てる（SYN に答えない）
  info('F10-iptables', H.shq(`ip netns exec ${ns(2)} iptables -I INPUT -p tcp --dport ${port} -j DROP && echo ok`).trim());
  const { app, page, errors } = await E.launch('fwview');
  await E.openLive(page);
  await E.waitUi(page, u => u.peers.some(t => /MID-360/.test(t) && !/ありません/.test(t)), 15000);
  await E.msgs(page);
  const t0 = Date.now();
  await page.click('#livePeers li button');
  const tl = [];
  let ended = null;
  while (Date.now() - t0 < 170000) {
    const u = await E.ui(page);
    tl.push({ s: Math.round((Date.now() - t0) / 1000), now: u.now, src: u.src, rate: u.rate, msg: u.msg });
    if (!u.now && Date.now() - t0 > 3000) { ended = Math.round((Date.now() - t0) / 1000); break; }
    await sleep(5000);
  }
  const m = await E.msgs(page);
  check('F10-firewall-drop-feedback', ended !== null && ended < 30, { endedAfterSec: ended, timeline: tl.filter((x, i) => i < 3 || i % 6 === 0 || i === tl.length - 1), msgs: m.map(x => `${Math.round((x.t - m[0].t) / 1000)}s ${x.err ? '[赤]' : ''}${x.text}`), note: 'つながらないのに「表示しています」のまま。OS の接続の時間切れ（Linux 約 130 秒、Windows 約 21 秒）まで待ち、理由の知らせは直後の「配信が終わりました」で上書きされる' });
  H.shq(`ip netns exec ${ns(2)} iptables -D INPUT -p tcp --dport ${port} -j DROP`);
  check('F10-no-errors', errors.length === 0, errors);
  await app.close(); await ask(S, 'quit', 'bye');
  H.save('share2');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
