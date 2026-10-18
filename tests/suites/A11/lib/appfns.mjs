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
  const m = Math.min(n, sampleN), z = [];
  for (let i = 0; i < m; i++) z.push(R[2][0] * positions[3 * i] + R[2][1] * positions[3 * i + 1] + R[2][2] * positions[3 * i + 2] - fz);
  z.sort((a, b) => a - b);
  return { c: findCeiling(z), z };
}
