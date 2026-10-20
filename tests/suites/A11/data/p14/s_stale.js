// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
// 座標の吹き出しを出したあとに水平補正を元に戻すと、吹き出しの数値はどうなるか
const P = window.__pcd, S = P.S, f = S.files[0];
if (S.hideCeil) document.getElementById('btnCeil').click();
P.setView('top', false); await H.wait(600);
document.querySelector('[data-tool="info"]').click(); await H.wait(200);
const l = [f.sample[0], f.sample[1], f.sample[2]], s = H.proj(l);
await window.pwClick(s.x, s.y); await H.wait(700);
const before = H.pinText(), pickLocal = P.S.pick && P.S.pick.toArray();
document.getElementById('btnLevelReset').click(); await H.wait(1500);
const after = H.pinText();
// 戻したあとの同じ点の「表示されるべき」座標（world + offset）
P.world.updateMatrixWorld(true);
const w = new H.V3(...pickLocal).applyMatrix4(P.world.matrixWorld).toArray().map((v, k) => v + S.offset[k]);
return { before, after, pickLocalPlusOffset: pickLocal.map((v, k) => v + S.offset[k]), worldAfterReset: w, levelInfo: S.levelInfo };
