const P = window.__pcd, S = P.S, f = S.files[0];
let mx = -Infinity, at = -1; for (let i = 0; i < f.n; i++) if (f.positions[3 * i] > mx) { mx = f.positions[3 * i]; at = i; }
const info = H.info();
// x の下限のつまみだけを 1 目盛り右へ → x=50 の点はまだ見えるか（上限は触らない）
const lo = document.querySelectorAll('#clipX input')[0]; lo.value = 1; lo.dispatchEvent(new Event('input', { bubbles: true })); await H.wait(200);
const clipMaxX = document.querySelector('#clipX .dval').textContent;
return { trueMaxX: mx, positionInShuffled: at, bbox: f.bbox, infoX: info['範囲 x'], clipAfterMovingLowerOnly: clipMaxX };
