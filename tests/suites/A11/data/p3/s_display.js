// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
const P = window.__pcd, S = P.S;
const q = s => [...document.querySelectorAll(s)].map(e => e.textContent.trim());
const out = { offset: S.offset, level: S.levelInfo && { tilt: S.levelInfo.tiltDeg, yaw: S.levelInfo.yawDeg, floorZ: S.levelInfo.floorZ }, ceilZ: S.ceilZ, bounds: S.bounds, fit: S.fit };
out.info = q('#info dt').map((k, i) => k + ' = ' + q('#info dd')[i]);
out.legend = q('#legend .ticks span');
out.dval = q('.dval');
out.secPos = H.text('secPosVal');
out.levelResult = H.text('levelResult');
// ヒストグラムの目盛り（drawHist と同じ式で）
const z = S.zSample, pc = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
out.histLabels = [pc(z, 0.001), pc(z, 0.999)];
// 座標の道具で、点 0 の位置をクリックする
P.setView('top', false); await H.wait(600);
document.querySelector('[data-tool="info"]').click(); await H.wait(200);
const f = S.files[0];
const picks = [];
for (const i of [0, 1, 2, 3]) {
  const l = [f.sample[3 * i], f.sample[3 * i + 1], f.sample[3 * i + 2]];
  const s = H.proj(l);
  await window.pwClick(s.x, s.y); await H.wait(700);
  const hit = await P.pickAt(s.x, s.y, true);
  picks.push({ target: l, box: H.pinText(), hitLocal: hit && hit.local.toArray(), hitWorld: hit && hit.world.toArray() });
}
out.picks = picks;
// 天井を切り替えたときの知らせ
document.getElementById('btnCeil').click(); await H.wait(100); out.ceilMsg1 = H.text('statMsg');
document.getElementById('btnCeil').click(); await H.wait(100); out.ceilMsg2 = H.text('statMsg');
return out;
