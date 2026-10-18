// 画面（Chromium で dist/index.html）に試験のファイルを開かせ、結果（座標・色・欄・知らせ）を書き出す
//   使い方: node bcheck.js <manifest.json> <出力フォルダ> [id の正規表現] [--only-browser]
//   環境変数: PAGE（既定 file:///home/claude/pcd-viewer/dist/index.html）、WAIT（1 件の待ち上限 ms、既定 90000）
//   ・試験ごとに、前に開いたファイル・軌跡をすべて閉じてから開く（S.offset も消える）
//   ・cap のある試験は、capSel に試験用の選択肢を足して選ぶ（maxPoints() の道筋はそのまま）
//   出力: <出力フォルダ>/<id>.json（node_check.mjs と同じ形 + msg, msgIsError, files[], errors[]）
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path');
const [manifestPath, outDir, filt, ...rest] = process.argv.slice(2);
const DATA = path.dirname(manifestPath);
const cases = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).filter(c => !filt || new RegExp(filt).test(c.id)).filter(c => !c.extra || !c.extra.no_browser);
const PAGE = process.env.PAGE || 'file:///home/claude/pcd-viewer/dist/index.html';
const LIMIT = Number(process.env.WAIT || 90000);

async function open(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.__errors = [];
  p.on('pageerror', e => p.__errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') p.__errors.push('console: ' + m.text()); });
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  return p;
}
async function settle(p, t0) {
  let last = '', since = Date.now();
  await p.waitForTimeout(250);
  while (true) {
    const s = await p.evaluate(() => JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length, window.__pcd.S.trajs.length, document.getElementById('statMsg').textContent]));
    if (s !== last) { last = s; since = Date.now(); }
    if (JSON.parse(s)[0] && Date.now() - since > 700) return false;
    if (Date.now() - t0 > LIMIT) return true;
    await p.waitForTimeout(150);
  }
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  let p = await open(b);
  let done = 0;
  for (const c of cases) {
    const out = path.join(outDir, c.id + '.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    p.__errors = [];
    await p.evaluate(() => {
      let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click();
      while ((x = document.querySelector('#trajList [data-act=tremove]'))) x.click();
      document.getElementById('statMsg').textContent = ''; document.getElementById('statMsg').style.color = '';
      // 知らせの移り変わりを記録する
      if (!window.__msgObs) {
        const el = document.getElementById('statMsg');
        window.__msgObs = new MutationObserver(() => { if (el.textContent) window.__msgs.push((el.style.color ? '[赤] ' : '') + el.textContent); });
        window.__msgObs.observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
      }
      window.__msgs = [];
    });
    await p.evaluate(cap => {
      const s = document.getElementById('capSel');
      const v = String(cap || 30000000);
      if (![...s.options].some(o => o.value === v)) s.add(new Option('試験 ' + v, v));
      s.value = v; s.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('statMsg').textContent = '';
    }, c.cap);
    await p.waitForTimeout(100);
    const t0 = Date.now();
    const files = c.files.map(f => path.join(DATA, f));
    await p.setInputFiles(c.kind === 'traj' ? '#trajInput' : '#fileInput', files);
    const timedOut = await settle(p, t0);
    const r = await p.evaluate(async () => {
      const S = window.__pcd.S, o = S.offset || [0, 0, 0];
      const b64 = a => { let s = ''; const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
      const files = [];
      for (const f of S.files) {
        const P = new Float64Array(3 * f.n);
        for (let i = 0; i < 3 * f.n; i++) P[i] = f.positions[i] + o[i % 3];
        const rgbAttr = f.geom.getAttribute('rgbc');
        const F = {};
        for (const nm of f.header.fields) {
          if (nm === 'x' || nm === 'y' || nm === 'z' || nm === 'rgb') continue;
          try { const m = await window.__pcd.call({ type: 'field', id: f.id, name: nm }); F[nm] = b64(new Float32Array(m.values)); } catch (e) { F[nm] = null; }
        }
        files.push({ name: f.name, n: f.n, total: f.total, sampled: f.sampled, skipped: f.skipped, format: f.header.data, note: f.header.note, fields: f.header.fields,
          rgb: !!f.hasRgb, P: b64(P), C: rgbAttr ? b64(rgbAttr.array) : null, F, bboxMin: f.bbox.min, bboxMax: f.bbox.max });
      }
      const trajs = S.trajs.map(t => ({ name: t.name, count: t.count, length: t.length, duration: t.duration, topic: t.topic, P: b64(t.P) }));
      const el = document.getElementById('statMsg');
      return { files, trajs, offset: S.offset, msg: el.textContent, msgIsError: !!el.style.color, title: document.title, msgs: [...new Set(window.__msgs)] };
    });
    const f0 = r.files[0];
    const res = { id: c.id, ms: Date.now() - t0, timedOut, msg: (r.msgs || []).filter(m => !/^次に開くファイル|水平補正/.test(m)).join(' → ') || r.msg, msgs: r.msgs, msgIsError: r.msgIsError, offset: r.offset, files: r.files, trajs: r.trajs, errors: p.__errors.slice(0, 10) };
    if (c.kind === 'traj') Object.assign(res, { ok: r.trajs.length > 0, n: r.trajs.length ? r.trajs[0].count : undefined, error: r.trajs.length ? null : r.msg });
    else if (f0) Object.assign(res, { ok: true, n: f0.n, total: f0.total, skipped: f0.skipped, sampled: f0.sampled, fields: f0.fields, rgb: f0.rgb, format: f0.format, note: f0.note, P: f0.P, C: f0.C, F: f0.F });
    else Object.assign(res, { ok: false, error: r.msg });
    fs.writeFileSync(out, JSON.stringify(res));
    done++;
    // ページで例外が起きた・時間切れのときは、次の試験に響かないよう開き直す
    if (timedOut || p.__errors.some(e => e.startsWith('pageerror'))) { await p.close(); p = await open(b); }
  }
  await b.close();
  console.log(`bcheck: ${done} 件`);
})().catch(e => { console.log(JSON.stringify({ fatal: e.message, stack: e.stack })); process.exit(1); });
