// ファイルを開く画面で、Chromium が「守る場所」にしている所（Linux の ~/.config・~/.ssh など、Windows の AppData など）の
// ファイルを選んでも開けるか（以前は選ぶ画面の結果が返らず、ファイルが開かずにカードが残った）。
// 開発 version の Electron と本物のファイル選択の画面（GTK）を xdotool で動かす。
//   使い方: xvfb-run -a -s "-screen 0 1600x1000x24" node tests/suites/S5/open_restricted.cjs
'use strict';
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const XD = (...a) => { try { return execFileSync('xdotool', a, { encoding: 'utf8' }); } catch (e) { return ''; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // 守る場所に試験用のファイルを置く（最後に消す）
  const dirs = [path.join(os.homedir(), '.config', 'lv_restricted_test'), path.join(os.homedir(), '.ssh', 'lv_restricted_test')];
  const files = dirs.map((d, i) => { fs.mkdirSync(d, { recursive: true }); const f = path.join(d, `r${i}.pcd`); fs.copyFileSync(path.join(ROOT, 'sample/formats/pcl_binary.pcd'), f); return f; });
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'lvud-'));
  const app = await pw._electron.launch({ executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'), args: ['--no-sandbox', path.join(ROOT, 'main.js')], env: { ...process.env, PCDV_USERDATA: ud } });
  const p = await app.firstWindow();
  await p.waitForFunction(() => window.__pcd);
  let ng = 0;
  for (const f of files) {
    if (await p.evaluate(() => document.getElementById('pop').hidden || document.getElementById('pop').dataset.name !== 'open')) await p.click('[data-open="open"]');
    await sleep(500);
    await p.click('#btnOpen'); await sleep(3000);
    const dlg = XD('search', '--name', '^Open').trim().split('\n').filter(Boolean).pop();
    if (dlg) {
      const g = Object.fromEntries(XD('getwindowgeometry', '--shell', dlg).trim().split('\n').map(l => l.split('=')));
      XD('key', '--window', dlg, 'ctrl+l'); await sleep(400);
      XD('type', '--window', dlg, '--delay', '20', f); await sleep(800);
      XD('mousemove', String(+g.X + +g.WIDTH - 50), String(+g.Y + +g.HEIGHT - 24), 'click', '1');
    }
    await sleep(4000);
    const st = await p.evaluate(() => ({ files: window.__pcd.S.files.map(x => x.name), card: document.getElementById('pop').hidden ? null : document.getElementById('pop').dataset.name }));
    const ok = st.files.includes(path.basename(f)) && st.card === null;
    if (!ok) ng++;
    console.log(`${ok ? 'OK' : 'NG'}  守る場所のファイルを選んで開ける（${f.replace(os.homedir(), '~')}）  … ${JSON.stringify(st)}${dlg ? '' : '（選ぶ画面が見つからない）'}`);
  }
  await app.close();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(ud, { recursive: true, force: true });
  console.log(`\n${files.length - ng} / ${files.length} OK`);
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
