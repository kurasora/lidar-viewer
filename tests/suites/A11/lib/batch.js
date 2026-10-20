// 画面の試験を 1 回のブラウザ起動でまとめて流す: node batch.js tasks.json out.jsonl
//   tasks.json: [{ label, files: ["a.pcd", "b.shp+b.dbf"], script: "s.js"（ページの中の async 関数の本体）, nolevel, cap, view: "1280x800", shot: "x.png", traj: ["t.txt"] }]
//   1 つの課題ごとにページを開き直す（状態を持ち越さない）。結果は 1 課題 1 行の JSON
//   ページの中の補助（H.*）は probe.js と同じ。window.pwClick / pwMove / pwKey / pwShot も使える
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const HELPERS = fs.readFileSync(path.join(__dirname, 'helpers.page.js'), 'utf8');
(async () => {
  const [taskFile, outFile] = process.argv.slice(2);
  const base = path.dirname(path.resolve(taskFile));
  const tasks = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const outFd = fs.openSync(outFile, 'a');
  for (const t of tasks) {
    if (only && !only.test(t.label)) continue;
    const t0 = Date.now();
    const [vw, vh] = (t.view || '1280x800').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: vw, height: vh } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await p.exposeFunction('pwClick', async (x, y, shift) => { if (shift) await p.keyboard.down('Shift'); await p.mouse.click(x, y); if (shift) await p.keyboard.up('Shift'); });
    await p.exposeFunction('pwMove', async (x, y) => { await p.mouse.move(x, y); });
    await p.exposeFunction('pwKey', async (k) => { await p.keyboard.press(k); });
    await p.exposeFunction('pwWheel', async (dx, dy) => { await p.mouse.wheel(dx, dy); });
    await p.exposeFunction('pwDrag', async (x0, y0, x1, y1, button) => { await p.mouse.move(x0, y0); await p.mouse.down({ button: button || 'left' }); await p.mouse.move(x1, y1, { steps: 8 }); await p.mouse.up({ button: button || 'left' }); });
    await p.exposeFunction('pwShot', async (f) => { await p.screenshot({ path: path.resolve(base, f) }); });
    await p.exposeFunction('pwOpen', async (list, input) => { await p.setInputFiles(input || '#fileInput', list.map(f => path.resolve(base, f))); });
    let result;
    try {
      await p.goto(t.page || process.env.PAGE || 'http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html');
      await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
      await p.evaluate(HELPERS);
      if (t.cap) await p.evaluate(v => { const s = document.getElementById('capSel'); s.value = String(v); s.dispatchEvent(new Event('change', { bubbles: true })); }, t.cap);
      if (t.nolevel) await p.evaluate(() => { document.getElementById('autoLevel').checked = false; });
      if (t.capInject) await p.evaluate(v => { const s = document.getElementById('capSel'); const o = document.createElement('option'); o.value = String(v); o.textContent = 'test'; s.appendChild(o); s.value = String(v); s.dispatchEvent(new Event('change', { bubbles: true })); }, t.capInject);
      const steps = [...(t.files || []).map(g => ['#fileInput', g]), ...(t.traj || []).map(g => ['#trajInput', g])];
      if (t.trajFirst) steps.sort((a, b) => (a[0] === '#trajInput' ? 0 : 1) - (b[0] === '#trajInput' ? 0 : 1));
      for (const [input, grp] of steps) {
        await p.setInputFiles(input, grp.split('+').map(f => path.resolve(base, f)));
        await p.waitForTimeout(300);
        await p.evaluate(() => window.H.settle());
      }
      const code = fs.readFileSync(path.resolve(base, t.script), 'utf8');
      result = await p.evaluate(`(async () => { const ARGS = ${JSON.stringify(t.args || null)};\n${code}\n })()`);
      if (t.shot) await p.screenshot({ path: path.resolve(base, t.shot) });
    } catch (e) { result = { scriptError: e.message }; }
    fs.writeSync(outFd, JSON.stringify({ label: t.label, ms: Date.now() - t0, result, errors: errors.slice(0, 10) }) + '\n');
    console.error(`[batch] ${t.label} ${Date.now() - t0} ms`);
    await ctx.close();
  }
  fs.closeSync(outFd);
  await b.close();
})().catch(e => { console.error('fatal', e); process.exit(1); });
