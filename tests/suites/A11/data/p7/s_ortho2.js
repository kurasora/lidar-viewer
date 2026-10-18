// 透視で部屋の中に入り、平行投影に切り替えて少し引く。画面の中心に描かれている点（色で判定）と、選ばれる点を比べる
const P = window.__pcd, S = P.S;
const cm = document.getElementById('colorMode'); cm.value = 'single'; cm.dispatchEvent(new Event('change')); await H.wait(300);
if (S.hideCeil) document.getElementById('btnCeil').click();
const colors = S.files.map(f => ({ name: f.name, color: f.color }));
P.setView('iso', false); await H.wait(600);
const r = H.canvas().getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
await window.pwMove(cx, cy);
for (let i = 0; i < 8; i++) { await window.pwWheel(0, -1000); await H.wait(120); }
await H.wait(400);
const readCenter = () => { const R = P.renderer, gl = R.getContext(); R.render(P.world.parent, P.cam); const dpr = R.getPixelRatio(); const b = new Uint8Array(4); gl.readPixels(Math.round(r.width / 2 * dpr), Math.round(r.height / 2 * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return Array.from(b.slice(0, 3)); };
const out = { colors, persp: { center: readCenter(), pick: await H.pickXY(cx, cy) } };
await window.pwKey('p'); await H.wait(500);
for (let i = 0; i < 4; i++) { await window.pwWheel(0, 1000); await H.wait(120); }   // 平行投影で引く（zoom を下げる。カメラの位置は部屋の中のまま）
await H.wait(500);
out.ortho = { isOrtho: !!P.cam.isOrthographicCamera, camPos: P.cam.position.toArray(), viewH: (P.cam.top - P.cam.bottom) / P.cam.zoom, center: readCenter(), pick: await H.pickXY(cx, cy) };
await window.pwShot(ARGS && ARGS.shot || 'shot_ortho2.png');
return out;
