// 1,000 万点を超える点群を、本物の capSel の最小（1,000 万点）で開く。点数・total・知らせだけを記録する
//   node bbig.js <ファイル> <出力 json>
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path');
const [file, outJson] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('file:///home/claude/pcd-viewer/dist/index.html');
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  await p.evaluate(() => { const s = document.getElementById('capSel'); s.value = '10000000'; s.dispatchEvent(new Event('change', { bubbles: true }));
    const el = document.getElementById('statMsg'); window.__msgs = []; new MutationObserver(() => { if (el.textContent) window.__msgs.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
  const t0 = Date.now();
  await p.setInputFiles('#fileInput', [path.resolve(file)]);
  await p.waitForFunction(() => window.__pcd.S.files.length >= 1 || /エラー/.test(document.getElementById('statMsg').textContent), null, { timeout: 900000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => { const f = window.__pcd.S.files[0]; return f ? { n: f.n, total: f.total, sampled: f.sampled, list: document.querySelector('#fileList .sub')?.textContent, msgs: window.__msgs, capSel: document.getElementById('capSel').value } : { msgs: window.__msgs }; });
  r.ms = Date.now() - t0; r.errors = errors;
  fs.writeFileSync(outJson, JSON.stringify(r, null, 1)); console.log(JSON.stringify(r));
  await b.close();
})().catch(e => { console.log('fatal', e.message); process.exit(1); });
