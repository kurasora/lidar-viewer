// 画面（Chromium で dist/index.html）にファイルを開かせ、ページの中で試験のスクリプトを動かして JSON を出す
//   使い方: node probe.js <script.js> [ファイル...]   （script.js はページの中で動く async 関数の本体。return した値を JSON で出す）
//   環境変数: PAGE（既定 dist/index.html）、CAP、VIEW（W×H、既定 1280x800）、SHOT（写真のパス）、NOLEVEL=1（開く前に自動水平を切る）
//   ページの中で使える補助: H.proj(local) … 点（ファイルの局所座標）を画面の座標へ、H.pickLocal(local) … その点の画面の位置で pickAt、
//     H.wait(ms)、H.settle() … 読み込み・水平補正が落ち着くまで待つ、H.text(id)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [scriptPath, ...files] = process.argv.slice(2);
  const code = fs.readFileSync(scriptPath, 'utf8');
  const [vw, vh] = (process.env.VIEW || '1280x800').split('x').map(Number);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: vw, height: vh } });
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (m.type() === 'log' && process.env.LOG) console.error('[page]', m.text()); });
  // ページの中から本物のマウス・キー操作を頼めるようにする
  await p.exposeFunction('pwClick', async (x, y, shift) => { if (shift) await p.keyboard.down('Shift'); await p.mouse.click(x, y); if (shift) await p.keyboard.up('Shift'); });
  await p.exposeFunction('pwMove', async (x, y) => { await p.mouse.move(x, y); });
  await p.exposeFunction('pwKey', async (k) => { await p.keyboard.press(k); });
  await p.exposeFunction('pwShot', async (f) => { await p.screenshot({ path: f }); });
  await p.goto(process.env.PAGE || 'file:///home/claude/pcd-viewer/dist/index.html');
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.addInitScript(() => {});
  await p.evaluate(() => {
    const H = window.H = {};
    H.wait = ms => new Promise(r => setTimeout(r, ms));
    H.text = id => document.getElementById(id).textContent;
    H.V3 = window.__pcd.cam.position.constructor;
    H.canvas = () => window.__pcd.renderer.domElement;
    // 局所座標（positions と同じ、シフトを引いた値）→ 画面の座標（clientX, clientY）
    H.proj = (l) => {
      const P = window.__pcd;
      P.world.updateMatrixWorld(true);
      const cam = P.cam; cam.updateMatrixWorld();
      const v = new H.V3(l[0], l[1], l[2]).applyMatrix4(P.world.matrixWorld).project(cam);
      const r = H.canvas().getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, z: v.z };
    };
    H.pickLocal = async (l) => { const s = H.proj(l); const hit = await window.__pcd.pickAt(s.x, s.y, true); return hit ? { local: hit.local.toArray(), world: hit.world.toArray(), file: hit.file && hit.file.name } : null; };
    H.settle = async (limit = 120000) => {
      const t0 = Date.now(); let last = '', since = Date.now();
      for (;;) {
        const s = JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, document.getElementById('statMsg').textContent]);
        if (s !== last) { last = s; since = Date.now(); }
        const msg = document.getElementById('statMsg').textContent;
        let busy = /調べています|探しています/.test(msg);
        // 開いたときの自動の水平補正は、知らせが「開きました」に上書きされるので、結果（水平補正しました／できませんでした）が出るまで待つ
        const S = window.__pcd.S, f0 = S.files[0];
        if (f0 && S.files.length === 1 && document.getElementById('autoLevel').checked && !window.H.levelSeen) {
          const b = f0.bbox, flat = !((b.max[2] - b.min[2]) > 1e-6 * Math.max(1, b.max[0] - b.min[0], b.max[1] - b.min[1]));
          if (!flat) { if (/水平補正/.test(msg) || S.levelInfo) window.H.levelSeen = true; else busy = true; }
        }
        if (JSON.parse(s)[0] && !busy && Date.now() - since > 1000) return;
        if (Date.now() - t0 > limit) return 'timeout';
        await H.wait(150);
      }
    };
  });
  if (process.env.CAP) await p.evaluate(v => { const s = document.getElementById('capSel'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, process.env.CAP);
  if (process.env.NOLEVEL) await p.evaluate(() => { document.getElementById('autoLevel').checked = false; });
  if (files.length) {
    // ひとつずつ開く（同時に選ぶ組は + でつなぐ: a.shp+a.dbf）
    for (const grp of files) {
      await p.setInputFiles('#fileInput', grp.split('+').map(f => path.resolve(f)));
      await p.waitForTimeout(300);
      await p.evaluate(() => window.H.settle());
    }
  }
  let result;
  try { result = await p.evaluate(`(async () => { ${code}\n })()`); }
  catch (e) { result = { scriptError: e.message }; }
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  console.log(JSON.stringify({ result, errors: errors.slice(0, 10) }));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
