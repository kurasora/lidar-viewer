// SHP の記録の長さが −4 語（−8 バイト）: 次の記録の位置が同じになる。エラーか、読める所までで終わるべき
import { tryRead } from '../lib/read.mjs';
const b = new Uint8Array(100 + 8 + 28); const dv = new DataView(b.buffer);
dv.setInt32(0, 9994, false); dv.setInt32(24, b.length / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, 1, true);
dv.setInt32(100, 1, false); dv.setInt32(104, -4, false); dv.setInt32(108, 1, true); dv.setFloat64(112, 3, true); dv.setFloat64(120, 4, true);
const t = await tryRead('loop.shp', b);
console.log(t.ok ? `終わった n=${t.r.n}` : `エラー: ${t.error}`);
process.exit(0);
