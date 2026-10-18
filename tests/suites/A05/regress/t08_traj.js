// t08 軌跡: 地図と一緒に開く（ダイアログ・ドロップ）、軌跡だけ、形式の違い（txt・TUM・CSV 見出し・MCAP・圧縮 MCAP）、
//     判定の誤り（点群なのに軌跡と判定）、表示の切り替え・閉じる・軌跡に沿って動かす、水平補正・大きな座標との重なり
//   heavy node t08_traj.js
const L = require('./lib.js');
const D = L.DATA;

async function tr(p) {
  return p.evaluate(() => {
    const S = window.__pcd.S, $ = id => document.getElementById(id);
    return { files: S.files.map(f => f.name), trajs: S.trajs.map(t => ({ name: t.name, count: t.count, len: +t.length.toFixed(2), topic: t.topic, vis: t.visible, gvis: t.group.visible })),
      msg: $('statMsg').textContent, err: !!$('statMsg').style.color, moveRow: !$('trajMoveRow').hidden, hint: !$('trajMoveHint').hidden, empty: !$('empty').hidden,
      sub: [...document.querySelectorAll('#trajList .sub')].map(e => e.textContent) };
  });
}
// 軌跡の始点・終点（世界座標＝水平補正後）と、地図の範囲
async function geo(p) {
  return p.evaluate(() => {
    const S = window.__pcd.S, e = window.__pcd.world.matrixWorld.elements;
    const W = (x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
    const t = S.trajs[0]; if (!t) return null;
    const a = W(t.P[0], t.P[1], t.P[2]), b = W(t.P[t.P.length - 3], t.P[t.P.length - 2], t.P[t.P.length - 1]);
    return { start: a.map(v => +v.toFixed(2)), end: b.map(v => +v.toFixed(2)), bmin: S.bounds.min.map(v => +v.toFixed(2)), bmax: S.bounds.max.map(v => +v.toFixed(2)) };
  });
}
const inside = (q, g, m = 0.5) => q.every((v, k) => v >= g.bmin[k] - m && v <= g.bmax[k] + m);

(async () => {
  const R = L.recorder('t08_traj');
  const { p, errors, close } = await L.page();
  // ---- 地図と軌跡を「点群を開く」で一緒に選ぶ ----
  await L.open(p, [`${D}/c_xyzi.pcd`, `${D}/c_trajectory.txt`]);
  let s = await tr(p);
  R.ok('A1 「点群を開く」で地図と軌跡（c_trajectory.txt）を一緒に選ぶと、軌跡は軌跡として開く', s.trajs.length === 1 && s.files.length === 1, s);
  await L.shot(p, 't08_A1_dialog_map_and_traj');
  await L.closeAll(p);
  // 軌跡を先に選んだ場合（並び順で 1 つ目が軌跡になる）
  await L.open(p, [`${D}/c_trajectory.txt`, `${D}/c_xyzi.pcd`]);
  s = await tr(p);
  const lvl = await p.evaluate(() => ({ result: document.getElementById('levelResult').textContent, files: window.__pcd.S.files.map(f => f.name), n: window.__pcd.S.files.map(f => f.n) }));
  R.ok('A2 軌跡が先に並んでいても、地図が水平補正される', /傾き/.test(lvl.result), { ...lvl, msg: s.msg });
  await L.closeAll(p);
  // ---- ドロップ（自動判定）----
  await L.drop(p, [`${D}/c_xyzi.pcd`, `${D}/c_trajectory.txt`]);
  s = await tr(p);
  R.ok('B1 ドロップで地図と軌跡を一緒に落とすと、軌跡は軌跡として開く', s.trajs.length === 1 && s.files.length === 1 && s.trajs[0].count === 600, s.trajs);
  let g = await geo(p);
  R.ok('B2 水平補正のあと、軌跡は地図の中（床から 0.45 m の高さ）を通る', g && inside(g.start, g) && inside(g.end, g) && Math.abs(g.start[2] - 0.45) < 0.1, g);
  R.ok('B3 軌跡があると「軌跡に沿って」のつまみが出る', s.moveRow && !s.hint, s);
  // 軌跡に沿って動かす
  await L.card(p, 'view');
  await p.evaluate(() => { const e = document.getElementById('trajPos'); e.value = '500'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(400);
  const mid = await p.evaluate(() => ({ t: window.__pcd.controlsTarget().map(v => +v.toFixed(2)), val: document.getElementById('trajPosVal').textContent }));
  R.ok('B4 つまみを真ん中にすると、回転の中心が軌跡の真ん中（x≈15 m）に動く', Math.abs(mid.t[0] - ((g.start[0] + g.end[0]) / 2)) < 1.5 && /m$/.test(mid.val), { mid, g });
  // 表示の切り替え
  await L.card(p, 'display');
  await p.click('#showTraj'); await p.waitForTimeout(200);
  s = await tr(p);
  R.ok('B5 「軌跡を表示」を切ると隠れる', !s.trajs[0].gvis, s.trajs);
  await p.click('#showTraj'); await p.waitForTimeout(200);
  await L.card(p, 'open');
  await p.click('#trajList [data-act=tvis]'); await p.waitForTimeout(200);
  s = await tr(p);
  R.ok('B6 一覧のチェックで 1 本だけ隠す', !s.trajs[0].vis && !s.trajs[0].gvis, s.trajs);
  await p.click('#trajList [data-act=tvis]');
  await p.click('#trajList [data-act=tremove]'); await p.waitForTimeout(200);
  s = await tr(p);
  R.ok('B7 軌跡を閉じると一覧から消え、つまみも消える', !s.trajs.length && !s.moveRow && s.hint, s);
  await L.closeAll(p);
  // ---- 形式の違い（「軌跡を開く」） ----
  for (const f of ['c_trajectory.txt', 'c_traj.tum', 'c_traj_header.csv', 'c_odom.mcap']) {
    await L.openTraj(p, [`${D}/${f}`]);
    s = await tr(p);
    const t = s.trajs.find(x => x.name === f);
    R.ok(`C1 軌跡の形式 ${f}`, t && t.count === 600 && Math.abs(t.len - 29.3) < 1.5 && !s.err, { t, msg: s.msg, sub: s.sub[s.sub.length - 1] });
  }
  await L.openTraj(p, [`${D}/c_odom_zstd.mcap`]);
  s = await tr(p);
  R.ok('C2 圧縮された MCAP は分かる知らせ（赤）', s.err && /圧縮された MCAP には対応していません/.test(s.msg), s.msg);
  await L.openTraj(p, [`${D}/c_xyzi.pcd`]);
  s = await tr(p);
  R.ok('C3 「軌跡を開く」で点群（PCD）を選ぶと、軌跡として読めない知らせ', s.err && /軌跡として読める行がありません/.test(s.msg), s.msg);
  // ---- 軌跡だけ（点群なし） ----
  s = await tr(p);
  const only = await p.evaluate(() => {
    const S = window.__pcd.S, c = window.__pcd.cam; c.updateMatrixWorld();
    const t = S.trajs[0], e = c.matrixWorldInverse.elements, P = c.projectionMatrix.elements;
    let inView = 0;
    for (let i = 0; i < t.count; i += 10) {
      const v = [t.P[3 * i], t.P[3 * i + 1], t.P[3 * i + 2], 1];
      const m = (M, v) => [0, 1, 2, 3].map(r => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r] * v[3]);
      const cl = m(P, m(e, v)); const x = cl[0] / cl[3], y = cl[1] / cl[3];
      if (Math.abs(x) <= 1 && Math.abs(y) <= 1 && cl[3] > 0) inView++;
    }
    return { inView, total: Math.ceil(t.count / 10) };
  });
  R.ok('D1 軌跡だけを開いたとき、軌跡が画面に収まる', only.inView === only.total, only);
  R.ok('D2 軌跡だけを開いたとき、「点群ファイルをここにドラッグ」の案内が軌跡に重ならない', !s.empty, s);
  await L.shot(p, 't08_D_traj_only');
  await L.card(p, 'view'); await p.click('[data-view="fit"]'); await p.waitForTimeout(700);
  const only2 = await p.evaluate(() => window.__pcd.controlsTarget().map(v => +v.toFixed(1)));
  R.ok('D3 軌跡だけのとき「全体」で軌跡に合わせられる', Math.hypot(only2[0] - 15, only2[1] - 5) < 10, only2);
  await L.closeAll(p);
  // ---- 点群なのに軌跡と判定されないか（ドロップ） ----
  for (const [f, why] of [['plain_xyz.txt', '対照（x y z だけ）'], ['scan_with_time.csv', '見出しに timestamp 列'], ['cc_export_merged.txt', 'CloudCompare の書き出し（Original cloud index 列）'], ['proposed_layout.txt', '名前に pose を含む']]) {
    await L.closeAll(p);
    await L.drop(p, [`${D}/${f}`]);
    s = await tr(p);
    R.ok(`E1 ドロップ: ${f}（${why}）は点群として開く`, s.files.length === 1 && s.trajs.length === 0, { files: s.files, trajs: s.trajs.map(t => t.name + ' ' + t.count + '姿勢 ' + t.len + 'm'), msg: s.msg });
  }
  await L.closeAll(p);
  // ---- 大きな座標（UTM）の地図と軌跡 ----
  await L.open(p, [`${D}/utm_map.pcd`]);
  await L.openTraj(p, [`${D}/utm_traj.txt`]);
  g = await geo(p);
  R.ok('F1 大きな座標（UTM）の地図と軌跡が重なる（軌跡にも同じシフトがかかる）', g && inside(g.start, g, 2) && inside(g.end, g, 2), g);
  await L.shot(p, 't08_F1_utm');
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
