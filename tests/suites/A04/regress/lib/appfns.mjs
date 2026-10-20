// src/app.js の中の純粋な関数を取り出す（DOM・three.js を使わないもの）
import { evalDecls, readSrc, topLevel } from './extract.mjs';
export function appFns() {
  const code = readSrc('src/app.js');
  const names = ['fmtN', 'fmt', 'CMAPS', 'CAT_COLORS', 'FILE_COLORS', 'eqData', 'updateEq', 'cssGradient', 'percentile', 'findCeiling', 'extOf', 'IMAGE_EXT', 'isTrajectory', 'companionsOf', 'OPEN_TYPES', 'TRAJ_TYPES', 'pickerTypes', 'escapeHtml'];
  // eqTex は updateEq が needsUpdate を立てるだけの入れ物
  return evalDecls(code, names, {}, 'const eqTex = { needsUpdate: false }; const tr = s => s; // tr: 0.4.2 からの English の訳（ここでは日本語のまま）');
}
// 頂点シェーダー（文字列）を取り出す
export function vertexShader() {
  const s = topLevel(readSrc('src/app.js')).get('VERT');
  return s.slice(s.indexOf('`') + 1, s.lastIndexOf('`'));
}
