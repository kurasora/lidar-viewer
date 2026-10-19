// アプリ（Electron）を Playwright で動かす雛形。これを写して自分の試験を書く
//   使い方: heavy xvfb-run -a node electron_app.js [開くファイル...]
//   環境変数:
//     APPDIR   … アプリのフォルダ（既定 /home/claude/pcd-viewer。mkcopy した写しも可）
//     USERDATA … 設定の置き場所（既定 自分の作業フォルダの下。必ず自分専用にする）
//   メモ:
//     ・ページの中の動作確認用の窓口: window.__pcd = { S, enqueue, setView, pickAt, call, world, renderer, cam, controlsTarget(), updateLive }
//     ・本番の窓を作る main.js をそのまま使う（F12 で開発者ツールが開く作り）
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const APPDIR = process.env.APPDIR || '/home/claude/pcd-viewer';
  const app = await pw._electron.launch({
    executablePath: '/home/claude/pcd-viewer/node_modules/electron/dist/electron',
    args: ['--no-sandbox', path.join(APPDIR, 'main.js')],
    env: { ...process.env, PCDV_USERDATA: process.env.USERDATA || path.join(process.cwd(), 'userdata') },
  });
  const p = await app.firstWindow();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  const files = process.argv.slice(2).map(f => path.resolve(f));
  if (files.length) {
    await p.setInputFiles('#fileInput', files);
    await p.waitForFunction(n => window.__pcd.S.files.length >= n || document.getElementById('statMsg').style.color, files.length, { timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(1000);
  }
  const st = await p.evaluate(() => ({ title: document.title, files: window.__pcd.S.files.map(f => ({ name: f.name, n: f.n })), msg: document.getElementById('statMsg').textContent, hasAppApi: !!window.pcdApp }));
  console.log(JSON.stringify({ ...st, errors }));
  // 主プロセス側の様子も見られる: await app.evaluate(({ app }) => app.getPath('userData'))
  await p.screenshot({ path: 'electron_app.png' });
  await app.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
