// A04 のブラウザでの確認（本番と同じ道筋: Chromium で dist/index.html を開き、ファイルを選ばせる）
//   使い方: $T/bin/heavy node browser_checks.js <試験用ファイルのフォルダ>
//   環境変数: PAGE（既定 file://$PCDV_ROOT/dist/index.html）、PCDV_ROOT、SHOT（写真の保存先）
//   出力: 1 項目 1 行の JSON（id・pass・detail）
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const fs = require('fs');
const ROOT = process.env.PCDV_ROOT || '/home/claude/pcd-viewer';
const PAGE = process.env.PAGE || `file://${ROOT}/dist/index.html`;
const D = path.resolve(process.argv[2] || '.');
const SAMPLES = path.join(ROOT, 'sample/formats');
const out = r => console.log(JSON.stringify(r));

async function open(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__pcd, null, { timeout: 60000 });
  return { p, errors };
}
async function load(p, files, kind = 'cloud', wait = 60000) {
  const sel = kind === 'traj' ? '#trajInput' : '#fileInput';
  const before = await p.evaluate(() => window.__pcd.S.files.length + window.__pcd.S.trajs.length);
  await p.setInputFiles(sel, files);
  const t0 = Date.now(); let last = '', since = Date.now();
  while (Date.now() - t0 < wait) {
    const s = await p.evaluate(() => JSON.stringify([document.getElementById('progress').hidden, window.__pcd.S.files.length + window.__pcd.S.trajs.length, document.getElementById('statMsg').textContent]));
    if (s !== last) { last = s; since = Date.now(); }
    const [hidden, n] = JSON.parse(s);
    if (hidden && n >= before + files.length && Date.now() - since > 800) break;
    if (Date.now() - since > 8000) break; // 8 秒変化なし
    await p.waitForTimeout(200);
  }
  return JSON.parse(last);
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });

  // ---- A04-008: 2 つ目のファイルが 1 つ目のシフトで丸められる（ローカル座標 → UTM）
  {
    const { p, errors } = await open(b);
    // 基準: UTM のファイルだけを開いたときの座標（x を並べ替えた列）
    await load(p, [path.join(SAMPLES, 'laspy_utm.las')]);
    const ref = await p.evaluate(() => { const f = window.__pcd.S.files[0], o = window.__pcd.S.offset; const a = []; for (let i = 0; i < f.n; i++) a.push(f.positions[3 * i] + o[0], f.positions[3 * i + 1] + o[1]); return { a, offset: o }; });
    await p.evaluate(() => { let x; while ((x = document.querySelector('#fileList [data-act=remove]'))) x.click(); });
    await load(p, [path.join(SAMPLES, 'cc_cloud.asc')]);
    await load(p, [path.join(SAMPLES, 'laspy_utm.las')]);
    const got = await p.evaluate(() => { const S = window.__pcd.S, f = S.files[1], o = S.offset; const a = []; for (let i = 0; i < f.n; i++) a.push(f.positions[3 * i] + o[0], f.positions[3 * i + 1] + o[1]); return { a, offset: o, names: S.files.map(x => x.name), msg: document.getElementById('statMsg').textContent }; });
    const sx = v => v.filter((_, i) => i % 2 === 0).sort((x, y) => x - y), sy = v => v.filter((_, i) => i % 2 === 1).sort((x, y) => x - y);
    const ex = sx(ref.a), gx = sx(got.a), ey = sy(ref.a), gy = sy(got.a);
    let e = 0; for (let i = 0; i < Math.min(ex.length, gx.length); i++) e = Math.max(e, Math.abs(ex[i] - gx[i]), Math.abs(ey[i] - gy[i]));
    const distinctY = new Set(gy.map(v => v.toFixed(3))).size;
    out({ id: 'A04-008', title: 'ローカル座標のファイルのあとに UTM のファイルを開くと座標が丸められる', pass: e < 0.01, detail: `シフト ${JSON.stringify(got.offset)}（1 つ目のファイルで決まる）、2 つ目（UTM）の座標の最大誤差 ${e.toFixed(4)} m、y の値の種類 ${distinctY}/${gy.length}（単独で開いたとき ${new Set(ey.map(v => v.toFixed(3))).size}）`, errors });
    if (process.env.SHOT) await p.screenshot({ path: path.join(process.env.SHOT, 'a04_008.png') });
    await p.close();
  }
  // ---- A04-017: 軌跡にグローバルシフトが当たらない（UTM の点群 + UTM の軌跡）
  {
    const { p, errors } = await open(b);
    await load(p, [path.join(SAMPLES, 'laspy_utm.las')]);
    await load(p, [path.join(D, 'utm_traj.txt')], 'traj');
    const r = await p.evaluate(() => { const S = window.__pcd.S, f = S.files[0], t = S.trajs[0]; return { offset: S.offset, cloudFirstLocal: [f.positions[0], f.positions[1], f.positions[2]], trajFirstLocal: t ? [t.P[0], t.P[1], t.P[2]] : null, trajCount: t && t.count, msg: document.getElementById('statMsg').textContent }; });
    const dist = r.trajFirstLocal ? Math.hypot(r.trajFirstLocal[0] - r.cloudFirstLocal[0], r.trajFirstLocal[1] - r.cloudFirstLocal[1]) : null;
    out({ id: 'A04-017', title: 'UTM の点群に同じ座標系の軌跡を重ねると、軌跡だけシフトされずに遠くに描かれる', pass: dist !== null && dist < 1000, detail: `シフト ${JSON.stringify(r.offset)}、点群の点（画面の座標）${JSON.stringify(r.cloudFirstLocal.map(v => +v.toFixed(2)))}、軌跡の始点（画面の座標）${JSON.stringify(r.trajFirstLocal && r.trajFirstLocal.map(v => +v.toFixed(2)))}、距離 ${dist && dist.toFixed(0)} m、知らせ「${r.msg}」`, errors });
    await p.close();
  }
  // ---- A04-015: 高さの範囲が大きいラスター（uint16 の 1 バンド）で天井の判定が例外を出し、そのあと読み込めなくなる
  {
    const { p, errors } = await open(b);
    const s1 = await load(p, [path.join(D, 'dem16.tif')]);
    const s2 = await load(p, [path.join(SAMPLES, 'cc_cloud.asc')], 'cloud', 20000);
    const r = await p.evaluate(() => ({ files: window.__pcd.S.files.map(f => f.name), progress: !document.getElementById('progress').hidden, progressText: document.getElementById('progressText').textContent, msg: document.getElementById('statMsg').textContent }));
    out({ id: 'A04-015', title: '高さの範囲が 65,535 m のラスターを開くと例外が出て、次のファイルが開けなくなる', pass: !errors.length && r.files.length === 2, detail: `開いたファイル ${JSON.stringify(r.files)}、読み込み中の表示 ${r.progress}「${r.progressText}」、知らせ「${r.msg}」、ページのエラー ${JSON.stringify(errors.slice(0, 3))}`, errors });
    if (process.env.SHOT) await p.screenshot({ path: path.join(process.env.SHOT, 'a04_015.png') });
    await p.close();
  }
  // ---- A04-015（その 2）: mm 単位の建物（高さ 9,000 mm）の点群・STEP のサンプル（mm のまま）
  {
    const ply = path.join(D, 'mm_building.ply');
    if (!fs.existsSync(ply)) { let s = 'ply\nformat ascii 1.0\nelement vertex 20000\nproperty float x\nproperty float y\nproperty float z\nend_header\n'; let q = 1; const g = () => (q = (Math.imul(q, 1103515245) + 12345) >>> 0) / 4294967296; for (let i = 0; i < 20000; i++) s += `${(g() * 20000).toFixed(1)} ${(g() * 8000).toFixed(1)} ${(g() * 9000).toFixed(1)}\n`; fs.writeFileSync(ply, s); }
    for (const f of [ply, path.join(SAMPLES, 'gmsh_parts.step')]) {
      const { p, errors } = await open(b);
      await load(p, [f], 'cloud', 120000);
      await load(p, [path.join(SAMPLES, 'cc_cloud.asc')], 'cloud', 20000);
      const r = await p.evaluate(() => ({ files: window.__pcd.S.files.map(x => ({ name: x.name, n: x.n, zr: (() => { const P = x.positions; let lo = Infinity, hi = -Infinity; for (let i = 2; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } return [lo, hi]; })() })), progress: !document.getElementById('progress').hidden, msg: document.getElementById('statMsg').textContent }));
      out({ id: 'A04-015', title: `高さの範囲が大きい点群（${path.basename(f)}）のあとに別のファイルを開く`, pass: !errors.length && r.files.length === 2, detail: `${JSON.stringify(r.files)}、読み込み中の表示 ${r.progress}、知らせ「${r.msg}」、エラー ${JSON.stringify(errors.slice(0, 2))}`, errors });
      await p.close();
    }
  }
  // ---- A04-016: カテゴリの色（値 0・100・200）: 画面の色と凡例の色
  {
    const { p, errors } = await open(b);
    await load(p, [path.join(D, 'labels.ply')]);
    await p.evaluate(() => { const s = document.getElementById('colorMode'); s.value = 'field'; s.dispatchEvent(new Event('change')); const f = document.getElementById('fieldSel'); f.value = 'label'; f.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(500);
    await p.evaluate(() => window.__pcd.setView('top', false));
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const P = window.__pcd, r = P.renderer, cam = P.cam, scene = P.world.parent;
      r.render(scene, cam);
      const gl = r.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // 3 つの塊の中心（x = 2, 22, 42、y = 2, z = 0）を画面に投影して色を読む
      const f = P.S.files[0], o = P.S.offset || [0, 0, 0];
      const cols = [2, 22, 42].map(cx => {
        const v = { x: cx - o[0], y: 2 - o[1], z: 0 - o[2] };
        const e = P.world.matrixWorld.elements; const w = [e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]];
        const m = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse).elements;
        const X = m[0] * w[0] + m[4] * w[1] + m[8] * w[2] + m[12], Y = m[1] * w[0] + m[5] * w[1] + m[9] * w[2] + m[13], Wc = m[3] * w[0] + m[7] * w[1] + m[11] * w[2] + m[15];
        const sx = Math.round((X / Wc + 1) / 2 * W), sy = Math.round((Y / Wc + 1) / 2 * H);
        // 周り 21×21 画素で、背景（左下の隅の色）以外でいちばん多い色
        const bg = [px[0], px[1], px[2]].join(), cnt = new Map();
        for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const i = 4 * ((sy + dy) * W + sx + dx); const k = [px[i], px[i + 1], px[i + 2]].join(); if (k !== bg) cnt.set(k, (cnt.get(k) || 0) + 1); }
        const best = [...cnt].sort((a, b) => b[1] - a[1])[0];
        return { sx, sy, rgb: best ? best[0].split(',').map(Number) : null, bg };
      });
      const legend = [...document.querySelectorAll('#legend .cats span')].map(s => ({ text: s.textContent, color: s.querySelector('i').style.background }));
      return { cols, legend };
    });
    const hex = c => (c ? '#' + c.map(v => v.toString(16).padStart(2, '0')).join('') : 'なし');
    const shown = r.cols.map(c => hex(c.rgb));
    const lg = r.legend.map(l => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(l.color); return m ? hex([+m[1], +m[2], +m[3]]) : l.color; });
    const same = shown.every((c, i) => c === lg[i]);
    out({ id: 'A04-016', title: 'カテゴリの値 0・100・200 の色: 画面と凡例', pass: same && new Set(shown).size === 3, detail: `画面の色 ${JSON.stringify(shown)}、凡例 ${JSON.stringify(r.legend.map((l, i) => l.text + ' ' + lg[i]))}`, errors });
    if (process.env.SHOT) await p.screenshot({ path: path.join(process.env.SHOT, 'a04_016.png') });
    await p.close();
  }
  // ---- A04-018: 欄の名前が HTML として画面に入る（PLY の property 名）
  {
    const { p, errors } = await open(b);
    await load(p, [path.join(D, 'html_field.ply')]);
    await p.evaluate(() => { document.querySelector('[data-open="color"]')?.click(); });
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({
      infoBold: document.querySelectorAll('#info b').length, infoStyle: document.querySelectorAll('#info style').length,
      optStyle: document.querySelectorAll('#fieldSel style, #fieldSel b').length,
      options: [...document.querySelectorAll('#fieldSel option')].map(o => o.value),
      statColor: getComputedStyle(document.getElementById('statPoints')).color,
    }));
    out({ id: 'A04-018', title: 'ファイルの中の欄の名前が HTML として画面に入る（情報・色の項目の一覧）', pass: r.infoBold === 0 && r.infoStyle === 0 && r.statColor !== 'rgb(255, 0, 0)', detail: JSON.stringify(r), errors });
    if (process.env.SHOT) await p.screenshot({ path: path.join(process.env.SHOT, 'a04_018.png') });
    await p.close();
  }
  // ---- A04-048: .icm のサンプル（.icm + 点群 + 画像の目録 .wrl）を一緒に開くと .wrl を単独で開こうとして誤りを出す
  {
    const { p, errors } = await open(b);
    const msgs = [];
    await p.exposeFunction('__a04msg', t => msgs.push(t));
    await p.evaluate(() => { const el = document.getElementById('statMsg'); new MutationObserver(() => window.__a04msg(el.textContent + (el.style.color ? '（赤）' : ''))).observe(el, { childList: true, characterData: true, subtree: true, attributes: true }); });
    await load(p, ['handmade_images.icm', 'icm_cloud.asc', 'icm_images.wrl'].map(f => path.join(SAMPLES, f)), 'cloud', 30000);
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({ files: window.__pcd.S.files.map(f => f.name), msg: document.getElementById('statMsg').textContent, red: !!document.getElementById('statMsg').style.color }));
    out({ id: 'A04-048', title: '.icm のサンプル（.icm・点群・.wrl）を一緒に開く', pass: !msgs.some(m => /（赤）/.test(m)), detail: `開いたファイル ${JSON.stringify(r.files)}、知らせの移り変わり ${JSON.stringify(msgs.filter(Boolean))}`, errors });
    await p.close();
  }
  // ---- A04-001（本番の道筋）: 9 列の CSV が高さの表になる
  {
    const { p, errors } = await open(b);
    const csv = path.join(D, 'cloud9.csv');
    if (!fs.existsSync(csv)) { let s = '//X,Y,Z,R,G,B,Nx,Ny,Nz\n'; for (let i = 0; i < 50; i++) s += `${(i * 0.37).toFixed(3)},${(i * 0.11).toFixed(3)},${(1 + i * 0.01).toFixed(3)},${i % 256},${(i * 3) % 256},${(i * 7) % 256},0,0,1\n`; fs.writeFileSync(csv, s); }
    await load(p, [csv]);
    const r = await p.evaluate(() => { const f = window.__pcd.S.files[0]; return f ? { n: f.n, fmt: f.header.data, rgb: f.hasRgb } : null; });
    out({ id: 'A04-001', title: '9 列の CSV（X,Y,Z,R,G,B,Nx,Ny,Nz）', pass: r && r.n === 50, detail: JSON.stringify(r), errors });
    await p.close();
  }
  await b.close();
})().catch(e => { console.log(JSON.stringify({ fatal: e.message, stack: e.stack })); process.exit(1); });
