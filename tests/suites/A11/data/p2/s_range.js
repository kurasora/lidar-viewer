// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
const P = window.__pcd, S = P.S;
const q = s => [...document.querySelectorAll(s)].map(e => e.textContent.trim());
const f = S.files[0];
// 本当の範囲（読み込んだ全点、シフトを足す）
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < (f.sample.length / 3); i++) for (let k = 0; k < 3; k++) { const v = f.sample[3 * i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
const out = { n: f.n, level: !!S.levelInfo, trueLocal: { lo, hi }, bbox: f.bbox, info: q('#info dt').map((k, i) => k + ' = ' + q('#info dd')[i]).filter(s => /範囲|点数|間隔/.test(s)), dval: q('.dval') };
// x の切り出しの上限だけを 1 目盛り動かすと、x=50 の点はどうなるか（下限側はそのまま）
const hiX = document.querySelectorAll('#clipX input')[1];
hiX.value = 999; hiX.dispatchEvent(new Event('input', { bubbles: true })); await H.wait(200);
out.clipAfterMovingXHi = { min: P.S && window.__pcd.renderer && null };
out.uClip = document.querySelector('#clipX .dval').textContent;
return out;
