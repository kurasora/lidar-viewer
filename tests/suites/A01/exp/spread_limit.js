const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  await p.goto('file:///home/claude/pcd-viewer/dist/index.html');
  const r = await p.evaluate(() => {
    let lo = 1000, hi = 10000000;
    const ok = n => { try { Math.max(...new Float64Array(n)); return true; } catch (e) { return false; } };
    while (hi - lo > 1000) { const m = (lo + hi) >> 1; if (ok(m)) lo = m; else hi = m; }
    return lo;
  });
  console.log('Chromium で Math.max(...arr) が通る最大の長さ ≒', r, '→ z の幅（0.5〜99.5%）≒', (r * 0.05).toFixed(0), '単位');
  await b.close();
})();
