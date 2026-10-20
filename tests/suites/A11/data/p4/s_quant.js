// 0.4.1 から: 画面には全部の点を持たない（f.positions はなく、先頭 20 万点の標本 f.sample だけ。点は読み込み時に混ぜてあるので無作為な標本）
const P = window.__pcd, S = P.S, f = S.files[0];
// x の値の種類（量子化の具合）
const xs = new Set(); let maxErr = 0;
for (let i = 0; i < (f.sample.length / 3); i++) xs.add(f.sample[3 * i] + S.offset[0]);
P.setView('top', false); await H.wait(800);
const hit = await H.pickLocal([f.sample[0], f.sample[1], f.sample[2]]);
return { offset: S.offset, n: f.n, distinctX: xs.size, sampleX: [...xs].slice(0, 8), hit };
