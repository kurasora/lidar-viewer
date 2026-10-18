// 透視で部屋の中に入ってから平行投影に切り替え、画面の中心を選ぶ
const P = window.__pcd, S = P.S, f = S.files[0];
if (S.hideCeil) document.getElementById('btnCeil').click();
P.setView('iso', false); await H.wait(600);
const r = H.canvas().getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
await window.pwMove(cx, cy);
for (let i = 0; i < (ARGS && ARGS.wheel || 8); i++) { await window.pwWheel(0, -1000); await H.wait(120); }
await H.wait(500);
const tgt = new H.V3(...P.controlsTarget());
const out = { camDistBefore: P.cam.position.distanceTo(tgt), camPos: P.cam.position.toArray(), target: tgt.toArray() };
// ray（中心の視線）の上にある点: カメラの前（t>0）と後ろ（t<0）
const along = (cam) => {
  P.world.updateMatrixWorld(true);
  const inv = P.world.matrixWorld.clone().invert();
  const o = cam.position.clone().applyMatrix4(inv);
  const d = tgt.clone().sub(cam.position).normalize().transformDirection(inv);
  let front = null, back = null;
  for (let i = 0; i < f.n; i++) {
    const v = [f.positions[3 * i] - o.x, f.positions[3 * i + 1] - o.y, f.positions[3 * i + 2] - o.z];
    const t = v[0] * d.x + v[1] * d.y + v[2] * d.z;
    const perp = Math.sqrt(Math.max(0, v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - t * t));
    if (perp > 0.05) continue;
    if (t > 0 && (!front || t < front.t)) front = { t, p: [f.positions[3 * i], f.positions[3 * i + 1], f.positions[3 * i + 2]] };
    if (t < 0 && (!back || t < back.t)) back = { t, p: [f.positions[3 * i], f.positions[3 * i + 1], f.positions[3 * i + 2]] };
  }
  return { front, back };
};
out.perspPick = await H.pickXY(cx, cy);
out.perspAlong = along(P.cam);
await window.pwKey('p'); await H.wait(600);
out.isOrtho = !!P.cam.isOrthographicCamera;
out.orthoAlong = along(P.cam);
out.orthoPick = await H.pickXY(cx, cy);
await window.pwShot(ARGS && ARGS.shot || 'shot_ortho.png');
return out;
