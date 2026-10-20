// 開いたときの自動の水平補正ができない点群（点の少ない部屋）で、右上の知らせが赤い誤りにならないか（A11-010）
//   0.4.0 から: 自動の補正ができないときは知らせを赤にせず、補正のカードに「自動の水平補正はしていません」と書く
await H.wait(1500);
const el = document.getElementById('statMsg');
return { msg: el.textContent, red: !!el.style.color, levelResult: H.text('levelResult'), level: !!window.__pcd.S.levelInfo };
