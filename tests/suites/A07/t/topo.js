// topo.js — ネットワークの形: LiDAR が別のサブネット／PC に IP が 2 つ／PC に同じサブネットの NIC が 2 枚（Wi-Fi と有線）
//   light node t/topo.js   （普通の名前空間で動かし、ip netns で a07 の組の設定を変える。最後に元に戻す）
'use strict';
const H = require('../lib/h.js');
const { check, info, sleep, sh, shq } = H;
const path = require('node:path');
const PC = path.join(H.W, 'lib', 'livepc.js');
const pc = ns => H.spawnJson(ns, H.ENODE, [PC], { env: { ELECTRON_RUN_AS_NODE: '1' }, name: 'pc@' + ns });
async function ask(p, cmd, ev, ms = 8000) { const n = p.ev.length; p.send(cmd); const t = Date.now(); while (Date.now() - t < ms) { const e = p.ev.slice(n).find(x => x.ev === ev || x.ev === 'error'); if (e) return e; await sleep(50); } return null; }
async function devs(p, ms = 5000) { await sleep(ms); return (await ask(p, 'state', 'state')).st.devices; }
const restore = () => {
  shq('ip -n a074 addr flush dev eth0'); shq('ip -n a074 addr add 10.107.0.4/24 brd + dev eth0'); shq('ip -n a074 route replace default dev eth0');
  shq('ip -n a072 route del default'); shq('ip -n a072 addr del 192.168.1.50/24 dev eth0');
  shq('ip netns del a076'); shq('ip -n a07sw link del a07h6');
};

