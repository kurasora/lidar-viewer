// A03: 種ファイルの一覧（付属ファイルの組み合わせ・Node で読めるかどうか）
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
export const SEED_DIR = '/home/claude/pcd-viewer/sample/formats';
// Node では動かない（wasm・createImageBitmap・画面側で読む）もの
export const BROWSER_ONLY = /\.(laz|drc|ifc|step|stp|png|jpe?g|gif|bmp|webp|ico|cur|icns|svgz?|fbx|dae|pov|icm|wrl)$/i;
const COMP = {
  'cc_cloud.sbf': ['cc_cloud.sbf.data'],
  'pyshp_lines.shp': ['pyshp_lines.dbf', 'pyshp_lines.shx'],
  'pyshp_points.shp': ['pyshp_points.dbf', 'pyshp_points.shx'],
};
const SKIP_MAIN = new Set(['cc_cloud.sbf.data', 'pyshp_lines.dbf', 'pyshp_lines.shx', 'pyshp_points.dbf', 'pyshp_points.shx', 'pov_scan0.asc', 'pov_scan1.asc', 'icm_cloud.asc', 'icm_images.wrl']);
export function seeds({ nodeOnly = true } = {}) {
  const out = [];
  for (const f of readdirSync(SEED_DIR).sort()) {
    if (SKIP_MAIN.has(f)) continue;
    if (nodeOnly && BROWSER_ONLY.test(f)) continue;
    out.push({ name: f, file: join(SEED_DIR, f), companions: (COMP[f] || []).map(c => ({ path: join(SEED_DIR, c), name: c })) });
  }
  return out;
}
