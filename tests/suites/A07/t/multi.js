// multi.js — 複数の LiDAR（切り替え・混ざり・消える/戻る）。a072 の中で enode で実行。LiDAR A=a071(10.107.0.1) B=a074(10.107.0.4)
'use strict';
const H = require('../lib/h.js');
const { check, info, sleep } = H;
const L = require(H.LIVEJS);
const uncaught = []; process.on('uncaughtException', e => { uncaught.push(String(e.stack || e)); console.log('UNCAUGHT', e.message); });
const isA = (x, y) => x > 0.99 && x < 2.01 && y < -1.99 && y > -2.8;            // grid の点
const isB = (x, y) => Math.abs(Math.hypot(x, y) - 5) < 0.01;                      // ring の点（半径 5 m）
function classify(bs) { let a = 0, b = 0, o = 0; for (const t of bs) for (let i = 0; i < t.n; i++) { const x = t.xyz[3 * i], y = t.xyz[3 * i + 1]; if (isA(x, y)) a++; else if (isB(x, y)) b++; else o++; } return { a, b, other: o }; }
async function waitDev(live, sn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { const d = live.state().devices.find(x => x.sn === sn); if (d) return d; await sleep(100); } return null; }

(async () => {
  const A = H.sim('a071', { ip: '10.107.0.1', sn: 'LIDARA00000001', reply: 'broadcast', pattern: 'grid', rate: 100000 });
  const B = H.sim('a074', { ip: '10.107.0.4', sn: 'LIDARB00000001', reply: 'broadcast', pattern: 'ring', rate: 100000 });
  await A.waitFor(e => e.ev === 'ready'); await B.waitFor(e => e.ev === 'ready');
  const live = new L.Live(); const logs = []; live.on('log', t => logs.push(t));
  let got = []; live.on('points', b => got.push(b));
  const devEvents = []; live.lidar.on('devices', l => devEvents.push({ t: Date.now(), l: l.map(d => d.sn) }));
  await live.open();
  const dA = await waitDev(live, 'LIDARA00000001'), dB = await waitDev(live, 'LIDARB00000001');
  check('C1-two-detected', dA && dB, live.state().devices);

  // A を表示 → 止める → B を表示（画面の操作と同じ順）
  await live.startLidar(dA.sn); await sleep(1500);
  const cA = classify(got.splice(0));
  check('C1-A-only-while-A', cA.a > 50000 && cA.b === 0, cA);
  await live.stopAll(); await sleep(500); got.splice(0);
  await live.startLidar(dB.sn); await sleep(300); got.splice(0); await sleep(2000);
  const cB = classify(got.splice(0));
  check('C1-B-only-after-switch', cB.b > 50000 && cB.a === 0, { ...cB, note: 'A の点が混ざっていれば FAIL（A は送り先をこの PC にしたまま送り続けている）', simA: A.last('stats') && { host: A.last('stats').host, sentPkts: A.last('stats').sentPkts } });
  info('C1-state-says', { source: live.state().source, rate: live.state().rate });

  // B を表示中に A が電源を入れ直した（送り先の設定が残る本物を模す）… 何もしなくても A の点が混ざる
  // ---------------------------------------------------------------- 消える・戻る
  // 表示中の B が消える（検出にも答えず点も来ない）
  B.send('gone'); await sleep(300); got.splice(0); const tg = Date.now(); await sleep(6000);
  const stG = live.state();
  check('C2-active-gone-kept-in-list', stG.devices.some(d => d.sn === dB.sn), stG.devices.map(d => d.sn));
  info('C2-active-gone-ui', { rate: stG.rate, mode: stG.mode, logs: logs.slice(-3), points: classify(got.splice(0)), note: '知らせは出ない。毎秒の点数（A の点が混ざっていればその数）が出るだけ' });
  // 戻る（送り先の設定が残っている＝電源を入れ直しても設定が残る場合）
  B.send('back'); await sleep(2000); got.splice(0); await sleep(1000);
  const cBack = classify(got.splice(0));
  check('C2-active-back-resumes', cBack.b > 20000, cBack);
  // 戻る（送り先の設定が消えた＝設定が電源で消える場合）: アプリは設定を送り直さない
  B.send('gone'); B.send('nohost'); await sleep(2000); B.send('back'); await sleep(3000); got.splice(0); await sleep(1500);
  const cNo = classify(got.splice(0));
  const bCmds = B.all('cmd').length;
  info('C2-active-back-without-config', { pointsFromB: cNo.b, cmdsReceivedByB: bCmds, note: 'LiDAR が戻っても設定（送り先）を送り直さないので、設定が消える LiDAR では点が来ないまま' });

  // 表示していない A が消える → 一覧から消えるまでの時間
  await live.stopAll();
  devEvents.length = 0;
  A.send('gone'); const tA = Date.now();
  let goneAt = null; while (Date.now() - tA < 10000) { if (!live.state().devices.some(d => d.sn === dA.sn)) { goneAt = Date.now() - tA; break; } await sleep(100); }
  check('C2-idle-gone-removed', goneAt !== null && goneAt < 7000, `${goneAt} ms で一覧から消えた`);
  A.send('back'); const tB = Date.now(); let backAt = null; while (Date.now() - tB < 5000) { if (live.state().devices.some(d => d.sn === dA.sn)) { backAt = Date.now() - tB; break; } await sleep(50); }
  check('C2-idle-back-listed', backAt !== null, `${backAt} ms で一覧に戻った`);

  // ---------------------------------------------------------------- 同じ SN の LiDAR が 2 台（片方の IP が変わる）
  // ---------------------------------------------------------------- IP が変わる LiDAR（DHCP 等）
  A.send('ip 10.107.0.9'); await sleep(2500);
  info('C3-ip-change', { list: live.state().devices, note: '返事に書かれた IP（lidar_ip）をそのまま使う。実際の送り元と違っても照合しない' });
  A.send('ip 10.107.0.1'); await sleep(1500);

  live.close();
  check('C9-no-uncaught', uncaught.length === 0, uncaught);
  H.save('multi');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
