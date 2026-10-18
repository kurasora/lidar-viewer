// t11 誤りの流れ: 開けない拡張子・RIEGL・壊れたファイル・空ファイル、誤りのあとに普通のファイル、
//     いくつか一緒に開いて 1 つが失敗したとき（知らせが残るか・どのファイルか分かるか）
//   heavy node t11_errors.js
const L = require('./lib.js');
const D = L.DATA;

async function msgs(p) {
  // 知らせの移り変わりを記録する
  await p.evaluate(() => {
    window.__msgs = [];
    const el = document.getElementById('statMsg');
    new MutationObserver(() => { if (el.textContent) window.__msgs.push({ t: el.textContent, err: !!el.style.color }); }).observe(el, { childList: true, characterData: true, subtree: true });
  });
}

(async () => {
  const R = L.recorder('t11_errors');
  const { p, errors, close } = await L.page();
  await msgs(p);
  const one = [
    ['unknown.xyzw', /\.xyzw は開けない形式です/],
    ['scan.rdbx', /RIEGL RDB の形式（\.rdbx）は、メーカーの専用ライブラリが必要なため開けません/],
    ['broken_trunc.pcd', /./],
    ['broken_header.pcd', /./],
    ['empty.pcd', /./],
    ['garbage.las', /./],
  ];
  for (const [f, re] of one) {
    await L.closeAll(p);
    await p.evaluate(() => { window.__msgs = []; });
    await L.drop(p, [`${D}/${f}`]);
    const m = await L.msg(p), st = await L.state(p);
    const prog = await p.evaluate(() => document.getElementById('progress').hidden);
    R.ok(`E1 ${f}: 赤い知らせ・点群は増えない・読み込み中の表示が消える`, m.err && re.test(m.text) && st.files.length === 0 && prog, m.text);
    R.ok(`E2 ${f}: 知らせにファイル名が入っている（どのファイルか分かる）`, m.text.includes(f), m.text);
  }
  // 壊れたファイルのあとに普通のファイル（同じ選択の中）
  await L.closeAll(p);
  await p.evaluate(() => { window.__msgs = []; });
  await L.drop(p, [`${D}/broken_trunc.pcd`, `${D}/c_xyzi.pcd`]);
  let st = await L.state(p);
  let hist = await p.evaluate(() => window.__msgs);
  R.ok('E3 壊れたファイルのあとの普通のファイルは開く', st.files.length === 1 && st.files[0].name === 'c_xyzi.pcd', st.files.map(f => f.name));
  const final = await L.msg(p);
  R.ok('E4 一緒に開いたうち 1 つが失敗したことが、最後まで分かる（知らせが上書きで消えない／一覧などに残る）', final.err || /失敗|開けません|開けない/.test(final.text), { final: final.text, 途中の知らせ: hist.map(h => (h.err ? '[赤]' : '') + h.t) });
  // 失敗のあと、別の選択で普通に開ける
  await L.closeAll(p);
  await L.drop(p, [`${D}/scan.rdbx`]);
  await L.open(p, [`${D}/c_xyz.pcd`]);
  st = await L.state(p);
  R.ok('E5 RIEGL を断ったあと、次に選んだファイルは普通に開く', st.files.length === 1 && !st.msgErr, st.msg);
  // 「点群を開く」の一覧にない拡張子もドロップでは来る → 断りの知らせ
  await L.closeAll(p);
  await L.drop(p, [`${L.SF}/icm_images.wrl`]);
  const w = await L.msg(p);
  R.ok('E6 .wrl だけを落とすと断りの知らせ（付属ファイル）', w.err, w.text);
  // 進み具合の表示が残らない（エラーのあと）
  const prog = await p.evaluate(() => ({ hidden: document.getElementById('progress').hidden }));
  R.ok('E7 エラーのあと読み込み中の表示が残らない', prog.hidden, prog);
  // 点の数が 0 の PCD
  const fsx = require('fs');
  fsx.writeFileSync(`${L.W}/tmp/zero.pcd`, '# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 0\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS 0\nDATA ascii\n');
  fsx.writeFileSync(`${L.W}/tmp/nan.pcd`, '# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 3\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS 3\nDATA ascii\nnan nan nan\nnan 1 2\n1 nan 2\n');
  for (const f of ['zero.pcd', 'nan.pcd']) {
    await L.closeAll(p);
    await L.drop(p, [`${L.W}/tmp/${f}`]);
    const m = await L.msg(p), s = await L.state(p);
    R.ok(`E8 ${f}: 点がない旨の赤い知らせ`, m.err && s.files.length === 0, m.text);
  }
  // 拡張子のない名前（フォルダを落としたときも、名前だけのファイルとして届く）
  await L.closeAll(p);
  await p.evaluate(() => {
    const dt = new DataTransfer(); dt.items.add(new File([], 'PCD'));
    const st = document.getElementById('stage');
    st.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    st.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await L.idle(p);
  const fm = await L.msg(p);
  R.ok('E9 拡張子のない名前（FAST-LIO の「PCD」フォルダを落とした場合など）→ 何が開けないのか分かる知らせ', fm.err && fm.text.includes('PCD') && !/^エラー: \. は/.test(fm.text), fm.text);
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
