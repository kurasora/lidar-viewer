// A03: PCD・LAS・PLY の構造を意識した改ざん
import { makeSet, seed, cat, te, f32, u32, patch, le } from './lib.mjs';
const S = makeSet('pcdlasply');
const hdr = (o = {}) => {
  const h = { FIELDS: 'x y z', SIZE: '4 4 4', TYPE: 'F F F', COUNT: '1 1 1', WIDTH: '10', HEIGHT: '1', POINTS: '10', DATA: 'ascii', ...o };
  return Object.entries(h).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${v}`).join('\n') + '\n';
};
const asciiPts = (n, cols = 3) => Array.from({ length: n }, (_, i) => Array.from({ length: cols }, (_, k) => (i + k * 0.5).toFixed(3)