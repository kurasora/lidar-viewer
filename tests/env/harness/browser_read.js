// 画面（Chromium で dist/index.html）にファイルを開かせて、結果を 1 組 1 行の JSON で出す
//   使い方: heavy xvfb-run -a node browser_read.js <ファイル> [<ファイル>...] [-- <次の組のファイル>...]
//     ・同時に選ぶファイル（.shp と .dbf、.obj と .mtl など）は 1 組に並べる。組の区切りは --
//     ・組ごとに、前に開いたファイルをすべて閉じてから開く
//   環境変数:
//     PAGE   … 開くページ（既定 http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html。自分の写しを試すときに）
//     CAP    … 点数の上限（capSel の値。例 10000000）
//     SHOT   … 画面写真を保存するフォルダ（組ごとに <番号>.png）
//     WAIT   … 1 組の待ち時間の上限（ミリ秒、既定 120000）
//   出力: {group, ms, files:[{name,n,total,fmt,fields,rgb,mean,min,max}], offset, msg, msgIsError, errors:[ページのエラー]}
//   ※ xvfb-run なしでも動く（Chromium は headless）。WebGL は SwiftShader（遅い）
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const argv = process.argv.slice(2);
  const groups = []; let g = [];
  for (const a of argv) { if (a === '--') { if (g.length) groups.push(g); g = []; } else g.push(path.resolve(a)); }
  if (g.length) groups.push(g);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  let errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto(process.env.PAGE || 'http://127.0.0.1:8740/abs/home/claude/pcd-viewer/dist/index.html');
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  if (process.env.CAP) await p.evaluate(v => { const s = document.getElementById('capSel'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, process.env.CAP);
  await p.waitForTimeout(300);
  let gi = 0;
  for (const grp of groups) {
    gi++; errors = [];
    await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); document.getElementById('statMsg').textContent = ''; });
    await p.waitForTimeout(150);
    const t0 = Date.now();
    await p.setInputFiles('#fileInput', grp);
    // 終わりの判定: 進み具合の表示が消え、ファイル数と知らせが 1 秒変わらない
    let last = '', stableSince = Date.now(), timedOut = false;
    const limit = Number(process.env.WAIT || 120000);
    await p.waitForTimeout(300);
    while (true) {
      const s = await p.evaluate(() => JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, document.getElementById('statMsg').textContent]));
      if (s !== last) { last = s; stableSince = Date.now(); }
      if (JSON.parse(s)[0] && Date.now() - stableSince > 1000) break;
      if (Date.now() - t0 > limit) { timedOut = true; break; }
      await p.waitForTimeout(200);
    }
    const r = await p.evaluate(async () => {
      const S = window.__pcd.S, o = S.offset || [0, 0, 0];
      const files = [];
      for (const f of S.files) {
        // 0.4.1 から画面は全部の点を持たない（描いたら捨てる）。全部の座標は別スレッドから借りる
        const P = (await window.__pcd.call({ type: 'buffers', id: f.id })).positions, n = f.n;
        const m = [0, 0, 0], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = P[3 * i + k] + o[k]; m[k] += v; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
        files.push({ name: f.name, n, total: f.total, fmt: f.header && f.header.data, fields: f.header && f.header.fields && f.header.fields.join(' '), rgb: f.hasRgb, mean: m.map(v => +(v / Math.max(1, n)).toFixed(4)), min: lo.map(v => +v.toFixed(4)), max: hi.map(v => +v.toFixed(4)) });
      }
      const el = document.getElementById('statMsg');
      return { files, offset: S.offset, msg: el.textContent, msgIsError: !!el.style.color };
    });
    if (process.env.SHOT) await p.screenshot({ path: path.join(process.env.SHOT, `${gi}.png`) });
    console.log(JSON.stringify({ group: grp.map(f => path.basename(f)), ms: Date.now() - t0, timedOut, ...r, errors: errors.slice(0, 10) }));
  }
  await b.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
