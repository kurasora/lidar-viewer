// app.js の updateBounds → updateCeiling と同じ計算（標本の取り方と並べ替え）を Node で再現して、ファイル数ごとの時間を測る
//   node sim_bounds.mjs [1 ファイルの点数=20000] [ファイル数の列=1,10,50,100,200]
const nPer = +(process.argv[2] || 20000);
const counts = (process.argv[3] || '1,10,50,100,200').split(',').map(Number);
function sampleWorld(n, maxN) { const m = Math.min(n, maxN); const out = new Float32Array(m * 3); for (let i = 0; i < out.length; i++) out[i] = Math.random() * 50; return out; }
function updateBounds(files) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const axes3 = [[], [], []]; const worldSample = [];
  for (const n of files) {
    const s = sampleWorld(n, Math.max(50000, Math.floor(400000 / files.length)));
    worldSample.push(s);
    for (let i = 0; i < s.length; i += 3) for (let k = 0; k < 3; k++) { const v = s[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; axes3[k].push(v); }
  }
  for (let k = 0; k < 3; k++) axes3[k].sort((a, b) => a - b);
  // updateCeiling
  const z = [];
  for (const smp of worldSample) for (let i = 0; i < smp.length; i += 3) z.push(smp[i + 2]);
  z.sort((a, b) => a - b);
  return axes3[0].length;
}
const out = [];
for (const c of counts) {
  const files = Array(c).fill(nPer);
  const t = performance.now();
  const s = updateBounds(files);
  out.push({ files: c, samples: s, ms: Math.round(performance.now() - t) });
}
// 1 個ずつ開いたときの合計（k = 1..max の和）を、測った点から補間して見積もる
console.log(JSON.stringify({ nPer, rows: out }));
