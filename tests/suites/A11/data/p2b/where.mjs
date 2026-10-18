// worker の shuffle（種 12345 の xorshift）で、入力の k 番目の点が何番目に移るかを調べる
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const n = +process.argv[2], idx = new Int32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
const r = rng(12345);
for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); if (i === j) continue; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
const pos = new Int32Array(n); for (let i = 0; i < n; i++) pos[idx[i]] = i;
// 最後の 20 個の入力番号の行き先
const out = []; for (let k = n - 20; k < n; k++) out.push([k, pos[k]]);
console.log(JSON.stringify(out));
