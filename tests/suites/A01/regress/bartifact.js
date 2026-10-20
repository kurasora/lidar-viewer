// 0.4.1 から: 画面は全部の点を持たない（描いたら捨てる）。全部の座標は別スレッドから __pcd.call({ type: 'buffers', id }) で借りる
// 試作ページ（dist-artifact/pcd-viewer.html）: 最初に開く廊下の地図のあとに、形式ごとのサンプルのボタンを押して開く
//   使い方: node bartifact.js <出力フォルダ> [ボタンの名前（正規表現、既定 ^\.las$|\.bin シフト|\.shp 点|\.e57|\.pcd binary）]
//   出力: <出力フォルダ>/artifact.json（ボタンごとの S.files の最後のファイルの座標・S.offset・知らせ）
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path');
const [OUT, filt] = process.argv.slice(2);
const PAGE = process.env.PAGE || 'file:///home/claude/pcd-viewer/dist-artifact/pcd-viewer.html';
const want = new RegExp(filt || '^\\.las$|^\\.bin シフト$|^\\.shp 点$|^\\.e57$|^\\.pcd binary$');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__pcd && window.__pcd.S.files.length >= 1 && window.__pcd.S.trajs.length >= 1 && document.getElementById('progress').hidden, null, { timeout: 300000 });
  await p.waitForTimeout(1500);
  const first = await p.evaluate(() => ({ files: window.__pcd.S.files.map(f => [f.name, f.n]), offset: window.__pcd.S.offset }));
  const labels = await p.evaluate(() => [...document.querySelectorAll('#fmtSampleList button[data-sg]')].map(b => b.textContent));
  const results = [];
  for (const label of labels) {
    if (!want.test(label)) continue;
    const before = await p.evaluate(() => window.__pcd.S.files.length);
    await p.evaluate(l => { window.__msgs = []; const el = document.getElementById('statMsg'); if (!window.__mo) { window.__mo = new MutationObserver(() => { if (el.textContent) window.__msgs.push(el.textContent); }); window.__mo.observe(el, { childList: true, characterData: true, subtree: true }); } [...document.querySelectorAll('#fmtSampleList button[data-sg]')].find(b => b.textContent === l).click(); }, label);
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      const s = await p.evaluate(n => window.__pcd.S.files.length > n && document.getElementById('progress').hidden, before);
      if (s) break;
      await p.waitForTimeout(300);
    }
    await p.waitForTimeout(800);
    const r = await p.evaluate(async () => {
      const S = window.__pcd.S, f = S.files[S.files.length - 1], o = S.offset || [0, 0, 0];
      const bf = await window.__pcd.call({ type: 'buffers', id: f.id }); // 全部の座標は別スレッドから借りる
      const P = new Float64Array(3 * f.n);
      for (let i = 0; i < 3 * f.n; i++) P[i] = bf.positions[i] + o[i % 3];
      let s = ''; const u = new Uint8Array(P.buffer); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return { name: f.name, n: f.n, offset: S.offset, P: btoa(s), msgs: window.__msgs.slice() };
    });
    results.push({ label, ...r });
    console.log(label, r.name, r.n, JSON.stringify(r.offset), r.msgs.join(' / '));
  }
  fs.writeFileSync(path.join(OUT, 'artifact.json'), JSON.stringify({ first, results, errors }));
  await b.close();
})().catch(e => { console.log('fatal', e.message); process.exit(1); });
