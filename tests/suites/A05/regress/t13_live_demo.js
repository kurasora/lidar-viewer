// t13 ライブのカードの開閉と表示の切り替え（Chromium: アプリの窓口がないのでデモだけ）。ライブ中の表示/非表示・閉じる・今の点群を開く
//   heavy node t13_live_demo.js
const L = require('./lib.js');
const D = L.DATA;

async function lv(p) {
  return p.evaluate(() => {
    const $ = id => document.getElementById(id), S = window.__pcd.S;
    const live = window.__pcd.world.parent.children.find(o => o.isPoints && o.frustumCulled === false && o.material && o.material.uniforms && !o.material.uniforms.uMode);
    return { now: !$('liveNow').hidden, pick: !$('livePick').hidden, notApp: !$('liveNotApp').hidden, src: $('liveSrc').textContent, rate: $('liveRate').textContent, pause: $('btnLivePause').textContent,
      share: !$('liveShareBox').hidden, livePoints: live ? live.visible : null, empty: !$('empty').hidden,
      files: S.files.map(f => ({ name: f.name, vis: f.visible, pvis: f.points.visible, cb: !!document.querySelector(`#fileList li[data-id="${f.id}"] [data-act=vis]`)?.checked })),
      trajs: S.trajs.map(t => ({ vis: t.visible, gvis: t.group.visible })), msg: $('statMsg').textContent,
      devices: $('liveDevices').textContent, peers: $('livePeers').textContent, colors: [...document.querySelectorAll('[data-lcolor]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.lcolor) };
  });
}

(async () => {
  const R = L.recorder('t13_live_demo');
  const { p, errors, close } = await L.page();
  await p.click('[data-open="live"]'); await p.waitForTimeout(300);
  let s = await lv(p);
  R.ok('LD1 ライブのカード（ページ版）: アプリ版で使える旨の説明とデモ', s.notApp && s.devices.includes('アプリ版で使えます') && s.peers.includes('アプリ版で使えます') && s.pick && !s.now, s);
  await p.click('#btnLiveDemo'); await p.waitForTimeout(500);
  s = await lv(p);
  R.ok('LD2 点群がないときのデモ → 「点群を開いておく必要があります」、ライブにはならない', !s.now && s.pick && /デモには点群/.test(s.msg) && s.empty, s);
  await L.open(p, [`${D}/c_xyzi.pcd`, `${D}/c_xyz.pcd`]);
  await L.openTraj(p, [`${D}/c_trajectory.txt`]);
  await L.card(p, 'live');
  await p.click('#btnLiveDemo'); await p.waitForTimeout(2300);
  s = await lv(p);
  R.ok('LD3 デモ開始: 表示中の切り替え・地図と軌跡は隠れる・点が届く（点/秒）', s.now && !s.pick && s.livePoints && s.files.every(f => !f.pvis) && s.trajs.every(t => !t.gvis) && /[\d,]+ 点\/秒/.test(s.rate) && s.rate !== '0 点/秒' && !s.share, s);
  await p.click('#btnLivePause'); await p.waitForTimeout(1200);
  s = await lv(p);
  R.ok('LD4 一時停止 → 「一時停止中」「再開」', s.rate === '一時停止中' && s.pause === '再開', s.rate);
  await p.click('#btnLivePause'); await p.waitForTimeout(1200);
  s = await lv(p);
  R.ok('LD5 再開', s.pause === '一時停止' && /点\/秒/.test(s.rate), s.rate);
  for (const c of ['height', 'single', 'refl']) { await p.click(`[data-lcolor="${c}"]`); s = await lv(p); R.ok(`LD6 ライブの色 ${c}`, s.colors.join() === c, s.colors); }
  await p.evaluate(() => { const e = document.getElementById('livePersist'); e.value = '30'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  R.ok('LD7 重ねる時間 3.0 秒', (await p.textContent('#livePersistVal')) === '3.0 秒');
  // カードを閉じてもデモは続く
  await p.click('#popClose'); await p.waitForTimeout(1500);
  const n1 = await p.evaluate(() => document.getElementById('liveRate').textContent);
  await p.click('[data-open="live"]'); await p.waitForTimeout(300);
  s = await lv(p);
  R.ok('LD8 カードを閉じてもデモは続き、開き直すと表示中の切り替えが出る', s.now && /点\/秒/.test(n1), { n1, s: s.now });
  // ライブ中に一覧で 1 つ目を隠す → 止めたあとも隠れたまま
  await L.card(p, 'open');
  await p.click('#fileList li:nth-child(1) [data-act=vis]'); await p.waitForTimeout(300);
  s = await lv(p);
  const duringVis = s.files[0];
  R.ok('LD9 ライブ中に一覧の 1 つ目のチェックを外す', !duringVis.vis && !duringVis.cb, duringVis);
  // ライブ中に 2 つ目のチェックを入れ直す（外して入れる）→ ライブ中に地図が出てしまうか
  await p.click('#fileList li:nth-child(2) [data-act=vis]'); await p.click('#fileList li:nth-child(2) [data-act=vis]'); await p.waitForTimeout(300);
  s = await lv(p);
  R.ok('LD10 ライブ中に 2 つ目のチェックを外して入れ直しても、ライブ中は地図を出さない（座標が合わない）', !s.files[1].pvis, s.files[1]);
  // 今の点群を開く
  await L.card(p, 'live');
  await p.click('#btnLiveSnap'); await L.idle(p);
  s = await lv(p);
  const snap = s.files.find(f => /^live_\d{8}_\d{6}\.pcd$/.test(f.name));
  R.ok('LD11 「今の点群を開く」→ live_年月日_時分秒.pcd が一覧に増える', !!snap, s.files.map(f => f.name));
  // 止める
  await L.card(p, 'live');
  await p.click('#btnLiveStop'); await p.waitForTimeout(500);
  s = await lv(p);
  R.ok('LD12 止める → 選ぶ画面に戻る・知らせ・ライブの点は消える', !s.now && s.pick && s.msg === 'ライブを止めました' && s.livePoints === false, s);
  R.ok('LD13 止めたあと、ライブ中にチェックを外したファイルは隠れたまま（チェックと表示が一致）', s.files.every(f => f.pvis === f.vis && f.cb === f.vis), s.files);
  R.ok('LD14 止めたあと、軌跡は元どおり表示', s.trajs.every(t => t.gvis === t.vis), s.trajs);
  await L.shot(p, 't13_LD13_after_stop');
  // デモ中に点群を全部閉じる → 止める
  await p.click('#btnLiveDemo'); await p.waitForTimeout(800);
  await L.closeAll(p); await p.waitForTimeout(1200);
  const r1 = await p.evaluate(() => document.getElementById('liveRate').textContent);
  await L.card(p, 'live'); await p.click('#btnLiveStop'); await p.waitForTimeout(400);
  s = await lv(p);
  R.ok('LD15 デモ中に点群を全部閉じても落ちず、止めると最初の画面（案内）に戻る', s.empty && !s.now, { r1, s: s.empty });
  R.ok('ページのエラーなし', !errors.length, errors.slice(0, 5));
  await close();
  process.exitCode = R.done() ? 1 : 0;
})().catch(e => { console.log('FATAL', e); process.exit(2); });
