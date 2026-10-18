// 長い名前・たくさんのファイル・長い知らせ・大きな数の表示（Chromium）
//   node longnames.js [幅x高さ]
const L = require('./lib.js');
const { check } = require('./layout_checks.js');
const S = require('./states.js');
const mk = (s, n) => { let o = ''; while ([...o].length < n) o += s; return [...o].slice(0, n).join(''); };
// 200 文字（拡張子込み）: 日本語・英語・空白・絵文字
const NAME_MIX = mk('研究室の廊下 3F 東側 Long Corridor Scan 🚀🌸 第2回 走行 i-Cart mini + Livox MID-360 点群地図 (FAST-LIO 出力) final version ', 196) + '.pcd';
// 200 文字（空白なしの英数字）
const NAME_ASCII = mk('corridor_scan_2026-10-17_run02_livox_mid360_fastlio_map_final_v2_', 196) + '.pcd';
(async () => {
  const [w, h] = (process.argv[2] || '1280x800').split('x').map(Number);
  const tag = `${w}x${h}`;
  const { p, errors, close } = await L.chromium({ w, h });
  const out = { names: { NAME_MIX: [...NAME_MIX].length, NAME_ASCII: [...NAME_ASCII].length }, cases: [] };
  const snap = async (name, extra = {}) => { await p.waitForTimeout(350); const f = await L.shot(p, `long/${tag}_${name}`); out.cases.push({ name, shot: f, issues: await check(p), ...extra }); };
  // 1) 長い名前（読み込み中の表示も）: 大きめのファイル（map.laz）に長い名前を付けて開き、読み込み中に写真を撮る
  const b64 = L.fs.readFileSync('/home/claude/pcd-viewer/sample/map.laz').toString('base64');
  await p.evaluate(({ b64, n }) => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); window.__pcd.enqueue([new File([bin], n)], 'cloud'); }, { b64, n: NAME_MIX.replace(/\.pcd$/, '.laz') });
  await p.waitForFunction(() => !document.getElementById('progress').hidden, null, { timeout: 10000 }).catch(() => {});
  const prog = await p.evaluate(() => { const b = document.getElementById('progress').getBoundingClientRect(), t = document.getElementById('progressText'); return { box: [b.x, b.y, b.width, b.height].map(Math.round), textW: t.scrollWidth, boxW: Math.round(b.width), text: t.textContent }; });
  await snap('01_progress_longname', { prog });
  await L.waitIdle(p);
  await snap('02_loaded_longname_hud');
  await L.openCard(p, 'open'); await p.evaluate(() => { document.getElementById('infoBox').open = true; }); await snap('03_open_longname');
  await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#colorBasic [data-val="single"]'); await snap('04_legend_single_longname');
  await p.click('#colorBasic [data-val="height"]');
  await L.closeAll(p);
  // 2) 空白なしの長い名前
  await L.openAs(p, L.FILES + '/corr_int_label.pcd', [NAME_ASCII]);
  await snap('05_loaded_ascii_hud');
  await L.closeCards(p); await L.openCard(p, 'open'); await p.evaluate(() => { document.getElementById('infoBox').open = true; }); await snap('06_open_ascii');
  await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#colorBasic [data-val="single"]'); await snap('07_legend_single_ascii');
  const legendOverflow = await p.evaluate(() => { const pop = document.getElementById('pop'); return { popSW: pop.scrollWidth, popCW: pop.clientWidth, legendSW: document.getElementById('legend').scrollWidth, legendCW: document.getElementById('legend').clientWidth }; });
  out.legendOverflow = legendOverflow;
  await p.click('#colorBasic [data-val="height"]');
  await L.closeAll(p); await L.closeCards(p);
  // 3) 30 個のファイル
  const names30 = Array.from({ length: 30 }, (_, i) => `scan_${String(i + 1).padStart(2, '0')}_廊下の点群.pcd`);
  await L.openAs(p, L.FILES + '/corr_int_label.pcd', names30);
  await snap('08_30files_hud');
  await L.openCard(p, 'open'); await snap('09_30files_open');
  await p.evaluate(() => { document.getElementById('pop').scrollTop = 99999; }); await snap('10_30files_open_bottom');
  out.files30 = await p.evaluate(() => ({ n: window.__pcd.S.files.length, pop: { sh: document.getElementById('pop').scrollHeight, ch: document.getElementById('pop').clientHeight } }));
  await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#colorBasic [data-val="single"]'); await snap('11_30files_legend_single');
  await p.click('#colorBasic [data-val="height"]');
  await L.closeAll(p); await L.closeCards(p);
  // 4) 長い知らせ（誤り）
  const msgs = [];
  for (const f of ['scan.rdb', 'broken_header.pcd', 'notes.abc']) {
    await L.openAs(p, L.FILES + '/' + f, [f === 'scan.rdb' ? NAME_MIX.replace(/\.pcd$/, '.rdb') : f]);
    const m = await p.evaluate(() => { const el = document.getElementById('statMsg'); return { text: el.textContent, shownW: el.clientWidth, fullW: el.scrollWidth, red: !!el.style.color }; });
    msgs.push({ file: f, ...m });
    await snap('12_msg_' + f.replace(/\W/g, '_'));
  }
  // 誤りのファイルと正しいファイルを一緒に開くと、誤りの知らせは残るか（すぐ上書きされないか）
  await L.closeAll(p);
  const goodB64 = L.fs.readFileSync(L.FILES + '/corr_xyz.pcd').toString('base64');
  await p.evaluate(({ goodB64 }) => {
    const bin = Uint8Array.from(atob(goodB64), c => c.charCodeAt(0));
    window.__msgLog = []; const el = document.getElementById('statMsg');
    new MutationObserver(() => window.__msgLog.push([el.textContent, !!el.style.color])).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
    window.__pcd.enqueue([new File([new Uint8Array(64)], 'A_bad_scan.rdb'), new File([bin], 'B_good.pcd'), new File(['hello'], 'C_notes.abc'), new File([bin], 'D_good.pcd')], 'cloud');
  }, { goodB64 });
  await L.waitIdle(p);
  out.mixedQueue = await p.evaluate(() => ({ final: document.getElementById('statMsg').textContent, log: window.__msgLog.filter(x => x[0]).map(x => (x[1] ? '[赤] ' : '') + x[0]) }));
  await snap('12z_mixed_queue');
  await L.closeAll(p);
  out.msgs = msgs;
  // 5) 座標 1e7
  await L.openFiles(p, [L.FILES + '/corr_1e7.pcd']);
  await L.openCard(p, 'open'); await p.evaluate(() => { document.getElementById('infoBox').open = true; }); await snap('13_1e7_info');
  await L.closeCards(p); await L.openCard(p, 'section'); await p.click('.axes3 [data-axis="0"]'); await snap('14_1e7_section');
  await p.click('#tabClip'); await snap('15_1e7_clip');
  await p.click('#tabSec'); await p.click('.axes3 [data-axis="0"]');
  await L.closeCards(p); await L.openCard(p, 'color'); await p.click('#tabColorDetail'); await snap('16_1e7_color_range');
  await p.click('#tabColorBasic');
  await L.closeCards(p); await p.click('[data-tool="info"]');
  for (const [nm, area] of [['center', undefined], ['right', { x0: 0.8, x1: 0.99, y0: 0.1, y1: 0.9 }], ['left', { x0: 0.0, x1: 0.1, y0: 0.1, y1: 0.9 }]]) {
    const q = await S.findVisiblePoint(p, area);
    if (q) { await p.mouse.click(q.x, q.y); await p.waitForTimeout(600); const bx = await p.evaluate(() => { const r = document.getElementById('pickBox').getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom].map(Math.round); }); await snap('17_1e7_pick_' + nm, { pickBox: bx, vw: w }); }
  }
  await p.click('[data-tool="info"]');
  await p.click('[data-tool="measure"]');
  const a = await S.findVisiblePoint(p, { x0: 0.1, x1: 0.3, y0: 0.2, y1: 0.8 }), b2 = await S.findVisiblePoint(p, { x0: 0.7, x1: 0.95, y0: 0.2, y1: 0.8 });
  if (a && b2) { await p.mouse.click(a.x, a.y); await p.waitForTimeout(300); await p.mouse.move(b2.x, b2.y); await p.waitForTimeout(500); await snap('18_1e7_measure_live'); await p.mouse.click(b2.x, b2.y); await p.waitForTimeout(400); await snap('19_1e7_measure_table'); }
  await p.click('[data-tool="measure"]');
  // 6) 大きな数（10 億点）: 表示だけを確かめるため、読み込んだファイルの点数の値を書き換えて一覧と右上を描き直させる（模擬）
  await L.closeAll(p);
  await L.openFiles(p, [L.FILES + '/corr_int_label.pcd']);
  await p.evaluate(() => { const f = window.__pcd.S.files[0]; f.n = 1e9; f.total = 2e9; f.sampled = true; f.size = 26e9; f.skipped = 123456789; });
  await p.evaluate(() => { const cb = document.querySelector('#fileList input[type=checkbox]'); cb.click(); cb.click(); document.querySelector('#fileList .name').click(); });
  await L.openCard(p, 'open'); await p.evaluate(() => { document.getElementById('infoBox').open = true; }); await snap('20_1e9_open');
  await L.closeCards(p); await L.openCard(p, 'display'); await p.selectOption('#capSel', '1000000000'); await snap('21_cap_1e9');
  out.errors = errors;
  L.fs.mkdirSync(L.W + '/out', { recursive: true });
  L.fs.writeFileSync(`${L.W}/out/longnames_${tag}.json`, JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ prog: out.cases[0].prog, legendOverflow: out.legendOverflow, files30: out.files30, msgs: out.msgs, mixedQueue: out.mixedQueue, issues: out.cases.map(c => [c.name, c.issues.length]) }, null, 1));
  await close();
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
