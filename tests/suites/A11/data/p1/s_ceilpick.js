const P = window.__pcd, S = P.S;
const out = { level: S.levelInfo && { tilt: S.levelInfo.tiltDeg, yaw: S.levelInfo.yawDeg, floorZ: S.levelInfo.floorZ }, ceilZ: S.ceilZ, hideCeil: S.hideCeil, msg: H.text('statMsg') };
P.setView('top', false); await H.wait(500);
// 床の上の点（局所座標）を狙う
out.top = [];
for (const t of [[10, 1.5, 0], [5, 0.7, 0], [15, 2.2, 0]]) out.top.push({ target: t, hit: await H.pickLocal(t) });
P.setView('iso', false); await H.wait(500);
out.iso = [];
for (const t of [[10, 1.5, 0], [12, 1.0, 0]]) out.iso.push({ target: t, hit: await H.pickLocal(t) });
// 天井を表示に切り替えて同じ点を狙う
document.getElementById('btnCeil').click(); await H.wait(300);
out.hideCeilAfterToggle = S.hideCeil;
P.setView('top', false); await H.wait(500);
out.topShown = await H.pickLocal([10, 1.5, 0]);
return out;
