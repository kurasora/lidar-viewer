// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
// アプリ version（Electron）で、天井を隠した部屋の床を上からクリック（pickAt）→ 選ばれた点の z、UTM の部屋の座標の吹き出し
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
const W = process.argv[2];
(async () => {
  const app = await pw._electron.launch({ executablePath: '/home/claude/pcd-viewer/node_modules/electron/dist/electron', args: ['--no-sandbox', '/home/claude/pcd-viewer/main.js'], env: { ...process.env, PCDV_USERDATA: W + '/ud-el' } });
  const p = await app.firstWindow();
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.evaluate(fs.readFileSync(W + '/lib/helpers.page.js', 'utf8'));
  const out = {};
  await p.setInputFiles('#fileInput', [W + '/data/p1/room.pcd']);
  await p.waitForTimeout(500); await p.evaluate(() => H.settle());
  out.room = await p.evaluate(async () => { const P = window.__pcd; P.setView('top', false); await H.wait(800); return { hideCeil: P.S.hideCeil, ceilZ: P.S.ceilZ, hit: await H.pickLocal([10, 1.5, 0]) }; });
  // 閉じて UTM の部屋
  await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); H.levelSeen = false; });
  await p.setInputFiles('#fileInput', [W + '/data/p3/utm_room_f8.pcd']);
  await p.waitForTimeout(500); await p.evaluate(() => H.settle());
  const tgt = await p.evaluate(async () => { const P = window.__pcd, f = P.S.files[0]; P.setView('top', false); await H.wait(800); document.querySelector('[data-tool="info"]').click(); const l = [f.sample[0], f.sample[1], f.sample[2]]; return H.proj(l); });
  await p.mouse.click(tgt.x, tgt.y); await p.waitForTimeout(1000);
  out.utm = await p.evaluate(async (t) => { const hit = await window.__pcd.pickAt(t.x, t.y, true); return { box: H.pinText(), offset: window.__pcd.S.offset, local: hit && hit.local.toArray() }; }, tgt);
  out.version = await app.evaluate(({ app }) => app.getVersion());
  console.log(JSON.stringify(out));
  await p.screenshot({ path: W + '/out/p16_electron.png' });
  await app.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
