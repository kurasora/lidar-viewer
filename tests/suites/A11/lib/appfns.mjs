// app.js から純粋な計算の関数を取り出して Node で使う（コードを写さず、毎回いまの app.js から切り出す）
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/claude/pcd-viewer/src/app.js', 'utf8');
function grab(name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('not found ' + name);
  // 中かっこの対応で関数の終わりを探す
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); } }
  throw new Error('unbalanced ' + name);
}
const code = ['percentile', 'findCeiling'].map(grab).join('\n') + '\nreturn { percentile, findCeiling };';
export const { percentile, findCeiling } = new Function(code)();
// updateCeiling（水平補正済み）と同じ計算: world の標本の z → 天井
export function ceilingAfterLevel(positions, n, r, { alignCorr = true, floorZero = true, sampleN = 400000 } = {}) {
  const R = alignCorr ? r.R : r.R1, fz = floorZero && r.floorZ != null ? r.floorZ : 0;
  // 0.4.2 の app.js: findCeiling(z, xs, ys, 床の高さの手がかり, 厳しく) — 天井は「高さの層が覆う広さ」で決める（xy も要る）
  const m = Math.min(n, sampleN), z = [], xs = [], ys = [];
  for (let i = 0; i < m; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], w = positions[3 * i + 2];
    xs.push(R[0][0] * x + R[0][1] * y + R[0][2] * w); ys.push(R[1][0] * x + R[1][1] * y + R[1][2] * w);
    z.push(R[2][0] * x + R[2][1] * y + R[2][2] * w - fz);
  }
  const floorHint = r.floorZ != null ? (floorZero ? 0 : r.floorZ) : null;
  return { c: findCeiling(z, xs, ys, floorHint, false), z: z.slice().sort((a, b) => a - b) };
}
