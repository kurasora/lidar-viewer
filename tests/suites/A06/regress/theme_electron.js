// OS の明るい/暗い設定（nativeTheme.themeSource）を切り替えて、見た目が崩れないか・同じか（Electron）
//   heavy xvfb-run -a -n 160 -s "-screen 0 1600x1000x24" node theme_electron.js
const L = require('./lib.js');
const { execFileSync } = require('child_process');
const diff = (a, b) => execFileSync('python3', ['-c', `from PIL import Image\nimport numpy as np\na=np.asarray(Image.open('${a}').convert('RGB')).astype(int)\nb=np.asarray(Image.open('${b}').convert('RGB')).astype(int)\nm=np.abs(a-b).max(axis=2)>8\nprint(int(m.sum()))`], { encoding: 'utf8' }).trim();
(async () => {
  const { app, p, close, errors } = await L.electron({ w: 1280, h: 800, name: 'theme' });
  const cb = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
  const D = L.SHOTS + '/theme'; L.fs.mkdirSync(D, { recursive: true });
  await L.openAs(p, L.FILES + '/corr_int_label.pcd', Array.from({ length: 30 }, (_, i) => `scan_${String(i + 1).padStart(2, '0')}.pcd`));
  await p.evaluate(() => { document.getElementById('navHint').hidden = true; });
  const out = { themes: {} };
  for (const t of ['dark', 'light']) {
    await app.evaluate(({ nativeTheme }, t) => { nativeTheme.themeSource = t; }, t);
    await L.sleep(800);
    const r = { prefersDark: await p.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), shots: {} };
    for (const c of ['open', 'display', 'color']) {
      await L.closeCards(p); await L.openCard(p, c);
      if (c === 'color') await p.click('#tabColorDetail');
      await p.evaluate(() => { document.getElementById('statMsg').textContent = ''; document.getElementById('navHint').hidden = true; });
      await L.sleep(400);
      const f = `${D}/${t}_${c}.png`; await p.screenshot({ path: f }); r.shots[c] = f;
      if (c === 'color') await p.click('#tabColorBasic');
    }
    // select の一覧（ネイティブの部品）
    await L.closeCards(p); await L.openCard(p, 'display');
    const s = await p.evaluate(() => { const r = document.getElementById('capSel').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    L.xclick(cb.x + s.x, cb.y + s.y); await L.sleep(1000);
    L.xshot(`${D}/${t}_select_popup_root.png`);
    L.xkey('Escape'); await L.sleep(400);
    out.themes[t] = r;
  }
  out.diff = {};
  for (const c of ['open', 'display', 'color']) out.diff[c] = diff(out.themes.dark.shots[c], out.themes.light.shots[c]);
  out.errors = errors;
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  L.fs.writeFileSync(L.W + '/out/theme_electron.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
