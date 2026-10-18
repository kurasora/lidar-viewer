const P = window.__pcd, S = P.S, f = S.files[0];
// x の値の種類（量子化の具合）
const xs = new Set(); let maxErr = 0;
for (let i = 0; i < f.n; i++) xs.add(f.positions[3 * i] + S.offset[0]);
P.setView('top', false); await H.wait(800);
const hit = await H.pickLocal([f.positions[0], f.positions[1], f.positions[2]]);
return { offset: S.offset, n: f.n, distinctX: xs.size, sampleX: [...xs].slice(0, 8), hit };
