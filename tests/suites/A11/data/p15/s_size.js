// 「実際の大きさ」30 cm の点で、上の点の円の中（中心から 8 cm）をクリックしたとき、どちらの層が選ばれるか
const P = window.__pcd, S = P.S;
if (S.hideCeil) document.getElementById('btnCeil').click();
const sm = document.getElementById('sizeMode'); sm.value = 'm'; sm.dispatchEvent(new Event('change'));
const ps = document.getElementById('pointSize'); ps.value = 30; ps.dispatchEvent(new Event('input', { bubbles: true })); await H.wait(200);
P.setView('top', false); await H.wait(800);
const res = [];
for (const off of [0, 0.04, 0.08, 0.12]) {
  const c = H.proj([5, 5, 0]), e = H.proj([5 + off, 5, 0]);
  const hit = await H.pickXY(e.x, e.y);
  // 画面で 30 cm が何ピクセルか
  const q = H.proj([5.3, 5, 0]);
  res.push({ offset_m: off, offset_px: +(e.x - c.x).toFixed(1), pointDiameter_px: +Math.min(64, (q.x - c.x)).toFixed(1), hitZ: hit && +hit.local[2].toFixed(3) });
}
return { sizeVal: H.text('pointSizeVal'), res };
