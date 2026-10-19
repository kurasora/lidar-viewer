// t10 ファイルを開く画面の「種類」: showOpenFilePicker に渡す types（形式ごとに 1 行）を差し替えて調べる。
//     取り消し・使えないときの代わり（<input type=file>）・選んだファイルが開くか・本物の API で受け付けられるか
//   heavy node t10_picker.js
const L = require('./lib.js');
const D = L.DATA;

// Chromium の検査（third_party/blink/.../global_file_system_access.cc）と同じ: '.' で始まり、英数字・'+'・'.' だけ、'.' で終わらない、16 文字以内
const validExt = e => /^\.[A-Za-z0-9+.]*$/.test(e) && !e.endsWith('.') && e.length <= 16;

(async () => {
  const R = L.recorder('t10_picker');
  const stub = () => {
    window.__calls = []; window.__mode = 'abort';
    window.showOpenFilePicker = async function (opts) {
      window.__calls.push(JSON.parse(JSON.stringify(opts)));
      if (window.__mode === 'abort') throw new DOMException('The user aborted a request.', 'AbortError');
      if (window.__mode === 'security') throw new DOMException('Must be handling a user gesture to show a file picker.', 'SecurityError');
      return window.__handles || [];
    };
  };
  let { p, errors, close } = await L.page({ init: stub });
  await L.card(p, 'open');
  await p.click('#btnOpen'); await p.waitForTimeout(300);
  let calls = await p.evaluate(() => window.__calls);
  const c = calls[0];
  R.ok('P1 「点群を開く」で showOpenFilePicker が呼ばれる（複数選択・id）', c && c.multiple === true && c.id === 'pcdviewer-open', c && { multiple: c.multiple, id: c.id, n: c.types.length });
  const types = c.types;
  R.ok('P2 種類の一覧の 1 行目は「対応しているすべての形式」', types[0].description === '対応しているすべての形式', types[0].description);
  const oneLine = types.every(t => typeof t.description === 'string' && t.description && Object.keys(t.accept).length === 1 && Object.values(t.accept)[0].length >= 1);
  R.ok('P3 形式ごとに 1 行（各行に説明 1 つ・拡張子のまとまり 1 つ）', oneLine && types.length >= 30, `${types.length} 行`);
  const descs = types.map(t => t.description);
  R.ok('P4 行の説明が重ならない', new Set(descs).size === descs.length, descs.filter((d, i) => descs.indexOf(d) !== i));
  const bad = types.flatMap(t => Object.values(t.accept)[0]).filter(e => !validExt(e));
  R.ok('P5 すべての拡張子が Chromium の決まりに合う（ダイアログが出ずに代わりの画面になることがない）', !bad.length, bad);
  const all = new Set(Object.values(types[0].accept)[0]);
  const union = new Set(types.slice(1).flatMap(t => Object.values(t.accept)[0]));
  R.ok('P6 「すべて」の行は各行の拡張子をすべて含む', [...union].every(e => all.has(e)) && [...all].every(e => union.has(e)), [...union].filter(e => !all.has(e)));
  // <input type=file> の accept と食い違いがないか（試作ページなど、代わりの画面のとき）
  const acc = (await p.$eval('#fileInput', i => i.accept)).split(',');
  const onlyPicker = [...all].filter(e => !acc.includes(e)), onlyInput = acc.filter(e => !all.has(e));
  R.ok('P7 代わりの画面（<input accept>）と種類の一覧で選べる拡張子がそろっている', !onlyPicker.length && !onlyInput.length, { 一覧だけ: onlyPicker, inputだけ: onlyInput });
  R.ok('P8 一覧の説明は「拡張子の羅列」ではない（説明 + 括弧の中だけ）', types.slice(1).every(t => /^[^.(]+\(\*\./.test(t.description)), types.slice(1).map(t => t.description).filter(d => !/^[^.(]+\(\*\./.test(d)));
  // 取り消し → 代わりの画面を出さない
  let fc = null; p.once('filechooser', f => { fc = f; });
  await p.click('#btnOpen'); await p.waitForTimeout(800);
  R.ok('P9 ダイアログを取り消したとき（AbortError）は、代わりの画面（input）を出さない', !fc, fc && 'filechooser が出た');
  // 軌跡
  await p.click('#btnTraj'); await p.waitForTimeout(300);
  calls = await p.evaluate(() => window.__calls);
  const ct = calls[calls.length - 1];
  R.ok('P10 「軌跡を開く」の種類（すべて + 3 行、id）', ct.id === 'pcdviewer-traj' && ct.types.length === 4 && ct.types[0].description === '対応しているすべての軌跡', ct.types.map(t => t.description));
  // 選んだファイルが開くか（FileSystemFileHandle の代わり）
  const fs = require('fs');
  const b64 = fs.readFileSync(`${D}/c_xyzi.pcd`).toString('base64'), b64t = fs.readFileSync(`${D}/c_trajectory.txt`).toString('base64');
  await p.evaluate(([a, t]) => {
    const mk = (b, n) => ({ kind: 'file', name: n, getFile: async () => new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], n) });
    window.__handles = [mk(a, 'c_xyzi.pcd'), mk(t, 'c_trajectory.txt')]; window.__mode = 'files';
  }, [b64, b64t]);
  await p.click('#btnOpen'); await L.idle(p);
  let st = await L.state(p);
  R.ok('P11 種類の画面で地図と軌跡を選ぶと、地図は点群・軌跡は軌跡として開く', st.files.length === 1 && st.trajs.length === 1, { files: st.files.map(f => f.name + ' ' + f.n), trajs: st.trajs.map(t => t.name) });
  await L.closeAll(p);
  // showOpenFilePicker が使えない（SecurityError など）→ 代わりの <input> が開くか
  await p.evaluate(() => { window.__mode = 'security'; });
  fc = null; p.once('filechooser', f => { fc = f; });
  await p.click('#btnOpen'); await p.waitForTimeout(1500);
  R.ok('P12 showOpenFilePicker が失敗したら、代わりのファイル選択（input）が開く', !!fc, fc ? 'filechooser が出た' : '何も出ない');
  if (fc) { await fc.setFiles([`${D}/c_xyz.pcd`]); await L.idle(p); st = await L.state(p); R.ok('P12b 代わりの画面で選んだファイルが開く', st.files.length === 1, st.files.map(f => f.name)); }
  R.ok('ページのエラーなし（差し替え version）', !errors.length, errors.slice(0, 5));
  await close();
  // ---- 本物の showOpenFilePicker（headless Chromium）: 受け付けて選択画面まで進むか ----
  const real = () => {
    window.__res = []; const orig = window.showOpenFilePicker;
    if (orig) window.showOpenFilePicker = function (o) { const pr = orig.call(window, o); pr.then(() => window.__res.push('ok'), e => window.__res.push(e.name + ': ' + e.message)); return pr; };
  };
  ({ p, errors, close } = await L.page({ init: real }));
  const has = await p.evaluate(() => typeof window.showOpenFilePicker);
  await L.card(p, 'open');
  fc = null; p.once('filechooser', f => { fc = f; });
  await p.click('#btnOpen'); await p.waitForTimeout(2500);
  const res = await p.evaluate(() => window.__res);
  R.ok('Q1 本物の showOpenFilePicker が types を受け付ける（TypeError にならない）', has === 'function' && !res.some(r => /TypeError/.test(r)), { has, res, filechooser: !!fc, multiple: fc && fc.isMultiple() });
  if (fc) { await fc.setFiles([`${D}/c_xyzi.pcd`]).catch(e => R.ok('Q2 setFiles', false, e.message)); await L.idle(p); const s2 = await L.state(p); R.ok('Q2 本物の画面（Playwright が受けた）で選んだファイルが開く', s2.files.length === 1, s2.files.map(f => f.name)); }
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
