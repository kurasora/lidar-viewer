import { loadFile } from '/home/claude/pcd-viewer/src/io/index.js';
import { readFileSync } from 'node:fs';
const exp = JSON.parse(readFileSync('expect_tif.json', 'utf8'));
for (const name of ['dem_area', 'dem_point', 'dem_rot']) {
  const { sink, info } = await loadFile(new Blob([readFileSync(name + '.tif')]), name + '.tif', { cap: 1e7, offset: null, companions: {} }, () => {});
  const r = sink.finish();
  const got = []; for (let i = 0; i < r.n; i++) got.push([r.positions[3 * i] + r.offset[0], r.positions[3 * i + 1] + r.offset[1], r.positions[3 * i + 2] + r.offset[2]]);
  let maxd = 0; for (let i = 0; i < got.length; i++) maxd = Math.max(maxd, Math.hypot(got[i][0] - exp[name][i][0], got[i][1] - exp[name][i][1]));
  console.log(JSON.stringify({ name, format: info.format, n: r.n, first: got[0], expectFirst: exp[name][0], maxXYerr_m: +maxd.toFixed(4) }));
}
