import { workerFns } from '../regress/lib/workerfns.mjs';
const W = workerFns();
let s = 4242; const g = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
const gauss = () => { let u = 0, v = 0; while (!u) u = g(); while (!v) v = g(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const n = 150000, P = new Float32Array(3 * n);
for (let i = 0; i < n; i++) { const t = g(); let p = t < 0.35 ? [g() * 40, g() * 3, 0] : t < 0.7 ? [g() * 40, g() * 3, 2.6] : t < 0.85 ? [g() * 40, 0, g() * 2.6] : [g() * 40, 3, g() * 2.6]; p = p.map(v => v + gauss() * 0.01); P.set(p, 3 * i); }
const nm = W.voxelNormals(P, n, 0.3);
console.log('voxelNormals の数', nm.length);
// 1 つのボクセルの共分散と固有値を直接見る
const cells = new Map();
for (let i = 0; i < n; i++) { const key = `${Math.floor(P[3*i]/0.3)},${Math.floor(P[3*i+1]/0.3)},${Math.floor(P[3*i+2]/0.3)}`; (cells.get(key) || cells.set(key, []).get(key)).push(i); }
let shown = 0;
for (const [k, ids] of cells) {
  if (ids.length < 30 || shown >= 3) continue; shown++;
  const m = [0,0,0]; for (const i of ids) for (let d=0; d<3; d++) m[d] += P[3*i+d]/ids.length;
  const C = [[0,0,0],[0,0,0],[0,0,0]]; for (const i of ids) for (let a=0;a<3;a++) for (let b=0;b<3;b++) C[a][b] += (P[3*i+a]-m[a])*(P[3*i+b]-m[b])/ids.length;
  const r = W.jacobiEigen(C);
  console.log(k, ids.length, 'C', JSON.stringify(C.map(r => r.map(v => +v.toExponential(2)))), '固有値', r.values.map(v => v.toExponential(2)));
}
// 同じ点群を Float64Array で
const nm2 = W.voxelNormals(Float64Array.from(P), n, 0.3);
console.log('Float64Array で voxelNormals の数', nm2.length);
// worker の中の jacobiEigen を 1 つの行列で
console.log(JSON.stringify(W.jacobiEigen([[0.0075,0,0],[0,0.0075,0],[0,0,1e-4]])));
console.log(JSON.stringify(W.jacobiEigen([[0.0075,1e-5,2e-6],[1e-5,0.0075,3e-6],[2e-6,3e-6,1e-4]])));
