// src/worker.js の計算部分を取り出す（self.onmessage などはそのまま評価されるが、使わない）
import { evalDecls, readSrc } from './extract.mjs';
export function workerFns() {
  const code = readSrc('src/worker.js');
  const names = ['rng', 'shuffle', 'fieldStats', 'bbox', 'buildIndex', 'pointSpacing', 'pickIn', 'jacobiEigen', 'voxelNormals', 'refitPlane', 'dominantAxis', 'rotationTo', 'mul', 'apply', 'analyze'];
  return evalDecls(code, names, {}, '', true); // 下請けの関数・定数（COARSE・norm など）も取り込む
}
