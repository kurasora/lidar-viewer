// steal.js — 同じ LAN のロボット（a074 = Raspberry Pi で livox_ros_driver2 が動いている想定）から点群を奪うか。
//   LiDAR=a071、ロボット=a074（drvsim.py --configure で SDK2 と同じく送り先を自分にする）、アプリ=a072（この中で enode で実行）
'use strict';
const H = require('../lib/h.js');
const { check, info, sleep } = H;
const L = require(H.LIVEJS);
const path = require('node:path');
const DRV = path.join(H.W, 'lib', 'drvsim.py');
const robotPts = d => { const s = d.last('stats'); return s ? Object.entries(s.cnt).filter(([k]) => k.endsWith(':56301')).reduce((a, [, v]) => a + v, 0) : 0; };

(async () => {
  const A = H.sim('a071', { ip: '10.107.0.1', sn: 'ROBOTLIDAR0001', reply: 'broadcast', pattern: 'grid', rate: 50000 });
  await A.waitFor(e => e.ev === 'ready');
  const robot = H.spawnJson('a074', 'python3', [DRV, '--mode', 'sdk2', '--host-ip', '10.107.0.4', '--configure', '10.107.0.1'], { name: 'robot' });
  await robot.waitFor(e => e.ev === 'configured', 5000);
  await sleep(1500); const r0 = robotPts(robot); await sleep(1000); const robotBefore = robotPts(robot) - r0;
  check('S0-robot-receives', robotBefore > 300, `ロボットが 1 秒に受けた箱: ${robotBefore}`);

  const live = new L.Live(); await live.open();
  let dev = null; const t = Date.now(); while (Date.now() - t < 6000 && !(dev = live.state().devices[0])) await sleep(100);
  info('S1-app-sees-robot-lidar', { dev, note: '一覧には、ほかの PC（ロボット）が使っている LiDAR もそのまま出る。使用中かどうかの表示はない' });
  await live.startLidar(dev.sn); await sleep(500);
  const r1 = robotPts(robot); await sleep(2000); const robotDuring = robotPts(robot) - r1;
  check('S2-robot-keeps-stream-while-app-views', robotDuring > 300, { robotPkts2s: robotDuring, appRate: live.state().rate, lidarHost: A.last('host') && A.last('host').host });
  await live.stopAll(); await sleep(500);
  const r2 = robotPts(robot); await sleep(2000); const robotAfter = robotPts(robot) - r2;
  check('S3-robot-stream-restored-after-stop', robotAfter > 300, { robotPkts2s: robotAfter, lidarHostNow: A.last('stats') && A.last('stats').host, note: '「止める」で元の送り先（ロボット）に戻すか' });
  live.close();
  H.save('steal');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); await H.cleanup(); process.exit(1); });
