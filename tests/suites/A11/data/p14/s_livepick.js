// ライブ（デモ）の表示中に、隠れた地図の点を選んでしまわないか
const P = window.__pcd, S = P.S;
document.querySelector('[data-open="live"]').click(); await H.wait(300);
document.getElementById('btnLiveDemo').click(); await H.wait(1500);
const mapVisible = S.files.map(f => f.points.visible);
const r = H.canvas().getBoundingClientRect();
const hits = [];
for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.6], [0.6, 0.4]]) hits.push(await H.pickXY(r.left + r.width * fx, r.top + r.height * fy));
document.getElementById('btnLiveStop').click(); await H.wait(300);
return { mapVisibleDuringLive: mapVisible, fileVisibleFlag: S.files.map(f => f.visible), hits };
