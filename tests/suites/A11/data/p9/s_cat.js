// 分類の色分け: 凡例の色と、実際に描かれた色を比べる
const P = window.__pcd, S = P.S, f = S.files[0];
const sel = document.getElementById('fieldSel'); sel.value = 'classification';
const cm = document.getElementById('colorMode'); cm.value = 'field'; cm.dispatchEvent(new Event('change')); await H.wait(800);
P.setView('top', false); await H.wait(800);
const legend = [...document.querySelectorAll('#legend .cats span')].map(s => ({ text: s.textContent, color: getComputedStyle(s.querySelector('i')).backgroundColor }));
// 描いて、各区画の中心の画素の色を読む
const R = P.renderer, gl = R.getContext();
R.render(P.world.parent, P.cam);
const px = (l) => { const s = H.proj(l), r = H.canvas().getBoundingClientRect(), dpr = R.getPixelRatio(); const x = Math.round((s.x - r.left) * dpr), y = Math.round((r.bottom - s.y) * dpr); const b = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return Array.from(b.slice(0, 3)); };
const drawn = [1, 2, 6, 64, 65].map((c, k) => ({ cls: c, rgb: px([k * 6 + 2, 2, 0]) }));
return { legend, drawn, catMin: S.files[0].stats.classification };
