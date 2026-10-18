const P = window.__pcd, S = P.S;
const out = { offset: S.offset, trajs: S.trajs.map(t => ({ name: t.name, count: t.count, length: t.length, duration: t.duration, first: Array.from(t.P.slice(0, 3)), last: Array.from(t.P.slice(-3)) })) };
out.listText = H.q('#trajList .sub');
const f = S.files[0];
if (f) {
  const b = f.bbox; out.mapBboxLocal = b;
  const c = [0, 1, 2].map(k => (b.min[k] + b.max[k]) / 2);
  out.trajToMapCenter = S.trajs.map(t => Math.hypot(t.P[0] - c[0], t.P[1] - c[1], t.P[2] - c[2]));
}
// 「軌跡に沿って動かす」で中心を動かすと、点群の近くに来るか
const s = document.getElementById('trajPos');
if (s && !document.getElementById('trajMoveRow').hidden) {
  s.value = 500; s.dispatchEvent(new Event('input', { bubbles: true })); await H.wait(300);
  out.centerAfterTrajMove = P.controlsTarget();
}
return out;
