// ライブの知らせ・見た目（Electron・自分の netns の中で）
//   heavy ip netns exec a061 xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" node live_msgs.js
//   ・にせの配信（WebSocket が待っていないポート）につなぐと、どんな知らせが出るか
//   ・押せない「表示」ボタン（別のネットワークの LiDAR）の見た目と、押したときの反応
//   ・配信のチェックを入れたときの「0 台」の表示
const L = require('./lib.js');
const { spawn } = require('child_process');
(async () => {
  const kids = [];
  const bg = (ns, args) => { const c = spawn('ip', ['netns', 'exec', ns, ...args], { stdio: 'ignore' }); kids.push(c); return c; };
  bg('a062', ['node', '/home/claude/pcd-viewer/tools/fake_mid360.js', '10.106.0.2', '47MDL9T0020193']);
  bg('a063', ['node', '/home/claude/pcd-viewer/tools/fake_mid360.js', '192.168.1.160', '47MDL9T0099999']);
  bg('a063', ['node', L.W + '/regress/fake_peer.js', '10.106.0.255', 'robot-pc', '9']);
  const { app, p, close, errors } = await L.electron({ w: 1280, h: 800, name: 'livemsg' });
  const out = {};
  await p.evaluate(() => {
    window.__log = []; const el = document.getElementById('statMsg');
    new MutationObserver(() => window.__log.push([Math.round(performance.now()), el.textContent, !!el.style.color])).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  });
  out.windows = L.xwindows();
  out.icon = L.xicon('', `${L.SHOTS}/electron/window_icon_any.png`);
  await L.openCard(p, 'live');
  await p.waitForFunction(() => document.querySelectorAll('#liveDevices li:not(.none)').length >= 2 && document.querySelectorAll('#livePeers li:not(.none)').length >= 1, null, { timeout: 15000 }).catch(() => {});
  // 一覧が何秒ごとに描き直されるか（描き直しの間にマウスを押して離すと、クリックが落ちる）
  out.rerender = await p.evaluate(async () => {
    const cnt = { devices: 0, peers: 0 };
    const mo1 = new MutationObserver(() => cnt.devices++); mo1.observe(document.getElementById('liveDevices'), { childList: true });
    const mo2 = new MutationObserver(() => cnt.peers++); mo2.observe(document.getElementById('livePeers'), { childList: true });
    await new Promise(r => setTimeout(r, 10000));
    mo1.disconnect(); mo2.disconnect();
    return { seconds: 10, ...cnt };
  });
  // 本物の人のクリック（押して 150ms 後に離す）が届くか: 10 回試す
  out.slowClicks = [];
  for (let i = 0; i < 10; i++) {
    const b = await p.evaluate(() => { const e = document.querySelector('#livePeers button'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (!b) break;
    await p.evaluate(() => { window.__clicked = 0; document.getElementById('livePeers').addEventListener('click', e => { if (e.target.closest('button[data-lpeer]')) window.__clicked++; else window.__clicked += 100; }, { once: true }); });
    await p.mouse.move(b.x, b.y); await p.mouse.down(); await p.waitForTimeout(150); await p.mouse.up();
    await p.waitForTimeout(100);
    out.slowClicks.push(await p.evaluate(() => window.__clicked));
    // つながりに行ってしまったら止めて一覧に戻す
    if (await p.evaluate(() => !document.getElementById('liveNow').hidden)) { await p.click('#btnLiveStop').catch(() => {}); await p.waitForTimeout(500); }
  }
  // 押せない「表示」の見た目
  out.disabledBtn = await p.evaluate(() => {
    const bs = [...document.querySelectorAll('#liveDevices button')];
    return bs.map(b => { const cs = getComputedStyle(b); return { disabled: b.disabled, color: cs.color, bg: cs.backgroundColor, border: cs.borderColor, opacity: cs.opacity, cursor: cs.cursor }; });
  });
  await p.evaluate(() => { window.__log = []; });
  await p.click('#liveDevices li:nth-child(2) button', { force: true }).catch(e => { out.disabledClickErr = e.message.split('\n')[0]; });
  await p.waitForTimeout(500);
  out.disabledClickLog = await p.evaluate(() => window.__log.map(x => x.slice(1)));
  // にせの配信につなぐ（ポート 9 には誰もいない）
  await p.evaluate(() => { window.__log = []; });
  await p.evaluate(() => document.querySelector('#livePeers button').click());
  await p.waitForTimeout(3000);
  out.peerFailLog = await p.evaluate(() => window.__log.map(x => [x[0], (x[2] ? '[赤] ' : '') + x[1]]));
  out.peerFailState = await p.evaluate(() => ({ liveNowShown: !document.getElementById('liveNow').hidden, src: document.getElementById('liveSrc').textContent, rate: document.getElementById('liveRate').textContent, msg: document.getElementById('statMsg').textContent }));
  await L.shot(p, 'electron/live_peer_fail');
  // LiDAR につないで、配信を入れる
  await p.evaluate(() => { window.__log = []; });
  await p.evaluate(() => { const b = document.querySelector('#liveDevices button:not([disabled])'); if (b) b.click(); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('liveShare').click()); await p.waitForTimeout(1500);
  out.shareState = await p.evaluate(() => ({ checked: document.getElementById('liveShare').checked, clients: document.getElementById('liveShareClients').textContent, clientsRect: (() => { const r = document.getElementById('liveShareClients').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); })(), stepRect: (() => { const r = document.getElementById('liveShareStep').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); })(), hud: document.getElementById('statPoints').textContent }));
  await L.shot(p, 'electron/live_sharing');
  out.logLidar = await p.evaluate(() => window.__log.map(x => (x[2] ? '[赤] ' : '') + x[1]));
  await p.click('#btnLiveStop'); await p.waitForTimeout(500);
  out.errors = errors;
  L.fs.writeFileSync(L.W + '/out/live_msgs.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await close();
  for (const k of kids) try { k.kill(); } catch (e) { /* 終わっている */ }
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
