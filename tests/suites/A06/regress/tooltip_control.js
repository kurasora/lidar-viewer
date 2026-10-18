// 陽性対照: title 付きの要素に本物のマウスを乗せると吹き出しの窓（override_redirect）が出ることを確かめる
const L = require('./lib.js');
(async () => {
  const app = await L.PW._electron.launch({ executablePath: '/home/claude/pcd-viewer/node_modules/electron/dist/electron', args: ['--no-sandbox', L.path.join(__dirname, 'tooltip_control', 'main.js')], env: { ...process.env, PCDV_USERDATA: L.W + '/ud-ctrl' } });
  const p = await app.firstWindow();
  await p.waitForLoadState('load'); await p.waitForTimeout(800);
  const cb = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
  const ids = ['t1', 't2', 't3', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9'];
  const res = [];
  L.xmove(cb.x + 880, cb.y + 590); await L.sleep(600);
  const base = L.xwindows();
  for (const id of ids) {
    const r = await p.evaluate(id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, id);
    L.xmove(cb.x + 880, cb.y + 590); await L.sleep(400);
    L.xmove(cb.x + r.x, cb.y + r.y); await L.sleep(1800);
    const wins = L.xwindows().filter(w => !base.some(b => b.id === w.id));
    if (id === 't1' || id === 'n6') L.xshot(L.SHOTS + `/tooltip/control_${id}.png`);
    res.push({ id, popup: wins });
  }
  console.log(JSON.stringify({ contentBounds: cb, base, res }, null, 1));
  await app.close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
