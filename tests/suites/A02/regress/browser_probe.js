// 画面（本番と同じ道筋）にファイルを開かせて、cases.json の期待値と比べる
//   使い方: node browser_probe.js [絞り込みの正規表現]
//   環境変数:
//     MODE     … browser（既定。Chromium で dist/index.html）/ electron（アプリ本体）/ artifact（試作ページ）
//     ALL=1    … electron / artifact でも where に browser がある試験をすべて流す（既定は where に electron があるものだけ）
//     PAGE     … browser のときに開くページ（写しの dist を試すとき）
//     APPDIR   … electron のアプリのフォルダ（既定 /home/claude/pcd-viewer）
//     USERDATA … electron の設定の置き場所（既定 $W/ud-probe）
//     SHOT     … 食い違いがあった試験の画面写真を保存するフォルダ
//     WAIT     … 1 件の待ち時間の上限（ミリ秒、既定 120000）
//   出力: 1 件 1 行の JSON（id, ok, bad[], msg, files[]）。最後に集計
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path');
const HERE = __dirname, DATA = path.join(HERE, 'data');
const probe = require(path.join(HERE, 'probe.js'));
const probeSrc = fs.readFileSync(path.join(HERE, 'probe.js'), 'utf8');
const MODE = process.env.MODE || 'browser';
const filt = new RegExp(process.argv[2] || '.');
const want = c => (MODE === 'browser' ? c.where.includes('browser') : (c.where.includes(MODE) || (MODE === 'electron' && c.where.includes('electron')) || (process.env.ALL && c.where.includes('browser'))));
const cases = JSON.parse(fs.readFileSync(path.join(DATA, 'cases.json'), 'utf8')).filter(c => want(c) && filt.test(c.id));
const W = path.resolve(HERE, '..');

(async () => {
  let app = null, b = null, p;
  if (MODE === 'electron') {
    const APPDIR = process.env.APPDIR || '/home/claude/pcd-viewer';
    app = await pw._electron.launch({
      executablePath: '/home/claude/pcd-viewer/node_modules/electron/dist/electron',
      args: ['--no-sandbox', path.join(APPDIR, 'main.js')],
      env: { ...process.env, PCDV_USERDATA: process.env.USERDATA || path.join(W, 'ud-probe') },
    });
    p = await app.firstWindow();
  } else {
    b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
    p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    const page = MODE === 'artifact' ? 'file:///home/claude/pcd-viewer/dist-artifact/pcd-viewer.html' : (process.env.PAGE || 'file:///home/claude/pcd-viewer/dist/index.html');
    await p.goto(page);
  }
  let errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 300)); });
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  if (MODE === 'artifact') await p.waitForFunction(() => window.__pcd.S.files.length >= 1, null, { timeout: 120000 }).catch(() => {});
  await p.evaluate(probeSrc);
  await p.waitForTimeout(500);
  let pass = 0, fail = 0;
  for (const c of cases) {
    errors = [];
    await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); document.getElementById('statMsg').textContent = ''; });
    await p.evaluate(v => { const s = document.getElementById('capSel'); if (s.value !== v) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } }, String(c.cap || 30000000));
    await p.waitForTimeout(150);
    await p.evaluate(() => { document.getElementById('statMsg').textContent = ''; });
    const files = c.files.map(f => path.join(DATA, f));
    const t0 = Date.now();
    if (c.drop) {
      const payload = files.map(f => ({ name: path.basename(f), b64: fs.readFileSync(f).toString('base64') }));
      await p.evaluate(payload => {
        const dt = new DataTransfer();
        for (const f of payload) dt.items.add(new File([Uint8Array.from(atob(f.b64), ch => ch.charCodeAt(0))], f.name));
        window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, payload);
    } else await p.setInputFiles('#fileInput', files);
    let last = '', stableSince = Date.now(), timedOut = false;
    const limit = Number(process.env.WAIT || 120000);
    await p.waitForTimeout(300);
    while (true) {
      const s = await p.evaluate(() => JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, document.getElementById('statMsg').textContent]));
      if (s !== last) { last = s; stableSince = Date.now(); }
      if (JSON.parse(s)[0] && Date.now() - stableSince > 1200) break;
      if (Date.now() - t0 > limit) { timedOut = true; break; }
      await p.waitForTimeout(200);
    }
    const specs = {};
    if (c.expect.perFile) for (const pe of c.expect.perFile) specs[pe.name] = { parts: (pe.expect.parts || []).map(q => ({ name: q.name, box: q.box })) };
    specs['*'] = { parts: (c.expect.parts || []).map(q => ({ name: q.name, box: q.box })) };
    const r = await p.evaluate(specs => {
      const S = window.__pcd.S;
      const out = S.files.map(f => {
        const at = f.geom.getAttribute('rgbc');
        const g = { name: f.name, n: f.n, total: f.total, positions: f.positions, rgb: at ? at.array : null, fmt: f.header.data, note: f.header.note, fields: f.header.fields.filter(x => !['x', 'y', 'z', 'rgb'].includes(x)), fieldStats: f.stats };
        return window.__probe.summarize([g], S.offset, specs[f.name] || specs['*'])[0];
      });
      const el = document.getElementById('statMsg');
      return { files: out, offset: S.offset, msg: el.textContent, msgIsError: !!el.style.color, svgScript: window.__svgScript || null };
    }, specs);
    const bad = probe.check(r, c.expect);
    if (c.expect.domAbsent || c.expect.noGlobal) {
      await p.waitForTimeout(800);
      const d = await p.evaluate(([sels, g]) => ({ found: (sels || []).filter(s => document.querySelector(s)).map(s => s + ' → ' + document.querySelector(s).outerHTML.slice(0, 120)), global: g ? (window[g] ?? null) : null, info: (document.getElementById('info') || {}).innerHTML?.slice(0, 600) }), [c.expect.domAbsent, c.expect.noGlobal]);
      for (const f of d.found) bad.push('ファイルの中身から HTML の要素ができた: ' + f);
      if (d.global !== null) bad.push(`ファイルの中身のスクリプトが動いた: window.${c.expect.noGlobal} = ${d.global}`);
      r.dom = d;
    }
    if (timedOut) bad.push('時間切れ（読み込みが終わらない）');
    if (r.svgScript) bad.push('SVG の中の script が動いた');
    const ok = bad.length === 0;
    ok ? pass++ : fail++;
    if (!ok && process.env.SHOT) { fs.mkdirSync(process.env.SHOT, { recursive: true }); await p.screenshot({ path: path.join(process.env.SHOT, `${MODE}_${c.id}.png`) }).catch(() => {}); }
    console.log(JSON.stringify({ id: c.id, mode: MODE, ok, bad, ms: Date.now() - t0, msg: r.msg, msgIsError: r.msgIsError, offset: r.offset, errors: errors.slice(0, 6), dom: r.dom,
      files: r.files.map(f => ({ name: f.name, n: f.n, min: f.min, max: f.max, mean: f.mean, rgb: f.rgb, color: f.color, fmt: f.fmt, note: f.note, fields: f.fields, parts: f.parts, stray: f.stray, strayEx: f.strayEx })) }));
  }
  console.log(JSON.stringify({ summary: true, runner: MODE, pass, fail }));
  if (app) await app.close(); else await b.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message })); process.exit(1); });
