// ports.js — ポートの取り合い（livox_ros_driver2 を模した drvsim.py と同じ PC=a072 で）。enode で a072 の中で実行
'use strict';
const H = require('../lib/h.js');
const { check, info, sleep } = H;
const L = require(H.LIVEJS);
const path = require('node:path');
const DRV = path.join(H.W, 'lib', 'drvsim.py');
const uncaught = []; process.on('uncaughtException', e => { uncaught.push(String(e.stack || e)); console.log('UNCAUGHT', e.message); });
const drv = (args) => H.spawnJson(null, 'python3', [DRV, ...args], { name: 'drv' });
async function waitDev(live, sn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { const d = live.state().devices.find(x => x.sn === sn); if (d) return d; await sleep(100); } return null; }
const drvPts = d => { const s = d.last('stats'); if (!s) return 0; return Object.entries(s.cnt).filter(([k]) => k.endsWith(':56301')).reduce((a, [, v]) => a + v, 0); };
const drvCmd = d => { const s = d.last('stats'); if (!s) return 0; return Object.entries(s.cnt).filter(([k]) => k.endsWith(':56101')).reduce((a, [, v]) => a + v, 0); };

(async () => {
  const A = H.sim('a071', { ip: '10.107.0.1', sn: 'PORTA000000001', reply: 'broadcast', pattern: 'grid', rate: 50000 });
  await A.waitFor(e => e.ev === 'ready');

  // ---- D1: SDK2 と同じ作り（SO_REUSEADDR・10.107.0.2 に bind）のドライバが先に動いている
  {
    const d = drv(['--mode', 'sdk2', '--host-ip', '10.107.0.2']); const r = await d.waitFor(e => e.ev === 'ready');
    info('D1-drv-bound', r);
    const live = new L.Live(); const logs = []; live.on('log', t => logs.push(t));
    const st = await live.open();
    check('D1-open-reports-conflict', st.errors.length > 0, { errors: st.errors, note: 'ポートがほかのソフトに使われていることを知らせるか（期待: 知らせる）' });
    const dev = await waitDev(live, 'PORTA000000001');
    check('D1-detect-still-works', !!dev, dev);
    const t0 = Date.now(); await live.startLidar(dev.sn); const ms = Date.now() - t0;
    const p0 = live.lidar.stat.pkts, q0 = drvPts(d); await sleep(2500);
    const appPk = live.lidar.stat.pkts - p0, drvPk = drvPts(d) - q0;
    check('D1-app-receives-points', appPk > 100, { appPackets: appPk, driverPackets: drvPk, startMs: ms, logs, driverGotAcks: drvCmd(d), rate: live.state().rate });
    live.close(); await d.kill(); await sleep(300);
  }
  // ---- D2: アプリが受信中に、あとからドライバが起動する
  {
    const live = new L.Live(); const logs = []; live.on('log', t => logs.push(t));
    await live.open(); const dev = await waitDev(live, 'PORTA000000001'); await live.startLidar(dev.sn);
    await sleep(1000); const p0 = live.lidar.stat.pkts; await sleep(1000); const before = live.lidar.stat.pkts - p0;
    const d = drv(['--mode', 'sdk2', '--host-ip', '10.107.0.2']); const r = await d.waitFor(e => e.ev === 'ready');
    await sleep(500); const p1 = live.lidar.stat.pkts, q1 = drvPts(d); await sleep(2000);
    const after = live.lidar.stat.pkts - p1, drvAfter = drvPts(d) - q1;
    check('D2-app-keeps-points-when-driver-starts-later', after > before / 4, { appPktsPerSecBefore: before, appPkts2sAfter: after, driverPkts2s: drvAfter, driverBindErrors: r.errors, logs, state: { rate: live.state().rate, errors: live.state().errors } });
    live.close(); await d.kill(); await sleep(300);
  }
  // ---- D3: SO_REUSEADDR なしの別ソフトが 0.0.0.0:56301 を先に持っている → アプリは知らせるか・あとで開き直せるか
  {
    const d = drv(['--mode', 'generic', '--ports', '56301']); await d.waitFor(e => e.ev === 'ready');
    const live = new L.Live();
    const st = await live.open();
    check('D3-generic-first-reports', st.errors.some(e => /56301/.test(e) && /使われています/.test(e)), st.errors);
    await d.kill(); await sleep(300);
    const st2 = await live.open();
    info('D3-reopen-at-Live-level', { errors: st2.errors, note: 'Live.open() をもう一度呼べば開き直せる（errors は前回のまま返る）。画面は liveOpened のため 2 回目を呼ばない（画面の試験で確かめる）', socks: Object.keys(live.lidar.socks) });
    live.close(); await sleep(300);
  }
  // ---- D4: SO_REUSEADDR なしの別ソフトが 10.107.0.2:56301（特定 IP）を先に持っている
  {
    const d = drv(['--mode', 'generic_ip', '--ports', '56301', '--host-ip', '10.107.0.2']); await d.waitFor(e => e.ev === 'ready');
    const live = new L.Live(); const st = await live.open();
    info('D4-generic-ip-first', { errors: st.errors });
    live.close(); await d.kill(); await sleep(300);
  }
  // ---- D5: アプリが先（ライブのカードを開いただけ、表示もしていない）→ SO_REUSEADDR なしの別ソフトは起動できない
  {
    const live = new L.Live(); await live.open();
    const d = drv(['--mode', 'generic', '--ports', '56000,56101,56201,56301']); const r = await d.waitFor(e => e.ev === 'ready');
    info('D5-other-software-blocked-after-card-opened', { otherSoftwareBindErrors: r.errors.map(e => `${e.addr}:${e.port} ${e.err}`) });
    await live.stopAll();
    const ss = H.shq('ss -uanp | grep -E ":(56000|56101|56201|56301|47800) " || true');
    check('D5-ports-released-after-stop', !/56301/.test(ss), { ss: ss.trim().split('\n').map(s => s.replace(/\s+/g, ' ')), note: '「止める」のあともポートを持ち続けるか（アプリを閉じるまで放さない）' });
    live.close(); await d.kill(); await sleep(300);
  }
  // ---- D6: SDK2 の host_ip が "local"（0.0.0.0 に bind・SO_REUSEADDR）のドライバがあとから起動
  {
    const live = new L.Live(); await live.open(); const dev = await waitDev(live, 'PORTA000000001'); await live.startLidar(dev.sn);
    await sleep(1000);
    const d = drv(['--mode', 'sdk2local']); await d.waitFor(e => e.ev === 'ready');
    await sleep(500); const p1 = live.lidar.stat.pkts, q1 = drvPts(d); await sleep(2000);
    info('D6-both-wildcard-reuse', { appPkts: live.lidar.stat.pkts - p1, driverPkts: drvPts(d) - q1, note: 'Linux: 両方 0.0.0.0＋SO_REUSEADDR のとき、ユニキャストはあとから bind した方へ' });
    live.close(); await d.kill(); await sleep(300);
  }
  // ---- D7: ドライバが先、アプリがあと（両方 0.0.0.0＋SO_REUSEADDR）
  {
    const d = drv(['--mode', 'sdk2local']); await d.waitFor(e => e.ev === 'ready');
    const live = new L.Live(); const st = await live.open(); const dev = await waitDev(live, 'PORTA000000001'); await live.startLidar(dev.sn);
    await sleep(500); const p1 = live.lidar.stat.pkts, q1 = drvPts(d); await sleep(2000);
    info('D7-driver-first-both-wildcard', { errors: st.errors, appPkts: live.lidar.stat.pkts - p1, driverPkts: drvPts(d) - q1 });
    live.close(); await d.kill(); await sleep(300);
  }
  check('D9-no-uncaught', uncaught.length === 0, uncaught);
  H.save('ports');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
