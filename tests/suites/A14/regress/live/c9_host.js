// C9b ライブ（アプリ版）: LiDAR がつながった PC。表示 → 配信 → LiDAR の電源を切る/入れる → 止める → もう一度表示 → 配信をやめる
'use strict';
const L = require('../lib.js');
const fs = require('fs');
const O = L.W + '/out/live';
const mark = n => fs.writeFileSync(`${O}/mark_${n}`, String(Date.now()));
const wait = n => new Promise(r => { const iv = setInterval(() => { if (fs.existsSync(`${O}/mark_${n}`)) { clearInterval(iv); r(); } }, 200); });
(async () => {
  const { app, p, errors } = await L.launch('c9host');
  const st = () => p.evaluate(() => ({ dev: document.getElementById('liveDevices').innerText.replace(/\n/g, ' | '), now: !document.getElementById('liveNow').hidden, src: document.getElementById('liveSrc').textContent, rate: document.getElementById('liveRate').textContent, dot: document.getElementById('liveDot').className, msg: document.getElementById('statMsg').textContent, err: document.getElementById('liveErr').hidden ? '' : document.getElementById('liveErr').textContent, clients: document.getElementById('liveShareClients').textContent, files: window.__pcd.S.files.map(f => f.name + ':' + f.n) }));
  const log = async (tag) => L.log({ who: 'host', tag, t: Math.round((Date.now() - T0) / 1000), ...(await st()) });
  const T0 = Date.now();
  await p.click('[data-open="live"]');
  await p.waitForFunction(() => document.querySelector('#liveDevices button[data-lsn]'), null, { timeout: 15000 }).catch(() => {});
  await log('list');
  await p.click('#liveDevices button[data-lsn]'); await L.sleep(5000); await log('showing');
  await L.shot(p, 'c9_host_showing');
  await p.click('#liveShare'); await L.sleep(1000); await log('share-on');
  mark('sharing');
  await wait('recv_connected'); await L.sleep(3000); await log('share-clients');
  await p.selectOption('#liveShareStep', '4'); await L.sleep(3000); await log('share-step4');
  await p.click('#btnLiveSnap'); await L.sleep(4000); await log('snapshot');
  await p.click('#popStack .ptab[data-name="live"]').catch(() => {}); await L.sleep(300);
  // LiDAR の電源を切る
  mark('power_off'); await L.sleep(6000); await log('lidar-off-6s');
  await L.shot(p, 'c9_host_lidar_off');
  mark('power_on'); await wait('fake_restarted'); await L.sleep(8000); await log('lidar-on-8s');
  // 止めて、もう一度表示
  await p.click('#btnLiveStop'); await L.sleep(2500); await log('stopped');
  await p.click('#liveDevices button[data-lsn]').catch(e => L.log({ who: 'host', clickErr: e.message })); await L.sleep(5000); await log('re-show');
  // 配信をやめる（受け手の様子は受け手のログで）
  await p.click('#liveShare'); await L.sleep(1000); await log('share-again?');
  await p.click('#liveShare'); await L.sleep(1000); await log('share-off');
  mark('share_off');
  await wait('recv_done');
  L.log({ who: 'host', errors: errors.filter(e => !/GPU stall|swiftshader|Security Warning|GroupMarkerNotSet/i.test(e)).slice(0, 10) });
  await app.close();
})().catch(e => { console.log('FATAL host', e.stack); process.exit(1); });