(async () => {
  restore();
  // ---- T1: LiDAR が 192.168.1.160/24（PC は 10.107.0.2/24 だけ、既定の経路なし）
  sh('ip -n a074 addr flush dev eth0'); sh('ip -n a074 addr add 192.168.1.160/24 brd + dev eth0'); sh('ip -n a074 route replace default dev eth0');
  const B = H.sim('a074', { ip: '192.168.1.160', sn: 'OTHERNET000001', reply: 'broadcast', pattern: 'grid', rate: 20000 });
  await B.waitFor(e => e.ev === 'ready');
  let p = pc('a072'); await p.waitFor(e => e.ev === 'ready', 8000);
  const d1 = await devs(p);
  check('C3-T1-other-subnet-no-default-route', d1.length > 0, { devices: d1, simHeardSearches: (B.last('stats') || {}).searches, note: 'PC に既定の経路がないと 255.255.255.255 へ送れず（ENETUNREACH）、サブネットのブロードキャスト（10.107.0.255）は LiDAR が受け取らないので、見つからない。「IP を 192.168.1.50 に」の案内も出ない' });
  // 直し方の確かめ: NIC の IP（10.107.0.2）に bind したソケットから 255.255.255.255 へ送ると、経路がなくてもその NIC から出る（SDK2 は host_ip に bind して送っている）
  const s0 = (B.last('stats') || {}).searches || 0;
  const fixOut = shq(`ip netns exec a072 node -e "const d=require('node:dgram');const L=require('${H.LIVEJS}');const s=d.createSocket('udp4');s.bind(0,'10.107.0.2',()=>{s.setBroadcast(true);let k=0;const t=setInterval(()=>{s.send(L.packCmd(0),56000,'255.255.255.255',e=>{if(e)console.log('ERR',e.code)});if(++k>=3){clearInterval(t);setTimeout(()=>process.exit(0),300)}},300)})"`);
  await sleep(1500);
  info('C3-T1-fix-bind-per-interface', { sendResult: fixOut.trim() || 'ok', simHeardSearchesDelta: ((B.last('stats') || {}).searches || 0) - s0, note: 'bind した送り元の NIC から出るので、別のサブネットの LiDAR にも届く（届けば 3）' });
  // ---- T2: PC に既定の経路（eth0）を足す → 255.255.255.255 が出ていく
  sh('ip -n a072 route add default dev eth0');
  const d2 = await devs(p);
  check('C3-T2-other-subnet-detected-with-hint', d2.some(d => d.sn === 'OTHERNET000001' && d.hostIp === null), { devices: d2 });
  const e2 = await ask(p, 'start OTHERNET000001', 'started');
  info('C3-T2-start-message', e2);
  // ---- T3: PC の eth0 に 192.168.1.50/24 を足す（IP が 2 つ）
  sh('ip -n a072 addr add 192.168.1.50/24 dev eth0');
  const d3 = await devs(p, 2000);
  const e3 = await ask(p, 'start OTHERNET000001', 'started'); await sleep(1500);
  const s3 = await ask(p, 'state', 'state');
  check('C3-T3-two-ips-works', d3.some(d => d.hostIp === '192.168.1.50') && s3.pts > 10000, { devices: d3, start: e3 && e3.source, pts: s3.pts, simHost: (B.last('host') || {}).host });
  await ask(p, 'quit', 'bye'); await p.kill();
  shq('ip -n a072 route del default'); shq('ip -n a072 addr del 192.168.1.50/24 dev eth0');

  // ---- T4: PC に同じサブネットの NIC が 2 枚（wl0 = 192.168.1.20「Wi-Fi」が先に並ぶ、eth0 = 192.168.1.50 が LiDAR 側の有線）
  sh('ip netns add a076'); sh('ip -n a076 link set lo up');
  // dummy が使えない環境なので、相手のいない veth を「Wi-Fi」に見立てる
  sh('ip -n a076 link add wl0 type veth peer name wl0p'); sh('ip -n a076 link set wl0p up'); sh('ip -n a076 addr add 192.168.1.20/24 dev wl0 noprefixroute'); sh('ip -n a076 link set wl0 up');
  sh('ip -n a076 route add 192.168.1.0/24 dev wl0 metric 600'); // NetworkManager の Wi-Fi と同じく経路の重みを大きく
  sh('ip link add a07h6 type veth peer name eth0 netns a076'); sh('ip link set a07h6 netns a07sw'); sh('ip -n a07sw link set a07h6 master br0'); sh('ip -n a07sw link set a07h6 up');
  sh('ip -n a076 addr add 192.168.1.50/24 brd + dev eth0'); sh('ip -n a076 link set eth0 up');
  info('C4-a076', { links: shq('ip -n a076 -o link').split('\n').map(l => l.slice(0, 40)), routes: shq('ip -n a076 route').trim().split('\n') });
  p = pc('a076'); await p.waitFor(e => e.ev === 'ready', 8000);
  const o4 = p.ev.find(e => e.ev === 'open');
  const d4 = await devs(p);
  check('C4-T4a-two-nics-same-subnet-detected', d4.some(d => d.sn === 'OTHERNET000001'), { nets: o4 && o4.nets, devices: d4, routes: shq('ip -n a076 route show table local | grep 192.168.1.255').trim().split('\n'), note: 'サブネットのブロードキャスト 192.168.1.255 は先に足した NIC（wl0）から出て、LiDAR のいる eth0 には出ない。既定の経路もないので見つからない' });
  // T4b: 既定の経路を有線（eth0）に → 255.255.255.255 が eth0 から出て見つかる。点群の送り先にどの IP を選ぶか
  sh('ip -n a076 route add default dev eth0');
  const d4b = await devs(p);
  const nB = B.ev.length;
  const e4 = await ask(p, 'start OTHERNET000001', 'started'); await sleep(2000);
  const hostEv = B.ev.slice(nB).filter(e => e.ev === 'host').pop();
  const s4 = await ask(p, 'state', 'state');
  check('C4-T4b-host-ip-is-lidar-side-nic', hostEv && hostEv.host.ip === '192.168.1.50', { devices: d4b, start: e4 && (e4.source || e4.msg), lidarToldToSendTo: hostEv && hostEv.host, ptsReceived: s4.pts, note: 'LiDAR が見つかった NIC（eth0 = .50）ではなく、os.networkInterfaces() で先に並ぶ NIC（wl0 = .20）の IP を送り先にする' });
  // 強いホストモデル（Windows の既定に近い）を模す: arp_ignore=1（届いた NIC に付いた IP の ARP だけに答える）
  shq('ip netns exec a076 sysctl -w net.ipv4.conf.all.arp_ignore=1'); shq('ip -n a076 neigh flush all'); shq('ip -n a074 neigh flush all');
  await ask(p, 'stop', 'stopped'); const e5 = await ask(p, 'start OTHERNET000001', 'started'); await sleep(1000);
  const s5a = await ask(p, 'state', 'state'); await sleep(2000); const s5b = await ask(p, 'state', 'state');
  info('C4-strong-host-emulation', { start: e5 && (e5.source || e5.msg), ptsIn2s: s5b.pts - s5a.pts, note: 'arp_ignore=1 のとき、LiDAR は 192.168.1.20 の宛先を解決できず点が届かない（Windows の強いホストモデルでも同様と推定）' });
  await ask(p, 'quit', 'bye'); await p.kill();
  await B.kill();
  restore();
  info('restored', { a072: shq('ip -n a072 -o addr').trim().split('\n').map(l => l.slice(0, 70)), a074: shq('ip -n a074 -o addr show dev eth0').trim() });
  H.save('topo');
  await H.cleanup(); process.exit(0);
})().catch(async e => { console.log('FATAL', e.stack); restore(); await H.cleanup(); process.exit(1); });
