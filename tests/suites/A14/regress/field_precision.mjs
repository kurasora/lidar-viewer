// 値の欄（time・timestamp など）が読み込みでどれだけ丸められるか: 欄ごとに 異なる値の数・最小・最大
//   node field_precision.mjs <ファイル>...
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const { loadFile } = await import('/home/claude/pcd-viewer/src/io/index.js');
for (const f of process.argv.slice(2)) {
  const { sink } = await loadFile(new Blob([readFileSync(f)]), basename(f), { cap: 3e7, offset: null, companions: {} }, () => {});
  const r = sink.finish();
  const out = {};
  for (const [k, a] of Object.entries(r.fields)) {
    const u = new Set(a); let mn = Infinity, mx = -Infinity; for (const v of a) { if (v < mn) mn = v; if (v > mx) mx = v; }
    out[k] = { type: a.constructor.name, uniq: u.size, min: mn, max: mx, span: mx - mn };
  }
  console.log(JSON.stringify({ file: basename(f), n: r.n, fields: out }));
}
